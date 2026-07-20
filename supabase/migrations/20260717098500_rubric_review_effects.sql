-- WF-04: version-bound rubrics and one atomic, scored trainer decision.

create table public.task_rubric_assignments (
  id uuid primary key default app_private.uuid7(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  task_id uuid not null references public.tasks(id) on delete cascade,
  content_version_id uuid not null references public.content_versions(id) on delete restrict,
  rubric_id uuid not null references public.rubrics(id) on delete restrict,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default statement_timestamp(),
  constraint task_rubric_assignments_scope_unique
    unique (organization_id, task_id, content_version_id)
);

create index task_rubric_assignments_task_idx
  on public.task_rubric_assignments (task_id, content_version_id, organization_id);
create index task_rubric_assignments_version_idx
  on public.task_rubric_assignments (content_version_id, task_id);
create index task_rubric_assignments_rubric_idx
  on public.task_rubric_assignments (rubric_id, organization_id);
create index task_rubric_assignments_created_by_idx
  on public.task_rubric_assignments (created_by) where created_by is not null;

create or replace function app_private.validate_task_rubric_assignment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.tasks task_row
    join public.content_versions version_row
      on version_row.id = new.content_version_id
     and version_row.course_id = task_row.course_id
    join public.rubrics rubric_row
      on rubric_row.id = new.rubric_id
     and rubric_row.organization_id = new.organization_id
    where task_row.id = new.task_id
      and task_row.content_version_id = new.content_version_id
  ) then
    raise exception 'rubric assignment scope does not match task content version and organization'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke all on function app_private.validate_task_rubric_assignment() from public, anon, authenticated;

create trigger task_rubric_assignments_validate
before insert or update on public.task_rubric_assignments
for each row execute function app_private.validate_task_rubric_assignment();

alter table public.task_rubric_assignments enable row level security;
alter table public.task_rubric_assignments force row level security;

revoke all on public.task_rubric_assignments from anon, authenticated;
grant select, insert, update, delete on public.task_rubric_assignments to authenticated;

create policy task_rubric_assignments_scoped_read
on public.task_rubric_assignments for select to authenticated
using (
  (select app_private.is_active_organization_member(organization_id))
  or (select app_private.has_permission('content.manage', organization_id))
);

create policy task_rubric_assignments_content_write
on public.task_rubric_assignments for all to authenticated
using ((select app_private.has_permission('content.manage', organization_id)))
with check ((select app_private.has_permission('content.manage', organization_id)));

create policy rubric_criteria_scoped_read
on public.rubric_criteria for select to authenticated
using (exists (
  select 1 from public.rubrics rubric_row
  where rubric_row.id = rubric_id
    and (
      (select app_private.is_active_organization_member(rubric_row.organization_id))
      or (select app_private.has_permission('content.manage', rubric_row.organization_id))
    )
));

create policy rubric_criteria_content_write
on public.rubric_criteria for all to authenticated
using (exists (
  select 1 from public.rubrics rubric_row
  where rubric_row.id = rubric_id
    and (select app_private.has_permission('content.manage', rubric_row.organization_id))
))
with check (exists (
  select 1 from public.rubrics rubric_row
  where rubric_row.id = rubric_id
    and (select app_private.has_permission('content.manage', rubric_row.organization_id))
));

create policy review_rubric_scores_scoped_read
on public.review_rubric_scores for select to authenticated
using (exists (
  select 1 from public.reviews review_row
  where review_row.id = review_id
    and (select app_private.can_access_submission(review_row.submission_id))
));

drop function public.decide_submission(
  uuid, uuid, bigint, public.review_decision, text, text, uuid
);

create or replace function public.decide_submission(
  p_submission_id uuid,
  p_submission_version_id uuid,
  p_expected_version bigint,
  p_decision public.review_decision,
  p_comment text,
  p_criterion_scores jsonb,
  p_idempotency_key text,
  p_correlation_id uuid
)
returns public.submissions
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  submission_row public.submissions;
  existing_review public.reviews;
  target_version public.submission_versions;
  target_state public.submission_state;
  attempt_target public.attempt_state;
  assigned_rubric_id uuid;
  review_id uuid;
  review_evidence_id uuid := app_private.uuid7();
  mastery_event_id uuid;
  previous_mastery integer;
  mastery_row record;
begin
  if actor_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if p_decision not in ('accepted', 'revision_required')
     or nullif(btrim(p_comment), '') is null
     or length(p_idempotency_key) not between 16 and 200 then
    raise exception 'valid decision, comment and idempotency key are required' using errcode = '22023';
  end if;
  if p_criterion_scores is null
     or jsonb_typeof(p_criterion_scores) <> 'array'
     or jsonb_array_length(p_criterion_scores) = 0
     or exists (
       select 1
       from jsonb_array_elements(p_criterion_scores) score
       where jsonb_typeof(score) <> 'object'
          or jsonb_typeof(score -> 'criterion_id') <> 'string'
          or jsonb_typeof(score -> 'points') <> 'number'
          or not ((score ->> 'criterion_id') ~
            '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$')
     ) then
    raise exception 'criterion scores must be a non-empty array of criterion UUIDs and numeric points'
      using errcode = '22023';
  end if;
  if (
    select count(*) <> count(distinct (score ->> 'criterion_id'))
    from jsonb_array_elements(p_criterion_scores) score
  ) then
    raise exception 'criterion scores contain duplicates' using errcode = '22023';
  end if;

  select submission_record.* into submission_row
  from public.submissions submission_record
  where submission_record.id = p_submission_id
  for update;

  if submission_row.id is null
     or not (select app_private.can_train_cohort(submission_row.cohort_id)) then
    raise exception 'review scope denied' using errcode = '42501';
  end if;

  select version_record.* into target_version
  from public.submission_versions version_record
  where version_record.id = p_submission_version_id
    and version_record.submission_id = submission_row.id
    and version_record.version_number = submission_row.latest_version_number;
  if target_version.id is null then
    raise exception 'review must target latest submission version' using errcode = '40001';
  end if;

  select assignment.rubric_id into assigned_rubric_id
  from public.task_rubric_assignments assignment
  join public.rubrics rubric_row
    on rubric_row.id = assignment.rubric_id
   and rubric_row.organization_id = submission_row.organization_id
   and rubric_row.state = 'active'
  where assignment.organization_id = submission_row.organization_id
    and assignment.task_id = submission_row.task_id
    and assignment.content_version_id = (target_version.task_snapshot ->> 'content_version_id')::uuid;
  if assigned_rubric_id is null then
    raise exception 'no active rubric is assigned to this task content version' using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_criterion_scores) score
    left join public.rubric_criteria criterion
      on criterion.id = (score ->> 'criterion_id')::uuid
     and criterion.rubric_id = assigned_rubric_id
    where criterion.id is null
       or (score ->> 'points')::numeric < 0
       or (score ->> 'points')::numeric > criterion.max_points
  ) then
    raise exception 'criterion is outside the assigned rubric or points are out of range'
      using errcode = '22023';
  end if;

  if exists (
    select 1
    from public.rubric_criteria criterion
    where criterion.rubric_id = assigned_rubric_id
      and criterion.required_for_acceptance
      and not exists (
        select 1 from jsonb_array_elements(p_criterion_scores) score
        where (score ->> 'criterion_id')::uuid = criterion.id
      )
  ) then
    raise exception 'a required rubric criterion is missing' using errcode = '22023';
  end if;

  select review_record.* into existing_review
  from public.reviews review_record
  where review_record.submission_id = p_submission_id
    and review_record.idempotency_key = p_idempotency_key;
  if existing_review.id is not null then
    if existing_review.submission_version_id <> p_submission_version_id
       or existing_review.decision <> p_decision
       or existing_review.comment <> p_comment
       or (select count(*) from public.review_rubric_scores score where score.review_id = existing_review.id)
          <> jsonb_array_length(p_criterion_scores)
       or exists (
         select 1
         from jsonb_array_elements(p_criterion_scores) incoming
         where not exists (
           select 1 from public.review_rubric_scores stored
           where stored.review_id = existing_review.id
             and stored.criterion_id = (incoming ->> 'criterion_id')::uuid
             and stored.points = (incoming ->> 'points')::numeric
             and coalesce(stored.comment, '') = coalesce(nullif(btrim(incoming ->> 'comment'), ''), '')
         )
       ) then
      raise exception 'idempotency key was reused with a different review payload'
        using errcode = '22023';
    end if;
    return submission_row;
  end if;

  if submission_row.row_version <> p_expected_version
     or submission_row.state not in ('submitted', 'resubmitted') then
    raise exception 'submission is stale or not reviewable' using errcode = '40001';
  end if;

  insert into public.reviews (
    organization_id, submission_id, submission_version_id, reviewer_id,
    decision, comment, idempotency_key, expected_submission_row_version
  ) values (
    submission_row.organization_id, submission_row.id, p_submission_version_id, actor_id,
    p_decision, p_comment, p_idempotency_key, p_expected_version
  ) returning id into review_id;

  insert into public.review_rubric_scores (review_id, criterion_id, points, comment)
  select
    review_id,
    (score ->> 'criterion_id')::uuid,
    (score ->> 'points')::numeric,
    nullif(btrim(score ->> 'comment'), '')
  from jsonb_array_elements(p_criterion_scores) score;

  insert into public.evidence (
    id, organization_id, owner_id, task_id, submission_version_id,
    evidence_kind, title, sha256_hex, metadata
  ) values (
    review_evidence_id,
    submission_row.organization_id,
    submission_row.learner_id,
    submission_row.task_id,
    p_submission_version_id,
    'review',
    'Trainer rubric review for submission ' || submission_row.id::text,
    encode(extensions.digest(review_id::text || ':' || p_submission_version_id::text, 'sha256'), 'hex'),
    jsonb_build_object(
      'review_id', review_id,
      'rubric_id', assigned_rubric_id,
      'decision', p_decision,
      'criterion_scores', p_criterion_scores
    )
  );

  if p_decision = 'accepted' then
    for mastery_row in
      select
        criterion.skill_id,
        least(10000, greatest(0,
          round(sum(score.points) / sum(criterion.max_points) * 10000)::integer
        )) as mastery_basis_points
      from public.review_rubric_scores score
      join public.rubric_criteria criterion on criterion.id = score.criterion_id
      where score.review_id = review_id and criterion.skill_id is not null
      group by criterion.skill_id
    loop
      select snapshot.mastery_basis_points into previous_mastery
      from public.mastery_snapshots snapshot
      where snapshot.learner_id = submission_row.learner_id
        and snapshot.skill_id = mastery_row.skill_id;
      previous_mastery := coalesce(previous_mastery, 0);
      mastery_event_id := app_private.uuid7();

      insert into public.mastery_events (
        id, organization_id, learner_id, skill_id, evidence_id,
        previous_basis_points, new_basis_points, rule_version,
        rationale, source_event_id
      ) values (
        mastery_event_id, submission_row.organization_id, submission_row.learner_id,
        mastery_row.skill_id, review_evidence_id, previous_mastery,
        mastery_row.mastery_basis_points, 1,
        'Trainer-approved rubric review', review_id
      );

      insert into public.mastery_snapshots (
        learner_id, skill_id, organization_id, mastery_basis_points,
        source_event_id, rule_version
      ) values (
        submission_row.learner_id, mastery_row.skill_id, submission_row.organization_id,
        mastery_row.mastery_basis_points, mastery_event_id, 1
      )
      on conflict (learner_id, skill_id) do update
      set organization_id = excluded.organization_id,
          mastery_basis_points = excluded.mastery_basis_points,
          source_event_id = excluded.source_event_id,
          rule_version = excluded.rule_version,
          updated_at = statement_timestamp();
    end loop;
  end if;

  target_state := (case p_decision
    when 'accepted' then 'accepted'
    else 'revision_required'
  end)::public.submission_state;
  attempt_target := (case p_decision
    when 'accepted' then 'accepted'
    else 'revision_required'
  end)::public.attempt_state;

  update public.submissions submission_record
  set state = target_state,
      accepted_at = case when target_state = 'accepted' then statement_timestamp() else null end
  where submission_record.id = p_submission_id
    and submission_record.row_version = p_expected_version
  returning submission_record.* into submission_row;
  if submission_row.id is null then
    raise exception 'submission became stale' using errcode = '40001';
  end if;

  update public.attempts
  set state = attempt_target,
      accepted_at = case when attempt_target = 'accepted' then statement_timestamp() else null end
  where id = submission_row.attempt_id;

  insert into public.audit_events (
    organization_id, actor_id, actor_role, event_type, aggregate_type,
    aggregate_id, aggregate_version, correlation_id, metadata
  ) values (
    submission_row.organization_id, actor_id, 'trainer', 'review.decided', 'submission',
    submission_row.id, submission_row.row_version, p_correlation_id,
    jsonb_build_object(
      'decision', p_decision,
      'submission_version_id', p_submission_version_id,
      'review_id', review_id,
      'rubric_id', assigned_rubric_id,
      'evidence_id', review_evidence_id
    )
  );

  insert into public.outbox_events (
    organization_id, aggregate_type, aggregate_id, aggregate_version,
    event_type, schema_version, correlation_id, payload
  ) values (
    submission_row.organization_id, 'submission', submission_row.id, submission_row.row_version,
    'review.decided.v2', 2, p_correlation_id,
    jsonb_build_object(
      'submission_id', submission_row.id,
      'submission_version_id', p_submission_version_id,
      'learner_id', submission_row.learner_id,
      'review_id', review_id,
      'rubric_id', assigned_rubric_id,
      'evidence_id', review_evidence_id,
      'decision', p_decision,
      'criterion_scores', p_criterion_scores
    )
  );

  insert into public.notifications (
    organization_id, recipient_id, event_type, template_key, payload, deduplication_key
  ) values (
    submission_row.organization_id,
    submission_row.learner_id,
    'review.decided',
    'notifications.review_decided',
    jsonb_build_object(
      'submission_id', submission_row.id,
      'review_id', review_id,
      'decision', p_decision
    ),
    'review:' || p_submission_version_id::text
  ) on conflict (recipient_id, deduplication_key) do nothing;

  return submission_row;
end;
$$;

revoke all on function public.decide_submission(
  uuid, uuid, bigint, public.review_decision, text, jsonb, text, uuid
) from public, anon;
grant execute on function public.decide_submission(
  uuid, uuid, bigint, public.review_decision, text, jsonb, text, uuid
) to authenticated, service_role;
