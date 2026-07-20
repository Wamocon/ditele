-- Complete WF-02 entry, localized assessment prompts, and tamper-resistant telemetry.

create table public.task_assessments (
  task_id uuid primary key references public.tasks(id) on delete cascade,
  question_translations jsonb not null check (
    jsonb_typeof(question_translations) = 'object'
    and question_translations ? 'en'
  ),
  selection_mode text not null check (selection_mode in ('single', 'multiple')),
  minimum_selections integer not null default 1 check (minimum_selections > 0),
  maximum_selections integer check (maximum_selections is null or maximum_selections >= minimum_selections),
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp()
);

create table public.task_hints (
  id uuid primary key default app_private.uuid7(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  position integer not null check (position >= 0),
  content_translations jsonb not null check (
    jsonb_typeof(content_translations) = 'object'
    and content_translations ? 'en'
  ),
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint task_hints_task_position_unique unique (task_id, position)
);

create index task_hints_task_idx on public.task_hints (task_id, position);

create table public.attempt_hint_usage (
  id uuid primary key default app_private.uuid7(),
  attempt_id uuid not null references public.attempts(id) on delete cascade,
  hint_id uuid not null references public.task_hints(id) on delete restrict,
  first_used_at timestamptz not null default statement_timestamp(),
  created_at timestamptz not null default statement_timestamp(),
  constraint attempt_hint_usage_unique unique (attempt_id, hint_id)
);

create index attempt_hint_usage_hint_idx on public.attempt_hint_usage (hint_id, first_used_at);

alter table public.attempts
  add column start_idempotency_key text;

create unique index attempts_start_idempotency_uidx
  on public.attempts (learner_id, start_idempotency_key)
  where start_idempotency_key is not null;

create trigger task_assessments_set_updated_at
before update on public.task_assessments
for each row execute function app_private.set_updated_at();
create trigger task_hints_set_updated_at
before update on public.task_hints
for each row execute function app_private.set_updated_at();
create trigger attempt_hint_usage_immutable
before update or delete on public.attempt_hint_usage
for each row execute function app_private.reject_mutation();

alter table public.task_assessments enable row level security;
alter table public.task_assessments force row level security;
alter table public.task_hints enable row level security;
alter table public.task_hints force row level security;
alter table public.attempt_hint_usage enable row level security;
alter table public.attempt_hint_usage force row level security;

revoke all on public.task_assessments, public.task_hints, public.attempt_hint_usage from anon, authenticated;
grant select, insert, update, delete on public.task_assessments, public.task_hints, public.attempt_hint_usage to authenticated;

create policy task_assessments_member_read on public.task_assessments
  for select to authenticated using (exists (
    select 1 from public.tasks task_row
    join public.courses course_row on course_row.id = task_row.course_id
    where task_row.id = task_id
      and (course_row.organization_id is null or (select app_private.is_active_organization_member(course_row.organization_id)))
  ));
create policy task_assessments_content_write on public.task_assessments
  for all to authenticated
  using (exists (
    select 1 from public.tasks task_row
    join public.courses course_row on course_row.id = task_row.course_id
    where task_row.id = task_id and (select app_private.has_permission('content.manage', course_row.organization_id))
  ))
  with check (exists (
    select 1 from public.tasks task_row
    join public.courses course_row on course_row.id = task_row.course_id
    where task_row.id = task_id and (select app_private.has_permission('content.manage', course_row.organization_id))
  ));

create policy task_hints_member_read on public.task_hints
  for select to authenticated using (exists (
    select 1 from public.tasks task_row
    join public.courses course_row on course_row.id = task_row.course_id
    where task_row.id = task_id
      and (course_row.organization_id is null or (select app_private.is_active_organization_member(course_row.organization_id)))
  ));
create policy task_hints_content_write on public.task_hints
  for all to authenticated
  using (exists (
    select 1 from public.tasks task_row
    join public.courses course_row on course_row.id = task_row.course_id
    where task_row.id = task_id and (select app_private.has_permission('content.manage', course_row.organization_id))
  ))
  with check (exists (
    select 1 from public.tasks task_row
    join public.courses course_row on course_row.id = task_row.course_id
    where task_row.id = task_id and (select app_private.has_permission('content.manage', course_row.organization_id))
  ));

create policy attempt_hint_usage_scoped_read on public.attempt_hint_usage
  for select to authenticated using (exists (
    select 1 from public.attempts attempt_row
    where attempt_row.id = attempt_id
      and (attempt_row.learner_id = (select auth.uid()) or (select app_private.can_train_cohort(attempt_row.cohort_id)))
  ));

drop function public.save_attempt_draft(uuid, bigint, text, uuid[], jsonb);

create or replace function public.save_attempt_draft(
  p_attempt_id uuid,
  p_expected_draft_version bigint,
  p_answer_text text,
  p_selected_option_ids uuid[],
  p_evidence_draft jsonb,
  p_elapsed_seconds integer,
  p_used_hint_ids uuid[]
)
returns table (
  attempt_id uuid,
  draft_version bigint,
  attempt_version bigint,
  elapsed_seconds integer,
  hint_used boolean,
  hint_first_used_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  attempt_row public.attempts;
  draft_row public.attempt_drafts;
  next_attempt_version bigint;
begin
  if p_elapsed_seconds < 0 or jsonb_typeof(p_evidence_draft) <> 'array' then
    raise exception 'invalid draft telemetry' using errcode = '22023';
  end if;

  select attempt_record.* into attempt_row
  from public.attempts attempt_record
  where attempt_record.id = p_attempt_id
    and attempt_record.learner_id = actor_id
    and attempt_record.state in ('in_progress', 'revision_required');
  if attempt_row.id is null then
    raise exception 'attempt unavailable' using errcode = '42501';
  end if;
  if exists (
    select 1 from unnest(p_selected_option_ids) selected_id
    where not exists (
      select 1 from public.task_options option_row
      where option_row.id = selected_id and option_row.task_id = attempt_row.task_id
    )
  ) then
    raise exception 'selected option does not belong to the attempt task' using errcode = '22023';
  end if;
  if exists (
    select 1 from unnest(p_used_hint_ids) hint_id
    where not exists (
      select 1 from public.task_hints hint_row
      where hint_row.id = hint_id and hint_row.task_id = attempt_row.task_id
    )
  ) then
    raise exception 'used hint does not belong to the attempt task' using errcode = '22023';
  end if;

  if p_expected_draft_version = 0 then
    insert into public.attempt_drafts (
      attempt_id, answer_text, selected_option_ids, evidence_draft, client_saved_at
    ) values (
      p_attempt_id, p_answer_text, p_selected_option_ids, p_evidence_draft, statement_timestamp()
    ) on conflict (attempt_id) do nothing returning * into draft_row;
  else
    update public.attempt_drafts draft_record
    set answer_text = p_answer_text,
        selected_option_ids = p_selected_option_ids,
        evidence_draft = p_evidence_draft,
        client_saved_at = statement_timestamp()
    where draft_record.attempt_id = p_attempt_id
      and draft_record.row_version = p_expected_draft_version
    returning draft_record.* into draft_row;
  end if;
  if draft_row.attempt_id is null then
    raise exception 'draft is stale' using errcode = '40001';
  end if;

  insert into public.attempt_hint_usage (attempt_id, hint_id)
  select p_attempt_id, used_hint_id from unnest(p_used_hint_ids) used_hint_id
  on conflict (attempt_id, hint_id) do nothing;

  update public.attempts attempt_record
  set elapsed_seconds = greatest(attempt_record.elapsed_seconds, p_elapsed_seconds),
      hint_used = attempt_record.hint_used or cardinality(p_used_hint_ids) > 0,
      hint_first_used_at = case
        when attempt_record.hint_first_used_at is not null then attempt_record.hint_first_used_at
        when cardinality(p_used_hint_ids) > 0 then statement_timestamp()
        else null
      end,
      last_activity_at = statement_timestamp()
  where attempt_record.id = p_attempt_id
  returning attempt_record.row_version into next_attempt_version;

  return query
  select
    attempt_row.id,
    draft_row.row_version,
    next_attempt_version,
    refreshed.elapsed_seconds,
    refreshed.hint_used,
    refreshed.hint_first_used_at,
    draft_row.updated_at
  from public.attempts refreshed
  where refreshed.id = attempt_row.id;
end;
$$;

create or replace function public.start_attempt(
  p_task_id uuid,
  p_idempotency_key text
)
returns public.attempts
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  enrollment_row public.enrollments;
  result public.attempts;
  next_sequence integer;
begin
  if actor_id is null or length(p_idempotency_key) not between 16 and 200 then
    raise exception 'authentication and valid idempotency key required' using errcode = '42501';
  end if;

  select attempt_row.* into result
  from public.attempts attempt_row
  where attempt_row.learner_id = actor_id
    and attempt_row.start_idempotency_key = p_idempotency_key;
  if result.id is not null then return result; end if;

  select attempt_row.* into result
  from public.attempts attempt_row
  where attempt_row.learner_id = actor_id
    and attempt_row.task_id = p_task_id
    and attempt_row.state in ('in_progress', 'submitted', 'revision_required', 'resubmitted')
  order by attempt_row.created_at desc limit 1;
  if result.id is not null then return result; end if;

  select enrollment_record.* into enrollment_row
  from public.enrollments enrollment_record
  join public.cohorts cohort_row on cohort_row.id = enrollment_record.cohort_id
  join public.cohort_memberships membership_row
    on membership_row.cohort_id = cohort_row.id and membership_row.user_id = actor_id
  join public.task_schedules schedule_row
    on schedule_row.cohort_id = cohort_row.id and schedule_row.task_id = p_task_id
  where enrollment_record.learner_id = actor_id
    and enrollment_record.state = 'assigned'
    and cohort_row.state = 'active'
    and membership_row.role = 'learner'
    and membership_row.state = 'active'
    and (schedule_row.available_from is null or schedule_row.available_from <= statement_timestamp())
    and (schedule_row.due_at is null or schedule_row.due_at >= statement_timestamp())
  order by enrollment_record.created_at desc limit 1;
  if enrollment_row.id is null then
    raise exception 'no active enrollment and schedule for task' using errcode = '42501';
  end if;

  select coalesce(max(attempt_row.sequence_number), 0) + 1 into next_sequence
  from public.attempts attempt_row
  where attempt_row.enrollment_id = enrollment_row.id and attempt_row.task_id = p_task_id;

  insert into public.attempts (
    organization_id, enrollment_id, learner_id, cohort_id, task_id,
    sequence_number, state, start_idempotency_key
  ) values (
    enrollment_row.organization_id, enrollment_row.id, actor_id,
    enrollment_row.cohort_id, p_task_id, next_sequence, 'in_progress', p_idempotency_key
  ) returning * into result;

  insert into public.audit_events (
    organization_id, actor_id, actor_role, event_type, aggregate_type,
    aggregate_id, aggregate_version, correlation_id, metadata
  ) values (
    result.organization_id, actor_id, 'learner', 'attempt.started', 'attempt',
    result.id, result.row_version, app_private.uuid7(), jsonb_build_object('task_id', p_task_id)
  );
  return result;
exception
  when unique_violation then
    select attempt_row.* into result
    from public.attempts attempt_row
    where attempt_row.learner_id = actor_id
      and (attempt_row.start_idempotency_key = p_idempotency_key
        or (attempt_row.task_id = p_task_id and attempt_row.state in ('in_progress', 'submitted', 'revision_required', 'resubmitted')))
    order by (attempt_row.start_idempotency_key = p_idempotency_key) desc, attempt_row.created_at desc
    limit 1;
    if result.id is null then raise; end if;
    return result;
end;
$$;

revoke all on function public.save_attempt_draft(uuid, bigint, text, uuid[], jsonb, integer, uuid[]) from public, anon;
grant execute on function public.save_attempt_draft(uuid, bigint, text, uuid[], jsonb, integer, uuid[]) to authenticated, service_role;
revoke all on function public.start_attempt(uuid, text) from public, anon;
grant execute on function public.start_attempt(uuid, text) to authenticated, service_role;

