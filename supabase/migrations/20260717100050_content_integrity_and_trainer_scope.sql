-- BUG-068..BUG-077 and BUG-096: forward-only content integrity, exact trainer
-- scope and deterministic mastery serialization. Migration 100000 remains
-- immutable.

-- Refuse ambiguous historical state before adding stronger declarative and
-- trigger invariants. These checks report the broken aggregate family without
-- guessing ownership, publication pins or mastery values.
create function app_private.assert_content_integrity_preflight()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $preflight$
declare
  invalid_count bigint;
begin
  select count(*) into invalid_count
  from public.task_rubric_assignments assignment_record
  left join public.tasks task_record
    on task_record.id = assignment_record.task_id
   and task_record.content_version_id = assignment_record.content_version_id
  where task_record.id is null;
  if invalid_count > 0 then
    raise exception 'preflight: % task rubric assignments have no exact task publication',
      invalid_count using errcode = '23514';
  end if;

  select count(*) into invalid_count
  from public.questions question_record
  left join public.cohorts cohort_record
    on cohort_record.id = question_record.cohort_id
   and cohort_record.organization_id = question_record.organization_id
   and cohort_record.content_version_id = question_record.content_version_id
  left join public.tasks task_record
    on task_record.id = question_record.task_id
   and task_record.content_version_id = question_record.content_version_id
   and task_record.course_id = cohort_record.course_id
  where cohort_record.id is null or task_record.id is null;
  if invalid_count > 0 then
    raise exception 'preflight: % questions have an ambiguous cohort/task publication pin',
      invalid_count using errcode = '23514';
  end if;

  select count(*) into invalid_count
  from public.mastery_events event_record
  left join public.skills skill_record on skill_record.id = event_record.skill_id
  left join public.evidence evidence_record on evidence_record.id = event_record.evidence_id
  where skill_record.id is null
    or (
      skill_record.organization_id is not null
      and skill_record.organization_id <> event_record.organization_id
    )
    or (
      event_record.evidence_id is not null
      and (
        evidence_record.id is null
        or evidence_record.organization_id <> event_record.organization_id
        or evidence_record.owner_id <> event_record.learner_id
      )
    );
  if invalid_count > 0 then
    raise exception 'preflight: % mastery events have incompatible skill or evidence scope',
      invalid_count using errcode = '23514';
  end if;

  select count(*) into invalid_count
  from public.mastery_snapshots snapshot_record
  left join public.skills skill_record on skill_record.id = snapshot_record.skill_id
  left join public.mastery_events event_record
    on event_record.id = snapshot_record.source_event_id
   and event_record.organization_id = snapshot_record.organization_id
   and event_record.learner_id = snapshot_record.learner_id
   and event_record.skill_id = snapshot_record.skill_id
  where skill_record.id is null
    or (
      skill_record.organization_id is not null
      and skill_record.organization_id <> snapshot_record.organization_id
    )
    or event_record.id is null
    or event_record.new_basis_points <> snapshot_record.mastery_basis_points
    or event_record.rule_version <> snapshot_record.rule_version;
  if invalid_count > 0 then
    raise exception 'preflight: % mastery snapshots disagree with their exact source event',
      invalid_count using errcode = '23514';
  end if;
end
$preflight$;

alter function app_private.assert_content_integrity_preflight()
  owner to postgres;
revoke all on function app_private.assert_content_integrity_preflight()
  from public, anon, authenticated, service_role;

do $migration$
begin
  perform app_private.assert_content_integrity_preflight();
end
$migration$;

-- The assignment already has the matching covering unique index. Make its
-- task/publication identity declarative as well as trigger-validated.
alter table public.task_rubric_assignments
  add constraint task_rubric_assignments_task_version_fk
  foreign key (task_id, content_version_id)
  references public.tasks (id, content_version_id)
  on delete cascade
  not valid;

alter table public.task_rubric_assignments
  validate constraint task_rubric_assignments_task_version_fk;

-- The former unqualified outer references were captured by the cohort subquery
-- and became tautologies. Qualify the target relations explicitly.
drop policy if exists content_versions_pinned_active_trainer_read
  on public.content_versions;
create policy content_versions_pinned_active_trainer_read
on public.content_versions for select to authenticated
using (exists (
  select 1
  from public.cohorts cohort_record
  where cohort_record.course_id = content_versions.course_id
    and cohort_record.content_version_id = content_versions.id
    and cohort_record.state = 'active'
    and (select app_private.can_train_cohort(cohort_record.id))
));

drop policy if exists stages_pinned_trainer_read on public.stages;
create policy stages_pinned_trainer_read
on public.stages for select to authenticated
using (exists (
  select 1
  from public.cohorts cohort_record
  where cohort_record.course_id = stages.course_id
    and cohort_record.content_version_id = stages.content_version_id
    and (select app_private.can_train_cohort(cohort_record.id))
));

drop policy if exists tasks_pinned_trainer_read on public.tasks;
create policy tasks_pinned_trainer_read
on public.tasks for select to authenticated
using (exists (
  select 1
  from public.cohorts cohort_record
  where cohort_record.course_id = tasks.course_id
    and cohort_record.content_version_id = tasks.content_version_id
    and (select app_private.can_train_cohort(cohort_record.id))
));

-- Raw course metadata is public only through the existing active global catalog
-- policies. Trainers receive only course rows belonging to an exact cohort pin;
-- the existing content-write policies continue to supply content-manager reads.
drop policy if exists courses_member_read on public.courses;
drop policy if exists course_localizations_member_read
  on public.course_localizations;

create policy courses_pinned_trainer_read
on public.courses for select to authenticated
using (exists (
  select 1
  from public.cohorts cohort_record
  where cohort_record.course_id = courses.id
    and cohort_record.content_version_id is not null
    and (select app_private.can_train_cohort(cohort_record.id))
));

create policy course_localizations_pinned_trainer_read
on public.course_localizations for select to authenticated
using (exists (
  select 1
  from public.cohorts cohort_record
  where cohort_record.course_id = course_localizations.course_id
    and cohort_record.content_version_id is not null
    and (select app_private.can_train_cohort(cohort_record.id))
));

-- Solution access follows an exact trainable cohort publication, not the
-- presence of a schedule. This supports flexible progression without widening
-- access to other versions, courses or tenants.
drop policy if exists task_option_answers_reviewer_read
  on public.task_option_answers;
create policy task_option_answers_reviewer_read
on public.task_option_answers for select to authenticated
using (exists (
  select 1
  from public.task_options option_record
  join public.tasks task_record on task_record.id = option_record.task_id
  join public.courses course_record on course_record.id = task_record.course_id
  where option_record.id = task_option_answers.task_option_id
    and (
      (select app_private.has_permission(
        'content.manage', course_record.organization_id, null
      ))
      or exists (
        select 1
        from public.cohorts cohort_record
        where cohort_record.course_id = task_record.course_id
          and cohort_record.content_version_id = task_record.content_version_id
          and (select app_private.can_train_cohort(cohort_record.id))
      )
    )
));

drop policy if exists task_model_answers_reviewer_read
  on public.task_model_answers;
create policy task_model_answers_reviewer_read
on public.task_model_answers for select to authenticated
using (exists (
  select 1
  from public.task_localizations localization_record
  join public.tasks task_record on task_record.id = localization_record.task_id
  join public.courses course_record on course_record.id = task_record.course_id
  where localization_record.id = task_model_answers.task_localization_id
    and (
      (select app_private.has_permission(
        'content.manage', course_record.organization_id, null
      ))
      or exists (
        select 1
        from public.cohorts cohort_record
        where cohort_record.course_id = task_record.course_id
          and cohort_record.content_version_id = task_record.content_version_id
          and (select app_private.can_train_cohort(cohort_record.id))
      )
    )
));

-- Every practical task enters trainer review and therefore requires one active,
-- compatible rubric with at least one criterion before its version can enter
-- review. Keep all prior competency/category/ownership checks intact.
create or replace function app_private.assert_competency_graph_ready(
  p_content_version_id uuid
)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform app_private.assert_competency_graph_ready_without_definition_scope(
    p_content_version_id
  );

  if exists (
    select 1
    from public.tasks task_record
    join public.courses course_record on course_record.id = task_record.course_id
    join public.bug_categories category_record
      on category_record.id = task_record.bug_category_id
    where task_record.content_version_id = p_content_version_id
      and (
        category_record.state <> 'active'
        or (course_record.organization_id is null
          and category_record.organization_id is not null)
        or (
          course_record.organization_id is not null
          and category_record.organization_id is not null
          and course_record.organization_id <> category_record.organization_id
        )
      )
  ) then
    raise exception 'published task categories must be active and course-compatible'
      using errcode = '23514';
  end if;

  if exists (
    select 1
    from public.task_rubric_assignments assignment_record
    join public.tasks task_record on task_record.id = assignment_record.task_id
    join public.courses course_record on course_record.id = task_record.course_id
    join public.rubrics rubric_record on rubric_record.id = assignment_record.rubric_id
    where assignment_record.content_version_id = p_content_version_id
      and (
        task_record.content_version_id is distinct from p_content_version_id
        or assignment_record.organization_id is distinct from
          course_record.organization_id
        or rubric_record.state <> 'active'
        or (course_record.organization_id is null
          and rubric_record.organization_id is not null)
        or (
          course_record.organization_id is not null
          and rubric_record.organization_id is not null
          and course_record.organization_id <> rubric_record.organization_id
        )
        or exists (
          select 1
          from public.rubric_criteria criterion_record
          join public.skills skill_record on skill_record.id = criterion_record.skill_id
          where criterion_record.rubric_id = rubric_record.id
            and (
              skill_record.state <> 'active'
              or (rubric_record.organization_id is null
                and skill_record.organization_id is not null)
              or (
                rubric_record.organization_id is not null
                and skill_record.organization_id is not null
                and rubric_record.organization_id <>
                  skill_record.organization_id
              )
            )
        )
      )
  ) then
    raise exception 'published task rubrics must be active and course-compatible'
      using errcode = '23514';
  end if;

  if exists (
    select 1
    from public.tasks task_record
    where task_record.content_version_id = p_content_version_id
      and task_record.task_kind = 'practical'
      and not exists (
        select 1
        from public.task_rubric_assignments assignment_record
        join public.rubrics rubric_record
          on rubric_record.id = assignment_record.rubric_id
         and rubric_record.state = 'active'
        where assignment_record.task_id = task_record.id
          and assignment_record.content_version_id = task_record.content_version_id
          and exists (
            select 1
            from public.rubric_criteria criterion_record
            where criterion_record.rubric_id = rubric_record.id
          )
      )
  ) then
    raise exception 'every practical task requires an active non-empty review rubric'
      using errcode = '23514';
  end if;
end;
$$;

alter function app_private.assert_competency_graph_ready(uuid)
  owner to postgres;
revoke all on function app_private.assert_competency_graph_ready(uuid)
  from public, anon, authenticated, service_role;

-- Published graphs have no runtime fixture exception. Deterministic seeds and
-- tests must assemble complete draft graphs before transitioning publication.
create or replace function app_private.guard_immutable_content_graph()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  old_version_id uuid;
  new_version_id uuid;
  owning_state public.content_version_state;
begin
  if tg_op <> 'INSERT' then
    old_version_id := app_private.content_owner_version(
      tg_table_name, to_jsonb(old)
    );
  end if;
  if tg_op <> 'DELETE' then
    new_version_id := app_private.content_owner_version(
      tg_table_name, to_jsonb(new)
    );
  end if;

  perform 1
  from public.content_versions version_record
  where version_record.id in (old_version_id, new_version_id)
  order by version_record.id
  for share;

  select version_record.state into owning_state
  from public.content_versions version_record
  where version_record.id in (old_version_id, new_version_id)
    and version_record.state in ('published', 'archived')
  order by case version_record.state when 'archived' then 0 else 1 end
  limit 1;

  if owning_state is not null then
    raise exception 'published content graph is immutable'
      using errcode = '55000';
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

alter function app_private.guard_immutable_content_graph() owner to postgres;
revoke all on function app_private.guard_immutable_content_graph()
  from public, anon, authenticated, service_role;

create or replace function app_private.guard_published_rubric_definition()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  old_rubric_id uuid;
  new_rubric_id uuid;
  locked_version_id uuid;
begin
  if tg_table_name = 'rubrics' then
    if tg_op <> 'INSERT' then old_rubric_id := old.id; end if;
    if tg_op <> 'DELETE' then new_rubric_id := new.id; end if;
  else
    if tg_op <> 'INSERT' then old_rubric_id := old.rubric_id; end if;
    if tg_op <> 'DELETE' then new_rubric_id := new.rubric_id; end if;
  end if;

  -- Publication takes the same content-version row FOR UPDATE before reading
  -- fingerprints and snapshots. Lock every affected version in canonical UUID
  -- order first, so either the definition mutation commits before publication
  -- revalidates its fingerprint or publication wins and this mutation rejects.
  for locked_version_id in
    select version_record.id
    from public.content_versions version_record
    where exists (
      select 1
      from public.task_rubric_assignments assignment_record
      where assignment_record.content_version_id = version_record.id
        and assignment_record.rubric_id in (
          old_rubric_id, new_rubric_id
        )
    )
    order by version_record.id
    for share
  loop
    null;
  end loop;

  if exists (
    select 1
    from public.task_rubric_assignments assignment_record
    join public.content_versions version_record
      on version_record.id = assignment_record.content_version_id
     and version_record.state in ('published', 'archived')
    where assignment_record.rubric_id in (old_rubric_id, new_rubric_id)
  ) then
    raise exception 'published rubric definitions are immutable'
      using errcode = '55000';
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

alter function app_private.guard_published_rubric_definition()
  owner to postgres;
revoke all on function app_private.guard_published_rubric_definition()
  from public, anon, authenticated, service_role;

-- One lock identity is shared by event and snapshot writes. Review effects
-- pre-acquire all involved skill identities in sorted order below, eliminating
-- multi-skill deadlocks while this trigger also serializes direct trusted writes.
create function app_private.serialize_mastery_identity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'mastery:' || new.organization_id::text || ':'
        || new.learner_id::text || ':' || new.skill_id::text,
      0
    )
  );
  return new;
end;
$$;

alter function app_private.serialize_mastery_identity() owner to postgres;
revoke all on function app_private.serialize_mastery_identity()
  from public, anon, authenticated, service_role;

create trigger mastery_events_serialize_identity
before insert or update of organization_id, learner_id, skill_id
on public.mastery_events
for each row execute function app_private.serialize_mastery_identity();

create trigger mastery_snapshots_serialize_identity
before insert or update of organization_id, learner_id, skill_id,
  mastery_basis_points, source_event_id, rule_version
on public.mastery_snapshots
for each row execute function app_private.serialize_mastery_identity();

-- Validate all snapshot source facts, not only the source identity covered by
-- the FK. The trigger column list ensures score/source/rule-only updates cannot
-- bypass this check.
create or replace function app_private.validate_mastery_scope()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  skill_organization_id uuid;
  event_evidence_id uuid;
begin
  select skill_record.organization_id into skill_organization_id
  from public.skills skill_record
  where skill_record.id = new.skill_id;

  if not found
     or (
       skill_organization_id is not null
       and skill_organization_id <> new.organization_id
     ) then
    raise exception 'mastery skill ownership is incompatible with its delivery tenant'
      using errcode = '23514';
  end if;

  if tg_table_name = 'mastery_events' then
    event_evidence_id := nullif(to_jsonb(new) ->> 'evidence_id', '')::uuid;
  end if;

  if event_evidence_id is not null
     and not exists (
       select 1
       from public.evidence evidence_record
       where evidence_record.id = event_evidence_id
         and evidence_record.organization_id = new.organization_id
         and evidence_record.owner_id = new.learner_id
     ) then
    raise exception 'mastery evidence must belong to the same learner and tenant'
      using errcode = '23514';
  end if;

  if tg_table_name = 'mastery_snapshots' then
    if not exists (
      select 1
      from public.mastery_events event_record
      where event_record.id = new.source_event_id
        and event_record.organization_id = new.organization_id
        and event_record.learner_id = new.learner_id
        and event_record.skill_id = new.skill_id
        and event_record.new_basis_points =
          (to_jsonb(new) ->> 'mastery_basis_points')::integer
        and event_record.rule_version = new.rule_version
    ) then
      raise exception 'mastery snapshot must exactly match its source event score and rule'
        using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

alter function app_private.validate_mastery_scope() owner to postgres;
revoke all on function app_private.validate_mastery_scope()
  from public, anon, authenticated, service_role;

drop trigger mastery_snapshots_validate_scope on public.mastery_snapshots;
create trigger mastery_snapshots_validate_scope
before insert or update of organization_id, learner_id, skill_id,
  mastery_basis_points, source_event_id, rule_version
on public.mastery_snapshots
for each row execute function app_private.validate_mastery_scope();

-- Patch only the frozen mastery section of the current review effect. Abort if
-- any expected contract fragment differs, rather than installing a partial lock
-- strategy. The exact rubric lookup introduced by 100000 remains unchanged.
do $migration$
declare
  function_body text;
  old_accept_block text := $old$
  if p_decision = 'accepted' then
    for mastery_row in
$old$;
  new_accept_block text := $new$
  if p_decision = 'accepted' then
    for mastery_lock in
      select distinct criterion.skill_id
      from jsonb_array_elements(p_criterion_scores) score
      join public.rubric_criteria criterion
        on criterion.id = (score ->> 'criterion_id')::uuid
      where criterion.skill_id is not null
      order by criterion.skill_id
    loop
      perform pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtextextended(
          'mastery:' || submission_row.organization_id::text || ':'
            || submission_row.learner_id::text || ':'
            || mastery_lock.skill_id::text,
          0
        )
      );
    end loop;

    for mastery_row in
$new$;
  old_group_block text := $old$
      group by criterion.skill_id
    loop
$old$;
  new_group_block text := $new$
      group by criterion.skill_id
      order by criterion.skill_id
    loop
$new$;
  old_snapshot_block text := $old$
        and snapshot.skill_id = mastery_row.skill_id;
$old$;
  new_snapshot_block text := $new$
        and snapshot.skill_id = mastery_row.skill_id
      for update;
$new$;
begin
  select procedure_record.prosrc into function_body
  from pg_catalog.pg_proc procedure_record
  where procedure_record.oid =
    'app_private.decide_submission_effects_unowned(uuid,uuid,bigint,public.review_decision,text,jsonb,text,uuid)'::regprocedure;

  if function_body is null
     or position('  mastery_row record;' in function_body) = 0
     or position(old_accept_block in function_body) = 0
     or position(old_group_block in function_body) = 0
     or position(old_snapshot_block in function_body) = 0 then
    raise exception 'review mastery predecessor does not match the frozen contract'
      using errcode = '55000';
  end if;

  function_body := replace(
    function_body,
    '  mastery_row record;',
    '  mastery_lock record;' || chr(10) || '  mastery_row record;'
  );
  function_body := replace(
    function_body, old_accept_block, new_accept_block
  );
  function_body := replace(
    function_body, old_group_block, new_group_block
  );
  function_body := replace(
    function_body, old_snapshot_block, new_snapshot_block
  );

  execute format($function$
    create or replace function app_private.decide_submission_effects_unowned(
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
    as %L
  $function$, function_body);
end
$migration$;

alter function app_private.decide_submission_effects_unowned(
  uuid, uuid, bigint, public.review_decision, text, jsonb, text, uuid
) owner to postgres;
revoke all on function app_private.decide_submission_effects_unowned(
  uuid, uuid, bigint, public.review_decision, text, jsonb, text, uuid
) from public, anon, authenticated, service_role;

-- Missing prerequisite data remains the explicit legacy compatibility case.
-- Once the key is present, every element must use exactly one canonical task or
-- skill rule shape; malformed values fail closed with a configuration reason.
create or replace function app_private.learner_snapshot_task_lock_reasons(
  p_enrollment_id uuid,
  p_organization_id uuid,
  p_cohort_id uuid,
  p_progression_mode text,
  p_content_version_id uuid,
  p_snapshot jsonb,
  p_task_payload jsonb
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  selected_task_id uuid;
  course_organization_id uuid;
  rule_payload jsonb;
  rule_id uuid;
  canonical_rule_version integer;
  canonical_rule public.prerequisites;
  required_task_id uuid;
  required_skill_id uuid;
  required_skill public.skills;
  minimum_mastery integer;
  current_mastery integer;
  reasons jsonb := '[]'::jsonb;
begin
  if actor_id is null
     or jsonb_typeof(p_task_payload) is distinct from 'object'
     or jsonb_typeof(p_task_payload -> 'id') is distinct from 'string'
     or (p_task_payload ->> 'id') !~
       '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$' then
    return jsonb_build_array(jsonb_build_object('code', 'configuration'));
  end if;
  selected_task_id := (p_task_payload ->> 'id')::uuid;

  select course_record.organization_id into course_organization_id
  from public.content_versions version_record
  join public.courses course_record
    on course_record.id = version_record.course_id
  where version_record.id = p_content_version_id
    and (
      course_record.organization_id is null
      or course_record.organization_id = p_organization_id
    )
    and exists (
      select 1
      from public.tasks task_record
      where task_record.id = selected_task_id
        and task_record.course_id = course_record.id
        and task_record.content_version_id = version_record.id
    );
  if not found then
    return jsonb_build_array(jsonb_build_object('code', 'configuration'));
  end if;

  if p_progression_mode = 'scheduled' then
    if not exists (
      select 1
      from public.task_schedules schedule_record
      where schedule_record.cohort_id = p_cohort_id
        and schedule_record.task_id = selected_task_id
        and (
          schedule_record.available_from is null
          or schedule_record.available_from <= statement_timestamp()
        )
        and (
          schedule_record.due_at is null
          or schedule_record.due_at >= statement_timestamp()
        )
    ) then
      reasons := reasons || jsonb_build_array(
        jsonb_build_object('code', 'schedule')
      );
    end if;
  elsif p_progression_mode = 'flexible' then
    if not app_private.current_actor_has_learning_entitlement(
      p_organization_id
    ) then
      reasons := reasons || jsonb_build_array(
        jsonb_build_object('code', 'entitlement')
      );
    end if;
  else
    reasons := reasons || jsonb_build_array(
      jsonb_build_object('code', 'configuration')
    );
  end if;

  if not (p_task_payload ? 'prerequisites') then
    return reasons;
  end if;
  if jsonb_typeof(p_task_payload -> 'prerequisites') is distinct from 'array' then
    return reasons || jsonb_build_array(
      jsonb_build_object('code', 'configuration')
    );
  end if;

  for rule_payload in
    select rule_record.value
    from jsonb_array_elements(p_task_payload -> 'prerequisites') rule_record
  loop
    rule_id := null;
    canonical_rule_version := null;
    canonical_rule := null;
    required_task_id := null;
    required_skill_id := null;
    required_skill := null;
    minimum_mastery := null;
    current_mastery := null;

    if jsonb_typeof(rule_payload) is distinct from 'object'
       or (
         select count(*)
         from jsonb_object_keys(rule_payload) key_record
       ) <> 5
       or not (
         rule_payload ?& array[
           'id', 'rule_version', 'required_task_id', 'required_skill',
           'minimum_mastery_basis_points'
         ]
       )
       or jsonb_typeof(rule_payload -> 'id') is distinct from 'string'
       or (rule_payload ->> 'id') !~
         '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
       or jsonb_typeof(rule_payload -> 'rule_version') is distinct from
         'number'
       or (rule_payload ->> 'rule_version') !~ '^[1-9][0-9]*$'
       or (rule_payload ->> 'rule_version')::numeric > 2147483647
       or not (rule_payload ? 'required_task_id')
       or not (rule_payload ? 'required_skill')
       or not (rule_payload ? 'minimum_mastery_basis_points') then
      reasons := reasons || jsonb_build_array(
        jsonb_build_object('code', 'configuration')
      );
      continue;
    end if;

    rule_id := (rule_payload ->> 'id')::uuid;
    canonical_rule_version := (rule_payload ->> 'rule_version')::integer;

    select prerequisite_record.* into canonical_rule
    from public.prerequisites prerequisite_record
    where prerequisite_record.id = rule_id
      and prerequisite_record.target_task_id = selected_task_id
      and prerequisite_record.organization_id is not distinct from
        course_organization_id
      and prerequisite_record.rule_version = canonical_rule_version;
    if not found then
      reasons := reasons || jsonb_build_array(
        jsonb_build_object('code', 'configuration')
      );
      continue;
    end if;

    if jsonb_typeof(rule_payload -> 'required_task_id') = 'string'
       and (rule_payload ->> 'required_task_id') ~
         '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
       and rule_payload -> 'required_skill' = 'null'::jsonb
       and rule_payload -> 'minimum_mastery_basis_points' = 'null'::jsonb then
      required_task_id := (rule_payload ->> 'required_task_id')::uuid;
      if canonical_rule.required_task_id is distinct from required_task_id
         or canonical_rule.required_skill_id is not null
         or canonical_rule.minimum_mastery_basis_points is not null
         or not exists (
           select 1
           from public.tasks required_task
           where required_task.id = required_task_id
             and required_task.content_version_id = p_content_version_id
         )
         or app_private.snapshot_task_payload(
        p_snapshot, required_task_id
      ) is null or not exists (
        select 1
        from public.attempts attempt_record
        join public.submissions submission_record
          on submission_record.attempt_id = attempt_record.id
         and submission_record.organization_id = p_organization_id
         and submission_record.cohort_id = p_cohort_id
         and submission_record.task_id = required_task_id
         and submission_record.state = 'accepted'
        join public.submission_versions submission_version
          on submission_version.submission_id = submission_record.id
         and submission_version.version_number =
           submission_record.latest_version_number
        where attempt_record.enrollment_id = p_enrollment_id
          and attempt_record.organization_id = p_organization_id
          and attempt_record.cohort_id = p_cohort_id
          and attempt_record.learner_id = actor_id
          and attempt_record.task_id = required_task_id
          and attempt_record.state = 'accepted'
          and submission_version.task_snapshot ->> 'content_version_id' =
            p_content_version_id::text
      ) then
        reasons := reasons || jsonb_build_array(
          jsonb_build_object('code', 'required_task')
        );
      end if;
      continue;
    end if;

    if rule_payload -> 'required_task_id' = 'null'::jsonb
       and jsonb_typeof(rule_payload -> 'required_skill') = 'object'
       and (
         select count(*)
         from jsonb_object_keys(
           rule_payload -> 'required_skill'
         ) key_record
       ) = 4
       and (
         rule_payload -> 'required_skill' ?& array[
           'id', 'code', 'labels', 'taxonomy_version'
         ]
       )
       and jsonb_typeof(rule_payload #> '{required_skill,id}') = 'string'
       and (rule_payload #>> '{required_skill,id}') ~
         '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
       and jsonb_typeof(rule_payload #> '{required_skill,code}') = 'string'
       and nullif(btrim(
         rule_payload #>> '{required_skill,code}'
       ), '') is not null
       and jsonb_typeof(rule_payload #> '{required_skill,labels}') =
         'object'
       and jsonb_typeof(
         rule_payload #> '{required_skill,taxonomy_version}'
       ) = 'number'
       and (rule_payload #>> '{required_skill,taxonomy_version}') ~
         '^[1-9][0-9]*$'
       and (
         rule_payload #>> '{required_skill,taxonomy_version}'
       )::numeric <= 2147483647
       and jsonb_typeof(rule_payload -> 'minimum_mastery_basis_points') =
         'number'
       and (rule_payload ->> 'minimum_mastery_basis_points') ~
         '^(0|[1-9][0-9]{0,4})$' then
      required_skill_id := (rule_payload #>> '{required_skill,id}')::uuid;
      minimum_mastery :=
        (rule_payload ->> 'minimum_mastery_basis_points')::integer;
      if minimum_mastery > 10000
         or canonical_rule.required_task_id is not null
         or canonical_rule.required_skill_id is distinct from
           required_skill_id
         or canonical_rule.minimum_mastery_basis_points is distinct from
           minimum_mastery then
        reasons := reasons || jsonb_build_array(
          jsonb_build_object('code', 'configuration')
        );
        continue;
      end if;

      select skill_record.* into required_skill
      from public.skills skill_record
      where skill_record.id = required_skill_id;
      if not found
         or required_skill.state <> 'active'
         or (
           course_organization_id is null
           and required_skill.organization_id is not null
         )
         or (
           course_organization_id is not null
           and required_skill.organization_id is not null
           and required_skill.organization_id <>
             course_organization_id
         )
         or rule_payload -> 'required_skill' <> jsonb_build_object(
           'id', required_skill.id,
           'code', required_skill.code,
           'labels', required_skill.labels,
           'taxonomy_version', required_skill.taxonomy_version
         ) then
        reasons := reasons || jsonb_build_array(
          jsonb_build_object('code', 'configuration')
        );
        continue;
      end if;

      select snapshot_record.mastery_basis_points into current_mastery
      from public.mastery_snapshots snapshot_record
      where snapshot_record.organization_id = p_organization_id
        and snapshot_record.learner_id = actor_id
        and snapshot_record.skill_id = required_skill_id;
      current_mastery := coalesce(current_mastery, 0);
      if current_mastery < minimum_mastery then
        reasons := reasons || jsonb_build_array(jsonb_build_object(
          'code', 'required_skill',
          'current_basis_points', current_mastery,
          'minimum_basis_points', minimum_mastery
        ));
      end if;
      continue;
    end if;

    reasons := reasons || jsonb_build_array(
      jsonb_build_object('code', 'configuration')
    );
  end loop;

  return reasons;
exception
  when others then
    return reasons || jsonb_build_array(
      jsonb_build_object('code', 'configuration')
    );
end;
$$;

alter function app_private.learner_snapshot_task_lock_reasons(
  uuid, uuid, uuid, text, uuid, jsonb, jsonb
) owner to postgres;
revoke all on function app_private.learner_snapshot_task_lock_reasons(
  uuid, uuid, uuid, text, uuid, jsonb, jsonb
) from public, anon, authenticated, service_role;

-- A learner with exact open work retains the task-bound question entry point
-- when a schedule closes or a prerequisite/entitlement changes. Never-started
-- tasks continue to require the current lock-reason set to be empty.
create or replace function public.list_my_available_question_contexts(
  p_locale text default 'en'
)
returns table (
  cohort_id uuid,
  cohort_name text,
  task_id uuid,
  task_title text
)
language sql
stable
security definer
set search_path = ''
as $$
  with eligible_contexts as (
    select distinct on (enrollment_record.id)
      enrollment_record.id as enrollment_id,
      enrollment_record.organization_id,
      cohort_record.id as cohort_id,
      cohort_record.name as cohort_name,
      cohort_record.progression_mode,
      cohort_record.content_version_id,
      course_record.default_locale,
      version_record.snapshot
    from public.enrollments enrollment_record
    join public.cohorts cohort_record
      on cohort_record.id = enrollment_record.cohort_id
     and cohort_record.organization_id = enrollment_record.organization_id
     and cohort_record.course_id = enrollment_record.course_id
     and cohort_record.state = 'active'
    join public.courses course_record
      on course_record.id = enrollment_record.course_id
     and course_record.state = 'active'
     and course_record.archived_at is null
     and (
       course_record.organization_id is null
       or course_record.organization_id = enrollment_record.organization_id
     )
    join public.content_versions version_record
      on version_record.id = cohort_record.content_version_id
     and version_record.course_id = course_record.id
     and version_record.state in ('published', 'archived')
    where enrollment_record.learner_id = (select auth.uid())
      and enrollment_record.state in ('assigned', 'completed')
      and app_private.current_actor_is_active_learner(
        enrollment_record.organization_id, cohort_record.id
      )
      and app_private.is_valid_learner_content_snapshot(
        version_record.snapshot,
        course_record.id,
        course_record.slug,
        version_record.id,
        version_record.version_number
      )
    order by enrollment_record.id, enrollment_record.updated_at desc
  )
  select
    context_record.cohort_id,
    context_record.cohort_name,
    (task_payload.value ->> 'id')::uuid,
    app_private.resolve_snapshot_localization(
      task_payload.value -> 'localizations',
      p_locale,
      context_record.default_locale
    ) ->> 'title'
  from eligible_contexts context_record
  cross join lateral jsonb_array_elements(context_record.snapshot -> 'stages')
    stage_payload
  cross join lateral jsonb_array_elements(stage_payload.value -> 'tasks')
    task_payload
  left join lateral (
    select attempt_record.state
    from public.attempts attempt_record
    where attempt_record.enrollment_id = context_record.enrollment_id
      and attempt_record.organization_id = context_record.organization_id
      and attempt_record.learner_id = (select auth.uid())
      and attempt_record.cohort_id = context_record.cohort_id
      and attempt_record.task_id = (task_payload.value ->> 'id')::uuid
    order by attempt_record.sequence_number desc, attempt_record.id desc
    limit 1
  ) latest_attempt on true
  where latest_attempt.state in (
      'in_progress', 'submitted', 'revision_required', 'resubmitted'
    )
    or app_private.learner_snapshot_task_lock_reasons(
      context_record.enrollment_id,
      context_record.organization_id,
      context_record.cohort_id,
      context_record.progression_mode,
      context_record.content_version_id,
      context_record.snapshot,
      task_payload.value
    ) = '[]'::jsonb
  order by lower(
    app_private.resolve_snapshot_localization(
      task_payload.value -> 'localizations',
      p_locale,
      context_record.default_locale
    ) ->> 'title'
  ), context_record.cohort_id, (task_payload.value ->> 'id')::uuid;
$$;

alter function public.list_my_available_question_contexts(text)
  owner to postgres;
revoke all on function public.list_my_available_question_contexts(text)
  from public, anon, authenticated, service_role;
grant execute on function public.list_my_available_question_contexts(text)
  to authenticated, service_role;

comment on function public.list_my_available_question_contexts(text) is
  'Actor-derived exact publication contexts: currently available tasks or exact open learner work during schedule/prerequisite changes.';
