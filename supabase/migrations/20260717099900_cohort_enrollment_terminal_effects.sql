-- Cohort terminal transitions own the linked enrollment terminal effects.
--
-- Lock order is deliberately shared with assign_enrollment: enrollment rows,
-- the cohort assignment-revision guard, and then the cohort row. A terminal
-- command that waited for a committed assignment fails with a retryable stale
-- result; an assignment waiting behind terminalization observes the terminal
-- cohort and fails without becoming linked.

create table app_private.cohort_assignment_revisions (
  cohort_id uuid primary key
    references public.cohorts(id) on delete cascade,
  revision bigint not null default 0 check (revision >= 0),
  updated_at timestamptz not null default statement_timestamp()
);

revoke all on table app_private.cohort_assignment_revisions
  from public, anon, authenticated, service_role;

insert into app_private.cohort_assignment_revisions (cohort_id)
select cohort_record.id
from public.cohorts cohort_record
on conflict (cohort_id) do nothing;

create or replace function app_private.initialize_cohort_assignment_revision()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into app_private.cohort_assignment_revisions (cohort_id)
  values (new.id)
  on conflict (cohort_id) do nothing;
  return new;
end;
$$;

revoke all on function app_private.initialize_cohort_assignment_revision()
  from public, anon, authenticated, service_role;

create trigger cohorts_initialize_assignment_revision
after insert on public.cohorts
for each row execute function app_private.initialize_cohort_assignment_revision();

-- Assignment and terminalization share the private revision row between the
-- enrollment and cohort locks. The revision closes the READ COMMITTED
-- statement-snapshot gap: an assignment or terminal command that waited for a
-- just-committed assignment aborts with a retryable stale result instead of
-- using stale capacity or completing a cohort with an assigned enrollment.
create or replace function public.assign_enrollment(
  p_enrollment_id uuid,
  p_cohort_id uuid,
  p_expected_version bigint,
  p_reason text,
  p_correlation_id uuid
)
returns public.enrollments
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  enrollment_row public.enrollments;
  cohort_row public.cohorts;
  observed_assignment_revision bigint;
  assignment_revision bigint;
  active_learner_count integer;
  membership_exists boolean;
begin
  if actor_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if nullif(btrim(p_reason), '') is null then
    raise exception 'assignment reason is required' using errcode = '22023';
  end if;

  select enrollment_record.* into enrollment_row
  from public.enrollments enrollment_record
  where enrollment_record.id = p_enrollment_id
  for update;

  if enrollment_row.id is null then
    raise exception 'enrollment is missing' using errcode = '40001';
  end if;
  if not (select app_private.has_permission(
    'enrollment.decide', enrollment_row.organization_id, p_cohort_id
  )) then
    raise exception 'enrollment assignment scope denied' using errcode = '42501';
  end if;
  if enrollment_row.row_version <> p_expected_version
     or enrollment_row.state <> 'approved' then
    raise exception 'enrollment is stale or not approved' using errcode = '40001';
  end if;

  select revision_record.revision into observed_assignment_revision
  from app_private.cohort_assignment_revisions revision_record
  where revision_record.cohort_id = p_cohort_id;
  if observed_assignment_revision is null then
    raise exception 'cohort assignment revision is missing'
      using errcode = '55000';
  end if;

  select revision_record.revision into assignment_revision
  from app_private.cohort_assignment_revisions revision_record
  where revision_record.cohort_id = p_cohort_id
  for update;

  if assignment_revision is null then
    raise exception 'cohort assignment revision is missing'
      using errcode = '55000';
  end if;
  if assignment_revision <> observed_assignment_revision then
    raise exception 'cohort assignments changed; retry assignment'
      using errcode = '40001';
  end if;

  select cohort_record.* into cohort_row
  from public.cohorts cohort_record
  where cohort_record.id = p_cohort_id
  for update;

  if cohort_row.id is null
     or cohort_row.organization_id <> enrollment_row.organization_id
     or cohort_row.course_id <> enrollment_row.course_id then
    raise exception 'cohort does not match enrollment organization and course'
      using errcode = '23514';
  end if;
  if cohort_row.state not in ('waiting', 'active') then
    raise exception 'cohort is not assignable' using errcode = '23514';
  end if;
  if not exists (
    select 1 from public.organization_memberships membership
    where membership.organization_id = enrollment_row.organization_id
      and membership.user_id = enrollment_row.learner_id
      and membership.state = 'active'
      and membership.removed_at is null
      and (
        membership.valid_until is null
        or membership.valid_until > statement_timestamp()
      )
  ) then
    raise exception 'learner is not an active organization member'
      using errcode = '23514';
  end if;
  if not exists (
    select 1 from public.profiles profile_record
    where profile_record.user_id = enrollment_row.learner_id
      and profile_record.state = 'active'
      and profile_record.deactivated_at is null
  ) then
    raise exception 'learner profile is not active'
      using errcode = '23514';
  end if;

  select exists (
    select 1 from public.cohort_memberships membership
    where membership.cohort_id = cohort_row.id
      and membership.user_id = enrollment_row.learner_id
      and membership.role = 'learner'
      and membership.state = 'active'
      and membership.removed_at is null
  ) into membership_exists;

  select count(*) into active_learner_count
  from public.cohort_memberships membership
  where membership.cohort_id = cohort_row.id
    and membership.role = 'learner'
    and membership.state = 'active'
    and membership.removed_at is null;

  if not membership_exists
     and cohort_row.capacity is not null
     and active_learner_count >= cohort_row.capacity then
    raise exception 'cohort capacity is exhausted' using errcode = '23514';
  end if;

  if not membership_exists then
    insert into public.cohort_memberships (
      cohort_id, user_id, role, state, assigned_by, assigned_at
    ) values (
      cohort_row.id, enrollment_row.learner_id, 'learner', 'active', actor_id,
      statement_timestamp()
    );
  end if;

  update public.enrollments enrollment_record
  set state = 'assigned',
      cohort_id = cohort_row.id,
      decision_reason = p_reason,
      decided_by = actor_id,
      decided_at = statement_timestamp()
  where enrollment_record.id = enrollment_row.id
    and enrollment_record.row_version = p_expected_version
  returning enrollment_record.* into enrollment_row;
  if enrollment_row.id is null then
    raise exception 'enrollment became stale' using errcode = '40001';
  end if;

  update app_private.cohort_assignment_revisions revision_record
  set revision = revision_record.revision + 1,
      updated_at = statement_timestamp()
  where revision_record.cohort_id = cohort_row.id
    and revision_record.revision = assignment_revision
  returning revision_record.revision into assignment_revision;
  if assignment_revision is null then
    raise exception 'cohort assignment revision became stale'
      using errcode = '40001';
  end if;

  insert into public.audit_events (
    organization_id, actor_id, actor_role, event_type, aggregate_type,
    aggregate_id, aggregate_version, correlation_id, metadata
  ) values (
    enrollment_row.organization_id, actor_id, 'admin',
    'enrollment.assigned', 'enrollment', enrollment_row.id,
    enrollment_row.row_version, p_correlation_id,
    jsonb_build_object('cohort_id', cohort_row.id, 'reason', p_reason)
  );

  insert into public.outbox_events (
    organization_id, aggregate_type, aggregate_id, aggregate_version,
    event_type, schema_version, correlation_id, payload
  ) values (
    enrollment_row.organization_id, 'enrollment', enrollment_row.id,
    enrollment_row.row_version, 'enrollment.assigned.v1', 1,
    p_correlation_id,
    jsonb_build_object(
      'enrollment_id', enrollment_row.id,
      'learner_id', enrollment_row.learner_id,
      'course_id', enrollment_row.course_id,
      'cohort_id', cohort_row.id
    )
  );

  insert into public.notifications (
    organization_id, recipient_id, event_type, template_key, payload,
    deduplication_key
  ) values (
    enrollment_row.organization_id,
    enrollment_row.learner_id,
    'enrollment.assigned',
    'notifications.enrollment_assigned',
    jsonb_build_object(
      'enrollment_id', enrollment_row.id,
      'course_id', enrollment_row.course_id,
      'cohort_id', cohort_row.id
    ),
    'enrollment-assigned:' || enrollment_row.id::text
      || ':version:' || enrollment_row.row_version::text
  ) on conflict (recipient_id, deduplication_key) do nothing;

  return enrollment_row;
end;
$$;

revoke all on function public.assign_enrollment(uuid, uuid, bigint, text, uuid)
  from public, anon;
grant execute on function public.assign_enrollment(uuid, uuid, bigint, text, uuid)
  to authenticated, service_role;

create or replace function public.transition_cohort(
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
  enrollment_event_type text;
  enrollment_outbox_event_type text;
  template_key text;
  membership_policy text;
  transitioned_enrollment_ids uuid[] := '{}'::uuid[];
  affected_enrollment_count bigint := 0;
  observed_assignment_revision bigint;
  locked_assignment_revision bigint;
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

  -- assign_enrollment locks enrollment, assignment revision, then cohort.
  -- Terminal commands use that same order for every already-linked row.
  if p_target_state in ('completed', 'cancelled') then
    select revision_record.revision into observed_assignment_revision
    from app_private.cohort_assignment_revisions revision_record
    where revision_record.cohort_id = p_cohort_id;
    if observed_assignment_revision is null then
      raise exception 'cohort assignment revision is missing'
        using errcode = '55000';
    end if;

    perform enrollment_record.id
    from public.enrollments enrollment_record
    where enrollment_record.cohort_id = p_cohort_id
    order by enrollment_record.id
    for update;

    select revision_record.revision into locked_assignment_revision
    from app_private.cohort_assignment_revisions revision_record
    where revision_record.cohort_id = p_cohort_id
    for update;
    if locked_assignment_revision is null then
      raise exception 'cohort assignment revision is missing'
        using errcode = '55000';
    end if;
    if locked_assignment_revision <> observed_assignment_revision then
      raise exception 'cohort assignments changed; retry transition'
        using errcode = '40001';
    end if;
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
  else
    -- Reassert ordered lock coverage after the cohort CAS checks. The private
    -- revision comparison above converts any stale-snapshot assignment race
    -- into an explicit retry before the cohort or enrollments are changed.
    perform enrollment_record.id
    from public.enrollments enrollment_record
    where enrollment_record.cohort_id = p_cohort_id
    order by enrollment_record.id
    for update;

    if exists (
      select 1
      from public.enrollments enrollment_record
      where enrollment_record.cohort_id = p_cohort_id
        and enrollment_record.state = 'assigned'
        and (
          enrollment_record.organization_id <> cohort_row.organization_id
          or enrollment_record.course_id <> cohort_row.course_id
        )
    ) then
      raise exception 'linked assigned enrollment does not match cohort organization and course'
        using errcode = '23514';
    end if;
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
  membership_policy := case
    when p_target_state in ('completed', 'cancelled')
      then 'preserve_active_unremoved_memberships'
    else 'unchanged'
  end;

  if p_target_state in ('completed', 'cancelled') then
    enrollment_event_type := case p_target_state
      when 'completed' then 'enrollment.completed'
      else 'enrollment.cancelled'
    end;
    enrollment_outbox_event_type := enrollment_event_type || '.v1';

    with transitioned_enrollments as (
      update public.enrollments enrollment_record
      set state = case p_target_state
            when 'completed' then 'completed'::public.enrollment_state
            else 'cancelled'::public.enrollment_state
          end,
          completed_at = case p_target_state
            when 'completed' then statement_timestamp()
            else null
          end
      where enrollment_record.cohort_id = p_cohort_id
        and enrollment_record.state = 'assigned'
        and enrollment_record.organization_id = cohort_row.organization_id
        and enrollment_record.course_id = cohort_row.course_id
      returning enrollment_record.id
    )
    select
      coalesce(
        pg_catalog.array_agg(
          transitioned_record.id order by transitioned_record.id
        ),
        '{}'::uuid[]
      ),
      count(*)
    into transitioned_enrollment_ids, affected_enrollment_count
    from transitioned_enrollments transitioned_record;
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

  if affected_enrollment_count > 0 then
    insert into public.audit_events (
      organization_id, actor_id, actor_role, event_type, aggregate_type,
      aggregate_id, aggregate_version, correlation_id, metadata
    )
    select
      enrollment_record.organization_id,
      v_actor_id,
      actor_role,
      enrollment_event_type,
      'enrollment',
      enrollment_record.id,
      enrollment_record.row_version,
      p_correlation_id,
      jsonb_build_object(
        'actor_id', v_actor_id,
        'learner_id', enrollment_record.learner_id,
        'course_id', enrollment_record.course_id,
        'cohort_id', result_row.id,
        'previous_state', 'assigned',
        'state', enrollment_record.state,
        'reason', normalized_reason
      )
    from public.enrollments enrollment_record
    where enrollment_record.id = any(transitioned_enrollment_ids)
    order by enrollment_record.id;

    insert into public.outbox_events (
      organization_id, aggregate_type, aggregate_id, aggregate_version,
      event_type, schema_version, correlation_id, payload
    )
    select
      enrollment_record.organization_id,
      'enrollment',
      enrollment_record.id,
      enrollment_record.row_version,
      enrollment_outbox_event_type,
      1,
      p_correlation_id,
      jsonb_build_object(
        'enrollment_id', enrollment_record.id,
        'actor_id', v_actor_id,
        'learner_id', enrollment_record.learner_id,
        'course_id', enrollment_record.course_id,
        'cohort_id', result_row.id,
        'previous_state', 'assigned',
        'state', enrollment_record.state,
        'reason', normalized_reason
      )
    from public.enrollments enrollment_record
    where enrollment_record.id = any(transitioned_enrollment_ids)
    order by enrollment_record.id;
  end if;

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
      'reason', normalized_reason,
      'affected_enrollment_count', affected_enrollment_count,
      'membership_policy', membership_policy
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
      'reason', normalized_reason,
      'actor_id', v_actor_id,
      'affected_enrollment_count', affected_enrollment_count,
      'membership_policy', membership_policy
    )
  );

  -- Terminal enrollment effects intentionally do not append notifications.
  -- The existing cohort notification remains the one learner-facing event.
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

comment on function public.transition_cohort(
  uuid, bigint, public.cohort_state, text, uuid, text
) is
  'CAS/idempotent cohort lifecycle command with atomic terminal enrollment effects, immutable history attribution, audit, outbox, and one cohort notification.';
