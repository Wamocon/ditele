-- Audited cohort lifecycle and pinned-version task scheduling.
--
-- Cohorts retain the exact published content graph they started with. Browser
-- callers can no longer mutate lifecycle, pin, completion, or task-schedule
-- facts directly; all such changes pass through actor-derived, CAS-protected,
-- idempotent commands that append audit and outbox evidence.

alter table public.cohorts
  add column content_version_id uuid;

-- Backfill a historical pin from task-bearing cohort activity first. This is
-- intentionally deterministic when old data references more than one version.
with usage_edges as (
  select schedule_record.cohort_id, schedule_record.task_id
  from public.task_schedules schedule_record
  union all
  select attempt_record.cohort_id, attempt_record.task_id
  from public.attempts attempt_record
  union all
  select submission_record.cohort_id, submission_record.task_id
  from public.submissions submission_record
),
candidate_usage as (
  select
    cohort_record.id as cohort_id,
    task_record.content_version_id,
    count(*) as reference_count,
    max(version_record.version_number) as version_number
  from public.cohorts cohort_record
  join usage_edges usage_record
    on usage_record.cohort_id = cohort_record.id
  join public.tasks task_record
    on task_record.id = usage_record.task_id
   and task_record.course_id = cohort_record.course_id
  join public.content_versions version_record
    on version_record.id = task_record.content_version_id
   and version_record.course_id = cohort_record.course_id
  where cohort_record.content_version_id is null
    and task_record.content_version_id is not null
  group by cohort_record.id, task_record.content_version_id
),
ranked_usage as (
  select
    candidate_record.*,
    row_number() over (
      partition by candidate_record.cohort_id
      order by
        candidate_record.reference_count desc,
        candidate_record.version_number desc,
        candidate_record.content_version_id desc
    ) as preference
  from candidate_usage candidate_record
)
update public.cohorts cohort_record
set content_version_id = candidate_record.content_version_id
from ranked_usage candidate_record
where cohort_record.id = candidate_record.cohort_id
  and candidate_record.preference = 1
  and cohort_record.content_version_id is null;

-- Cohorts without historical task activity receive the latest published
-- version only. Rows remain nullable when no verifiable published version
-- exists, preserving explicit legacy compatibility without inventing a pin.
with ranked_published as (
  select
    cohort_record.id as cohort_id,
    version_record.id as content_version_id,
    row_number() over (
      partition by cohort_record.id
      order by version_record.version_number desc, version_record.id desc
    ) as preference
  from public.cohorts cohort_record
  join public.content_versions version_record
    on version_record.course_id = cohort_record.course_id
   and version_record.state = 'published'
  where cohort_record.content_version_id is null
)
update public.cohorts cohort_record
set content_version_id = candidate_record.content_version_id
from ranked_published candidate_record
where cohort_record.id = candidate_record.cohort_id
  and candidate_record.preference = 1
  and cohort_record.content_version_id is null;

alter table public.cohorts
  add constraint cohorts_content_version_id_fkey
  foreign key (content_version_id)
  references public.content_versions(id)
  on delete restrict
  not valid;

alter table public.cohorts
  validate constraint cohorts_content_version_id_fkey;

create index cohorts_content_version_id_idx
  on public.cohorts (content_version_id)
  where content_version_id is not null;

create or replace function app_private.guard_cohort_content_pin()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  pinned_course_id uuid;
  pinned_state public.content_version_state;
begin
  if new.content_version_id is not null then
    select version_record.course_id, version_record.state
    into pinned_course_id, pinned_state
    from public.content_versions version_record
    where version_record.id = new.content_version_id;

    if pinned_course_id is null or pinned_course_id <> new.course_id then
      raise exception 'cohort content version must belong to its course'
        using errcode = '23514';
    end if;
  end if;

  if tg_op = 'UPDATE'
     and old.state <> 'waiting'
     and new.content_version_id is distinct from old.content_version_id then
    raise exception 'an active or terminal cohort content pin is immutable'
      using errcode = '55000';
  end if;

  if tg_op = 'INSERT'
     and new.state = 'active'
     and (
       new.content_version_id is null
       or pinned_state is distinct from 'published'
     ) then
    raise exception 'an active cohort requires an exact published content pin'
      using errcode = '23514';
  end if;

  if tg_op = 'INSERT'
     and new.state = 'completed'
     and (
       new.content_version_id is null
       or pinned_state not in ('published', 'archived')
     ) then
    raise exception 'a completed cohort requires an exact content pin'
      using errcode = '23514';
  end if;

  if tg_op = 'UPDATE'
     and old.state = 'waiting'
     and new.state = 'active'
     and (
       new.content_version_id is null
       or pinned_state is distinct from 'published'
     ) then
    raise exception 'a cohort can start only with its published content pin'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke all on function app_private.guard_cohort_content_pin()
  from public, anon, authenticated, service_role;

create trigger cohorts_guard_content_pin
before insert or update on public.cohorts
for each row execute function app_private.guard_cohort_content_pin();

-- A private receipt ledger stores the exact historical command result. It is
-- actor- and operation-scoped so a retry can return after the aggregate has
-- moved again, while a key reused with another payload fails closed.
create table public.cohort_schedule_command_receipts (
  id uuid primary key default app_private.uuid7(),
  actor_id uuid not null references auth.users(id) on delete restrict,
  operation text not null check (operation in (
    'cohort.transition',
    'task_schedule.update'
  )),
  aggregate_id uuid not null,
  idempotency_key text not null check (
    length(idempotency_key) between 16 and 200
  ),
  payload_hash text not null check (payload_hash ~ '^[0-9a-f]{64}$'),
  result jsonb not null check (jsonb_typeof(result) = 'object'),
  correlation_id uuid not null,
  created_at timestamptz not null default statement_timestamp(),
  constraint cohort_schedule_receipts_actor_operation_key_unique
    unique (actor_id, operation, idempotency_key)
);

create index cohort_schedule_receipts_actor_time_idx
  on public.cohort_schedule_command_receipts (actor_id, created_at desc);

alter table public.cohort_schedule_command_receipts enable row level security;
alter table public.cohort_schedule_command_receipts force row level security;
revoke all on public.cohort_schedule_command_receipts
  from public, anon, authenticated;
grant select on public.cohort_schedule_command_receipts to service_role;

create trigger cohort_schedule_command_receipts_immutable
before update or delete on public.cohort_schedule_command_receipts
for each row execute function app_private.reject_mutation();

create or replace function app_private.current_actor_can_manage_cohort_command(
  p_cohort_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select app_private.current_actor_has_active_profile())
    and exists (
      select 1
      from public.cohorts cohort_record
      join public.organizations organization_record
        on organization_record.id = cohort_record.organization_id
      where cohort_record.id = p_cohort_id
        and organization_record.state = 'active'
        and organization_record.archived_at is null
        and (select app_private.has_permission(
          'cohort.manage', cohort_record.organization_id, cohort_record.id
        ))
        and (
          (select app_private.has_role(
            'admin', cohort_record.organization_id, cohort_record.id
          ))
          or exists (
            select 1
            from public.organization_memberships membership_record
            where membership_record.organization_id = cohort_record.organization_id
              and membership_record.user_id = (select auth.uid())
              and membership_record.state = 'active'
              and membership_record.removed_at is null
              and (
                membership_record.valid_until is null
                or membership_record.valid_until > statement_timestamp()
              )
          )
        )
    );
$$;

create or replace function app_private.current_actor_can_train_cohort_command(
  p_cohort_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select app_private.current_actor_has_active_profile())
    and exists (
      select 1
      from public.cohorts cohort_record
      join public.organizations organization_record
        on organization_record.id = cohort_record.organization_id
      join public.organization_memberships organization_membership
        on organization_membership.organization_id = cohort_record.organization_id
       and organization_membership.user_id = (select auth.uid())
       and organization_membership.state = 'active'
       and organization_membership.removed_at is null
       and (
         organization_membership.valid_until is null
         or organization_membership.valid_until > statement_timestamp()
       )
      join public.cohort_memberships cohort_membership
        on cohort_membership.cohort_id = cohort_record.id
       and cohort_membership.user_id = (select auth.uid())
       and cohort_membership.role = 'trainer'
       and cohort_membership.state = 'active'
       and cohort_membership.removed_at is null
      where cohort_record.id = p_cohort_id
        and organization_record.state = 'active'
        and organization_record.archived_at is null
        and (select app_private.has_role(
          'trainer', cohort_record.organization_id, cohort_record.id
        ))
        and (select app_private.has_permission(
          'cohort.read', cohort_record.organization_id, cohort_record.id
        ))
    );
$$;

revoke all on function app_private.current_actor_can_manage_cohort_command(uuid)
  from public, anon, authenticated, service_role;
revoke all on function app_private.current_actor_can_train_cohort_command(uuid)
  from public, anon, authenticated, service_role;

-- Archival confirmation now accounts for every cohort pinned to the version.
-- Because get_content_archive_impact hashes this object, a lifecycle change in
-- waiting/active/completed cohorts invalidates a stale confirmation.
create or replace function app_private.build_content_archive_impact(
  p_content_version_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  version_row public.content_versions;
begin
  select version_record.* into version_row
  from public.content_versions version_record
  where version_record.id = p_content_version_id;
  if version_row.id is null then
    raise exception 'content version does not exist' using errcode = '22023';
  end if;

  return jsonb_build_object(
    'content_version_id', version_row.id,
    'course_id', version_row.course_id,
    'row_version', version_row.row_version,
    'snapshot_sha256', encode(
      extensions.digest(version_row.snapshot::text, 'sha256'), 'hex'
    ),
    'task_count', (
      select count(*) from public.tasks task_row
      where task_row.content_version_id = version_row.id
    ),
    'task_schedule_count', (
      select count(*)
      from public.task_schedules schedule_row
      join public.tasks task_row on task_row.id = schedule_row.task_id
      where task_row.content_version_id = version_row.id
    ),
    'attempt_count', (
      select count(*)
      from public.attempts attempt_row
      join public.tasks task_row on task_row.id = attempt_row.task_id
      where task_row.content_version_id = version_row.id
    ),
    'open_attempt_count', (
      select count(*)
      from public.attempts attempt_row
      join public.tasks task_row on task_row.id = attempt_row.task_id
      where task_row.content_version_id = version_row.id
        and attempt_row.state in (
          'in_progress', 'submitted', 'revision_required', 'resubmitted'
        )
    ),
    'submission_count', (
      select count(*)
      from public.submissions submission_row
      join public.tasks task_row on task_row.id = submission_row.task_id
      where task_row.content_version_id = version_row.id
    ),
    'pinned_cohort_count', (
      select count(*) from public.cohorts cohort_row
      where cohort_row.content_version_id = version_row.id
    ),
    'pinned_waiting_cohort_count', (
      select count(*) from public.cohorts cohort_row
      where cohort_row.content_version_id = version_row.id
        and cohort_row.state = 'waiting'
    ),
    'pinned_active_cohort_count', (
      select count(*) from public.cohorts cohort_row
      where cohort_row.content_version_id = version_row.id
        and cohort_row.state = 'active'
    ),
    'pinned_completed_cohort_count', (
      select count(*) from public.cohorts cohort_row
      where cohort_row.content_version_id = version_row.id
        and cohort_row.state = 'completed'
    ),
    'pinned_cancelled_cohort_count', (
      select count(*) from public.cohorts cohort_row
      where cohort_row.content_version_id = version_row.id
        and cohort_row.state = 'cancelled'
    )
  );
end;
$$;

revoke all on function app_private.build_content_archive_impact(uuid)
  from public, anon, authenticated, service_role;

-- Replace the historical signatures with one canonical, defaulted trailing
-- key each. Positional V1 calls still work; PostgREST/type generation sees no
-- overload ambiguity and V2 sends the explicit named idempotency key.
drop function if exists public.transition_cohort(
  uuid, bigint, public.cohort_state, text, uuid
);

create function public.transition_cohort(
  p_cohort_id uuid,
  p_expected_version bigint,
  p_target_state public.cohort_state,
  p_reason text,
  p_correlation_id uuid,
  p_idempotency_key text default null
)
returns public.cohorts
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := (select auth.uid());
  normalized_reason text := nullif(btrim(p_reason), '');
  effective_key text;
  payload_hash text;
  can_manage boolean;
  can_train boolean;
  actor_role text;
  audit_event_type text;
  outbox_event_type text;
  template_key text;
  cohort_row public.cohorts;
  pinned_version public.content_versions;
  receipt_row public.cohort_schedule_command_receipts;
  result_row public.cohorts;
begin
  if v_actor_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if p_cohort_id is null
     or p_expected_version is null or p_expected_version < 1
     or p_target_state not in ('active', 'completed', 'cancelled')
     or normalized_reason is null
     or length(normalized_reason) not between 3 and 1000
     or p_correlation_id is null then
    raise exception 'valid cohort, target, reason, CAS and correlation ID are required'
      using errcode = '22023';
  end if;

  if p_idempotency_key is null then
    effective_key := 'legacy-transition:' || p_correlation_id::text;
  else
    effective_key := btrim(p_idempotency_key);
    if length(effective_key) not between 16 and 200 then
      raise exception 'a valid idempotency key is required'
        using errcode = '22023';
    end if;
  end if;

  select cohort_record.* into cohort_row
  from public.cohorts cohort_record
  where cohort_record.id = p_cohort_id;
  if cohort_row.id is null then
    raise exception 'cohort lifecycle scope denied' using errcode = '42501';
  end if;

  can_manage := app_private.current_actor_can_manage_cohort_command(p_cohort_id);
  can_train := app_private.current_actor_can_train_cohort_command(p_cohort_id);
  if p_target_state = 'cancelled' and not can_manage then
    raise exception 'cohort cancellation scope denied' using errcode = '42501';
  elsif p_target_state <> 'cancelled' and not (can_manage or can_train) then
    raise exception 'cohort lifecycle scope denied' using errcode = '42501';
  end if;

  payload_hash := encode(extensions.digest(
    jsonb_build_object(
      'cohort_id', p_cohort_id,
      'expected_version', p_expected_version,
      'target_state', p_target_state,
      'reason', normalized_reason
    )::text,
    'sha256'
  ), 'hex');

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    v_actor_id::text || ':cohort.transition:' || effective_key, 0
  ));

  select receipt_record.* into receipt_row
  from public.cohort_schedule_command_receipts receipt_record
  where receipt_record.actor_id = v_actor_id
    and receipt_record.operation = 'cohort.transition'
    and receipt_record.idempotency_key = effective_key;
  if receipt_row.id is not null then
    if receipt_row.aggregate_id <> p_cohort_id
       or receipt_row.payload_hash <> payload_hash then
      raise exception 'idempotency key was reused with a different cohort payload'
        using errcode = '22023';
    end if;
    select populated_record.* into result_row
    from pg_catalog.jsonb_populate_record(
      null::public.cohorts, receipt_row.result
    ) populated_record;
    return result_row;
  end if;

  select cohort_record.* into cohort_row
  from public.cohorts cohort_record
  where cohort_record.id = p_cohort_id
  for update;
  can_manage := app_private.current_actor_can_manage_cohort_command(p_cohort_id);
  can_train := app_private.current_actor_can_train_cohort_command(p_cohort_id);
  if p_target_state = 'cancelled' and not can_manage then
    raise exception 'cohort cancellation scope denied' using errcode = '42501';
  elsif p_target_state <> 'cancelled' and not (can_manage or can_train) then
    raise exception 'cohort lifecycle scope denied' using errcode = '42501';
  end if;
  if cohort_row.row_version <> p_expected_version then
    raise exception 'cohort is stale' using errcode = '40001';
  end if;
  if not (
    (cohort_row.state = 'waiting' and p_target_state in ('active', 'cancelled'))
    or (
      cohort_row.state = 'active'
      and p_target_state in ('completed', 'cancelled')
    )
  ) then
    raise exception 'illegal cohort lifecycle transition' using errcode = '23514';
  end if;

  if p_target_state = 'active' then
    select version_record.* into pinned_version
    from public.content_versions version_record
    where version_record.id = cohort_row.content_version_id
    for share;
    if pinned_version.id is null
       or pinned_version.course_id <> cohort_row.course_id
       or pinned_version.state <> 'published' then
      raise exception 'cohort pinned content version is not published'
        using errcode = '23514';
    end if;
  end if;

  update public.cohorts cohort_record
  set state = p_target_state,
      starts_at = case
        when p_target_state = 'active'
          then coalesce(cohort_record.starts_at, statement_timestamp())
        else cohort_record.starts_at
      end,
      completed_at = case
        when p_target_state = 'completed' then statement_timestamp()
        else cohort_record.completed_at
      end
  where cohort_record.id = p_cohort_id
    and cohort_record.row_version = p_expected_version
  returning cohort_record.* into result_row;
  if result_row.id is null then
    raise exception 'cohort is stale' using errcode = '40001';
  end if;

  actor_role := case
    when can_train and not can_manage then 'trainer'
    else 'admin'
  end;
  audit_event_type := case p_target_state
    when 'active' then 'cohort.started'
    when 'completed' then 'cohort.completed'
    else 'cohort.cancelled'
  end;
  outbox_event_type := audit_event_type || '.v1';
  template_key := 'notifications.' || replace(audit_event_type, '.', '_');

  insert into public.audit_events (
    organization_id, actor_id, actor_role, event_type, aggregate_type,
    aggregate_id, aggregate_version, correlation_id, metadata
  ) values (
    result_row.organization_id, v_actor_id, actor_role, audit_event_type,
    'cohort', result_row.id, result_row.row_version, p_correlation_id,
    jsonb_build_object(
      'course_id', result_row.course_id,
      'content_version_id', result_row.content_version_id,
      'state', result_row.state,
      'reason', normalized_reason
    )
  );

  insert into public.outbox_events (
    organization_id, aggregate_type, aggregate_id, aggregate_version,
    event_type, schema_version, correlation_id, payload
  ) values (
    result_row.organization_id, 'cohort', result_row.id,
    result_row.row_version, outbox_event_type, 1, p_correlation_id,
    jsonb_build_object(
      'cohort_id', result_row.id,
      'course_id', result_row.course_id,
      'content_version_id', result_row.content_version_id,
      'state', result_row.state,
      'reason', normalized_reason
    )
  );

  insert into public.notifications (
    organization_id, recipient_id, event_type, template_key, payload,
    deduplication_key
  )
  select distinct
    result_row.organization_id,
    cohort_membership.user_id,
    audit_event_type,
    template_key,
    jsonb_build_object(
      'cohort_id', result_row.id,
      'course_id', result_row.course_id,
      'state', result_row.state,
      'row_version', result_row.row_version
    ),
    'cohort:' || result_row.id::text || ':state:' || result_row.state::text
      || ':version:' || result_row.row_version::text
  from public.cohort_memberships cohort_membership
  join public.profiles profile_record
    on profile_record.user_id = cohort_membership.user_id
   and profile_record.state = 'active'
   and profile_record.deactivated_at is null
  join public.organization_memberships organization_membership
    on organization_membership.organization_id = result_row.organization_id
   and organization_membership.user_id = cohort_membership.user_id
   and organization_membership.state = 'active'
   and organization_membership.removed_at is null
   and (
     organization_membership.valid_until is null
     or organization_membership.valid_until > statement_timestamp()
   )
  where cohort_membership.cohort_id = result_row.id
    and cohort_membership.role = 'learner'
    and cohort_membership.state = 'active'
    and cohort_membership.removed_at is null
  on conflict (recipient_id, deduplication_key) do nothing;

  insert into public.cohort_schedule_command_receipts (
    actor_id, operation, aggregate_id, idempotency_key, payload_hash,
    result, correlation_id
  ) values (
    v_actor_id, 'cohort.transition', result_row.id, effective_key,
    payload_hash, to_jsonb(result_row), p_correlation_id
  );

  return result_row;
end;
$$;

revoke all on function public.transition_cohort(
  uuid, bigint, public.cohort_state, text, uuid, text
) from public, anon;
grant execute on function public.transition_cohort(
  uuid, bigint, public.cohort_state, text, uuid, text
) to authenticated, service_role;

drop function if exists public.update_task_schedule(
  uuid, uuid, bigint, timestamptz, timestamptz, text, uuid
);

create function public.update_task_schedule(
  p_cohort_id uuid,
  p_task_id uuid,
  p_expected_version bigint,
  p_available_from timestamptz,
  p_due_at timestamptz,
  p_reason text,
  p_correlation_id uuid,
  p_idempotency_key text default null
)
returns public.task_schedules
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := (select auth.uid());
  normalized_reason text := nullif(btrim(p_reason), '');
  effective_key text;
  payload_hash text;
  can_manage boolean;
  can_train boolean;
  actor_role text;
  audit_event_type text;
  outbox_event_type text;
  cohort_row public.cohorts;
  pinned_version public.content_versions;
  task_row public.tasks;
  schedule_row public.task_schedules;
  receipt_row public.cohort_schedule_command_receipts;
begin
  if v_actor_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if p_cohort_id is null
     or p_task_id is null
     or p_expected_version is null or p_expected_version < 0
     or normalized_reason is null
     or length(normalized_reason) not between 3 and 1000
     or p_correlation_id is null then
    raise exception 'valid schedule, reason, CAS and correlation ID are required'
      using errcode = '22023';
  end if;
  if p_available_from is not null
     and p_due_at is not null
     and p_due_at <= p_available_from then
    raise exception 'schedule due date must be after its availability date'
      using errcode = '22023';
  end if;

  if p_idempotency_key is null then
    effective_key := 'legacy-schedule:' || p_correlation_id::text;
  else
    effective_key := btrim(p_idempotency_key);
    if length(effective_key) not between 16 and 200 then
      raise exception 'a valid idempotency key is required'
        using errcode = '22023';
    end if;
  end if;

  select cohort_record.* into cohort_row
  from public.cohorts cohort_record
  where cohort_record.id = p_cohort_id;
  if cohort_row.id is null then
    raise exception 'schedule management scope denied' using errcode = '42501';
  end if;
  can_manage := app_private.current_actor_can_manage_cohort_command(p_cohort_id);
  can_train := app_private.current_actor_can_train_cohort_command(p_cohort_id);
  if not (can_manage or can_train) then
    raise exception 'schedule management scope denied' using errcode = '42501';
  end if;

  payload_hash := encode(extensions.digest(
    jsonb_build_object(
      'cohort_id', p_cohort_id,
      'task_id', p_task_id,
      'expected_version', p_expected_version,
      'available_from', p_available_from,
      'due_at', p_due_at,
      'reason', normalized_reason
    )::text,
    'sha256'
  ), 'hex');

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    v_actor_id::text || ':task_schedule.update:' || effective_key, 0
  ));

  select receipt_record.* into receipt_row
  from public.cohort_schedule_command_receipts receipt_record
  where receipt_record.actor_id = v_actor_id
    and receipt_record.operation = 'task_schedule.update'
    and receipt_record.idempotency_key = effective_key;
  if receipt_row.id is not null then
    if receipt_row.aggregate_id <> p_cohort_id
       or receipt_row.payload_hash <> payload_hash then
      raise exception 'idempotency key was reused with a different schedule payload'
        using errcode = '22023';
    end if;
    select populated_record.* into schedule_row
    from pg_catalog.jsonb_populate_record(
      null::public.task_schedules, receipt_row.result
    ) populated_record;
    return schedule_row;
  end if;

  select cohort_record.* into cohort_row
  from public.cohorts cohort_record
  where cohort_record.id = p_cohort_id
  for update;
  can_manage := app_private.current_actor_can_manage_cohort_command(p_cohort_id);
  can_train := app_private.current_actor_can_train_cohort_command(p_cohort_id);
  if not (can_manage or can_train) then
    raise exception 'schedule management scope denied' using errcode = '42501';
  end if;
  if cohort_row.state not in ('waiting', 'active') then
    raise exception 'cohort schedule is closed' using errcode = '23514';
  end if;

  select version_record.* into pinned_version
  from public.content_versions version_record
  where version_record.id = cohort_row.content_version_id
  for share;
  if pinned_version.id is null
     or pinned_version.course_id <> cohort_row.course_id
     or (
       cohort_row.state = 'waiting'
       and pinned_version.state <> 'published'
     )
     or (
       cohort_row.state = 'active'
       and pinned_version.state not in ('published', 'archived')
     ) then
    raise exception 'cohort schedule content version is unavailable'
      using errcode = '23514';
  end if;

  select task_record.* into task_row
  from public.tasks task_record
  where task_record.id = p_task_id
    and task_record.course_id = cohort_row.course_id
    and task_record.content_version_id = cohort_row.content_version_id
    and task_record.state = 'active'
  for share;
  if task_row.id is null then
    raise exception 'task is not active in the cohort course'
      using errcode = '23514';
  end if;

  select schedule_record.* into schedule_row
  from public.task_schedules schedule_record
  where schedule_record.cohort_id = p_cohort_id
    and schedule_record.task_id = p_task_id
  for update;

  if p_expected_version = 0 then
    if schedule_row.id is not null then
      raise exception 'task schedule is stale or missing' using errcode = '40001';
    end if;
    insert into public.task_schedules (
      cohort_id, task_id, available_from, due_at, changed_by, change_reason
    ) values (
      p_cohort_id, p_task_id, p_available_from, p_due_at,
      v_actor_id, normalized_reason
    )
    returning * into schedule_row;
    audit_event_type := 'task_schedule.created';
    outbox_event_type := 'task_schedule.created.v1';
  else
    if schedule_row.id is null
       or schedule_row.row_version <> p_expected_version then
      raise exception 'task schedule is stale or missing' using errcode = '40001';
    end if;
    update public.task_schedules schedule_record
    set available_from = p_available_from,
        due_at = p_due_at,
        changed_by = v_actor_id,
        change_reason = normalized_reason
    where schedule_record.id = schedule_row.id
      and schedule_record.row_version = p_expected_version
    returning schedule_record.* into schedule_row;
    if schedule_row.id is null then
      raise exception 'task schedule is stale or missing' using errcode = '40001';
    end if;
    audit_event_type := 'task_schedule.updated';
    outbox_event_type := 'task_schedule.updated.v1';
  end if;

  actor_role := case
    when can_train and not can_manage then 'trainer'
    else 'admin'
  end;

  insert into public.audit_events (
    organization_id, actor_id, actor_role, event_type, aggregate_type,
    aggregate_id, aggregate_version, correlation_id, metadata
  ) values (
    cohort_row.organization_id, v_actor_id, actor_role, audit_event_type,
    'task_schedule', schedule_row.id, schedule_row.row_version,
    p_correlation_id,
    jsonb_build_object(
      'cohort_id', cohort_row.id,
      'task_id', p_task_id,
      'content_version_id', cohort_row.content_version_id,
      'available_from', p_available_from,
      'due_at', p_due_at,
      'reason', normalized_reason
    )
  );

  insert into public.outbox_events (
    organization_id, aggregate_type, aggregate_id, aggregate_version,
    event_type, schema_version, correlation_id, payload
  ) values (
    cohort_row.organization_id, 'task_schedule', schedule_row.id,
    schedule_row.row_version, outbox_event_type, 1, p_correlation_id,
    jsonb_build_object(
      'schedule_id', schedule_row.id,
      'cohort_id', cohort_row.id,
      'task_id', p_task_id,
      'content_version_id', cohort_row.content_version_id,
      'available_from', p_available_from,
      'due_at', p_due_at
    )
  );

  insert into public.notifications (
    organization_id, recipient_id, event_type, template_key, payload,
    deduplication_key
  )
  select distinct
    cohort_row.organization_id,
    cohort_membership.user_id,
    audit_event_type,
    case
      when audit_event_type = 'task_schedule.created'
        then 'notifications.task_schedule_created'
      else 'notifications.task_schedule_updated'
    end,
    jsonb_build_object(
      'cohort_id', cohort_row.id,
      'task_id', p_task_id,
      'available_from', p_available_from,
      'due_at', p_due_at,
      'row_version', schedule_row.row_version
    ),
    'task-schedule:' || schedule_row.id::text
      || ':version:' || schedule_row.row_version::text
  from public.cohort_memberships cohort_membership
  join public.profiles profile_record
    on profile_record.user_id = cohort_membership.user_id
   and profile_record.state = 'active'
   and profile_record.deactivated_at is null
  join public.organization_memberships organization_membership
    on organization_membership.organization_id = cohort_row.organization_id
   and organization_membership.user_id = cohort_membership.user_id
   and organization_membership.state = 'active'
   and organization_membership.removed_at is null
   and (
     organization_membership.valid_until is null
     or organization_membership.valid_until > statement_timestamp()
   )
  where cohort_membership.cohort_id = cohort_row.id
    and cohort_membership.role = 'learner'
    and cohort_membership.state = 'active'
    and cohort_membership.removed_at is null
  on conflict (recipient_id, deduplication_key) do nothing;

  insert into public.cohort_schedule_command_receipts (
    actor_id, operation, aggregate_id, idempotency_key, payload_hash,
    result, correlation_id
  ) values (
    v_actor_id, 'task_schedule.update', cohort_row.id, effective_key,
    payload_hash, to_jsonb(schedule_row), p_correlation_id
  );

  return schedule_row;
end;
$$;

revoke all on function public.update_task_schedule(
  uuid, uuid, bigint, timestamptz, timestamptz, text, uuid, text
) from public, anon;
grant execute on function public.update_task_schedule(
  uuid, uuid, bigint, timestamptz, timestamptz, text, uuid, text
) to authenticated, service_role;

-- Keep ordinary cohort metadata edits available to authorized RLS scopes, but
-- remove all browser grants that could mutate lifecycle, pin, completion,
-- ownership, CAS, or task schedules outside the audited commands.
revoke insert, update, delete on public.cohorts from authenticated;
grant update (
  name, progression_mode, capacity
) on public.cohorts to authenticated;

revoke insert, update, delete on public.task_schedules from authenticated;
