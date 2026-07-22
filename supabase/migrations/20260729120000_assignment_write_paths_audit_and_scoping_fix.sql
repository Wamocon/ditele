-- ═══════════════════════════════════════════════════════════════════════════
-- Phase 1b, correction 2 — audit_events.correlation_id, and the rest of the
-- ambiguous locals.
--
-- Two more defects, both found by executing the commands rather than reading
-- them. Both would have made every one of the six fail at runtime.
--
--
-- DEFECT 3 — audit_events.correlation_id is NOT NULL.
--
-- All six commands declared `p_correlation_id uuid default null` and passed it
-- straight into the audit insert. Every existing command in this codebase does
-- the same — decide_enrollment, assign_enrollment, transfer_submission — and
-- gets away with it only because their callers always supply one; none of them
-- gives the parameter a default. Giving it a default was the convenience that
-- turned a caller contract into a 23502 at the last statement of the function,
-- after the enrolment row and the cohort membership had already been written.
--
-- Fixed by minting one when the caller does not care, rather than by removing
-- the default. A correlation id exists to tie a chain of events together; a
-- single admin click IS the whole chain, so one generated at the point of
-- action is a truthful answer, not a placeholder. app_private.uuid7 is what
-- every table's id default already uses, so the values sort by time like the
-- rest of the log.
--
--
-- DEFECT 4 — three more locals shadowed by column names.
--
-- Correction 1 fixed `organization_id` in assign_trainer_to_learner. It fixed
-- the instance the test had reached, not the class. `cohort_id` in
-- enroll_learner_in_course is the same bug: the INSERT survived it (an INSERT …
-- VALUES has no range table, so the name can only be the variable) and the
-- UPDATE immediately after did not —
--
--     where membership.cohort_id = cohort_id
--
-- resolves cohort_id to public.cohort_memberships.cohort_id, making the
-- predicate `cohort_id = cohort_id`, which plpgsql refuses as 42702 rather than
-- silently reviving every removed membership in the table. It raised, so no
-- learner was mis-enrolled; had Postgres resolved it the other way this would
-- have been a data-corruption bug instead of a loud one.
--
-- Every local that shares a name with a column of a table the function touches
-- is renamed here: `cohort_id` → `target_cohort_id` in enroll_learner_in_course
-- and `ensure_default_course_cohort`. The convention already visible in this
-- schema — `enrollment_row`, `course_record`, `membership` — exists for exactly
-- this reason and is now followed.
-- ═══════════════════════════════════════════════════════════════════════════

begin;

drop function if exists app_private.ensure_default_course_cohort(uuid, uuid);

create or replace function app_private.ensure_default_course_cohort(
  p_course_id uuid,
  p_organization_id uuid
) returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  target_cohort_id uuid;
  published_version_id uuid;
begin
  if p_organization_id is null then
    raise exception 'ensure_default_course_cohort: an organisation is required'
      using errcode = '22023';
  end if;

  select cohort_record.id into target_cohort_id
  from public.cohorts cohort_record
  join public.content_versions version_record
    on version_record.id = cohort_record.content_version_id
   and version_record.state = 'published'
  where cohort_record.course_id = p_course_id
    and cohort_record.organization_id = p_organization_id
    and cohort_record.state = 'active'
  order by cohort_record.created_at, cohort_record.id
  limit 1;
  if target_cohort_id is not null then
    return target_cohort_id;
  end if;

  select version_record.id into published_version_id
  from public.content_versions version_record
  where version_record.course_id = p_course_id
    and version_record.state = 'published'
  order by version_record.version_number desc
  limit 1;

  if published_version_id is null then
    raise exception
      'course % has no published content version; publish it before enrolling learners',
      p_course_id using errcode = '23514';
  end if;

  insert into public.cohorts (
    organization_id, course_id, name, state, progression_mode,
    content_version_id, created_by
  ) values (
    p_organization_id, p_course_id, 'Standard', 'active', 'flexible',
    published_version_id, (select auth.uid())
  )
  returning id into target_cohort_id;

  return target_cohort_id;
end;
$function$;

comment on function app_private.ensure_default_course_cohort is
  'The assignable cohort for a course within one organisation, created on '
  'demand. Cohort administration was removed from the product (QA_TEST_PLAN '
  'section 9), so no human creates these; the enrolment command does.';

create or replace function public.enroll_learner_in_course(
  p_course_id uuid,
  p_learner_id uuid,
  p_reason text default 'Vom Administrator zugewiesen',
  p_correlation_id uuid default null
) returns public.enrollments
language plpgsql
security definer
set search_path = ''
as $function$
declare
  actor_id uuid := (select auth.uid());
  correlation_id uuid := coalesce(p_correlation_id, app_private.uuid7());
  course_row public.courses;
  delivery_organization_id uuid;
  target_cohort_id uuid;
  enrollment_row public.enrollments;
begin
  if actor_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if p_course_id is null or p_learner_id is null then
    raise exception 'enroll_learner_in_course: a course and a learner are required'
      using errcode = '22023';
  end if;

  select course_record.* into course_row
  from public.courses course_record
  where course_record.id = p_course_id;
  if course_row.id is null then
    raise exception 'course % not found', p_course_id using errcode = 'P0002';
  end if;
  if course_row.state not in ('active', 'draft') then
    raise exception 'course % is % and cannot take enrolments',
      p_course_id, course_row.state using errcode = '23514';
  end if;

  delivery_organization_id :=
    app_private.resolve_delivery_organization(p_course_id, p_learner_id);

  if not (select app_private.has_permission(
    'enrollment.decide', delivery_organization_id, null
  )) then
    raise exception 'enroll_learner_in_course: enrolment administration denied'
      using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.profiles profile_record
    where profile_record.user_id = p_learner_id
      and profile_record.state = 'active'
      and profile_record.deactivated_at is null
  ) then
    raise exception 'learner profile is not active' using errcode = '23514';
  end if;

  select enrollment_record.* into enrollment_row
  from public.enrollments enrollment_record
  where enrollment_record.learner_id = p_learner_id
    and enrollment_record.course_id = p_course_id
    and enrollment_record.state in ('requested', 'approved', 'assigned')
  limit 1;

  target_cohort_id := app_private.ensure_default_course_cohort(
    p_course_id, delivery_organization_id
  );

  if enrollment_row.id is not null then
    if enrollment_row.state = 'assigned'
       and enrollment_row.cohort_id = target_cohort_id then
      return enrollment_row;
    end if;
    update public.enrollments enrollment_record
    set state = 'assigned',
        cohort_id = target_cohort_id,
        decision_reason = p_reason,
        decided_by = actor_id,
        decided_at = statement_timestamp()
    where enrollment_record.id = enrollment_row.id
    returning enrollment_record.* into enrollment_row;
  else
    insert into public.enrollments (
      organization_id, learner_id, course_id, cohort_id, state,
      decision_reason, decided_by, decided_at, idempotency_key
    ) values (
      delivery_organization_id, p_learner_id, p_course_id, target_cohort_id,
      'assigned', p_reason, actor_id, statement_timestamp(),
      'admin-enrol:' || p_course_id::text || ':' || p_learner_id::text
    )
    returning * into enrollment_row;
  end if;

  insert into public.cohort_memberships (
    cohort_id, user_id, role, state, assigned_by, assigned_at
  ) values (
    target_cohort_id, p_learner_id, 'learner', 'active', actor_id,
    statement_timestamp()
  )
  on conflict do nothing;

  update public.cohort_memberships membership
  set state = 'active', removed_at = null, assigned_by = actor_id
  where membership.cohort_id = target_cohort_id
    and membership.user_id = p_learner_id
    and membership.role = 'learner'
    and (membership.state <> 'active' or membership.removed_at is not null);

  insert into public.audit_events (
    organization_id, actor_id, actor_role, event_type, aggregate_type,
    aggregate_id, aggregate_version, correlation_id, metadata
  ) values (
    enrollment_row.organization_id, actor_id, 'admin', 'enrollment.assigned',
    'enrollment', enrollment_row.id, enrollment_row.row_version,
    correlation_id,
    jsonb_build_object(
      'course_id', p_course_id, 'cohort_id', target_cohort_id,
      'learner_id', p_learner_id, 'source', 'admin_direct'
    )
  );

  insert into public.notifications (
    organization_id, recipient_id, event_type, template_key, payload,
    deduplication_key
  ) values (
    enrollment_row.organization_id, p_learner_id, 'enrollment.assigned',
    'notifications.enrollment_assigned',
    jsonb_build_object(
      'enrollment_id', enrollment_row.id, 'course_id', p_course_id,
      'cohort_id', target_cohort_id
    ),
    'enrollment-assigned:' || enrollment_row.id::text
      || ':version:' || enrollment_row.row_version::text
  ) on conflict (recipient_id, deduplication_key) do nothing;

  return enrollment_row;
end;
$function$;

create or replace function public.remove_learner_from_course(
  p_course_id uuid,
  p_learner_id uuid,
  p_reason text default 'Vom Administrator entfernt',
  p_correlation_id uuid default null
) returns public.enrollments
language plpgsql
security definer
set search_path = ''
as $function$
declare
  actor_id uuid := (select auth.uid());
  correlation_id uuid := coalesce(p_correlation_id, app_private.uuid7());
  enrollment_row public.enrollments;
begin
  if actor_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select enrollment_record.* into enrollment_row
  from public.enrollments enrollment_record
  where enrollment_record.learner_id = p_learner_id
    and enrollment_record.course_id = p_course_id
    and enrollment_record.state in ('requested', 'approved', 'assigned')
  limit 1
  for update;
  if enrollment_row.id is null then
    raise exception 'learner % is not enrolled on course %', p_learner_id, p_course_id
      using errcode = 'P0002';
  end if;

  if not (select app_private.has_permission(
    'enrollment.decide', enrollment_row.organization_id, null
  )) then
    raise exception 'remove_learner_from_course: enrolment administration denied'
      using errcode = '42501';
  end if;

  update public.enrollments enrollment_record
  set state = 'cancelled',
      decision_reason = p_reason,
      decided_by = actor_id,
      decided_at = statement_timestamp()
  where enrollment_record.id = enrollment_row.id
  returning enrollment_record.* into enrollment_row;

  if enrollment_row.cohort_id is not null then
    update public.cohort_memberships membership
    set state = 'removed', removed_at = statement_timestamp()
    where membership.cohort_id = enrollment_row.cohort_id
      and membership.user_id = p_learner_id
      and membership.role = 'learner'
      and membership.removed_at is null;
  end if;

  insert into public.audit_events (
    organization_id, actor_id, actor_role, event_type, aggregate_type,
    aggregate_id, aggregate_version, correlation_id, metadata
  ) values (
    enrollment_row.organization_id, actor_id, 'admin', 'enrollment.decided',
    'enrollment', enrollment_row.id, enrollment_row.row_version,
    correlation_id,
    jsonb_build_object('decision', 'cancelled', 'reason', p_reason,
                       'course_id', p_course_id, 'source', 'admin_direct')
  );

  return enrollment_row;
end;
$function$;

create or replace function public.assign_trainer_to_course(
  p_course_id uuid,
  p_trainer_id uuid,
  p_correlation_id uuid default null
) returns public.course_trainers
language plpgsql
security definer
set search_path = ''
as $function$
declare
  actor_id uuid := (select auth.uid());
  correlation_id uuid := coalesce(p_correlation_id, app_private.uuid7());
  delivery_organization_id uuid;
  assignment_row public.course_trainers;
begin
  if actor_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if p_course_id is null or p_trainer_id is null then
    raise exception 'assign_trainer_to_course: a course and a trainer are required'
      using errcode = '22023';
  end if;

  delivery_organization_id :=
    app_private.resolve_delivery_organization(p_course_id, p_trainer_id);

  if not (select app_private.has_permission(
    'cohort.manage', delivery_organization_id, null
  )) then
    raise exception 'assign_trainer_to_course: assignment administration denied'
      using errcode = '42501';
  end if;

  insert into public.course_trainers (
    course_id, trainer_id, organization_id, assigned_by, assigned_at
  ) values (
    p_course_id, p_trainer_id, delivery_organization_id, actor_id,
    statement_timestamp()
  )
  on conflict (course_id, trainer_id) do update
    set removed_at = null,
        assigned_by = actor_id,
        assigned_at = statement_timestamp(),
        organization_id = excluded.organization_id
  returning * into assignment_row;

  insert into public.audit_events (
    organization_id, actor_id, actor_role, event_type, aggregate_type,
    aggregate_id, aggregate_version, correlation_id, metadata
  ) values (
    delivery_organization_id, actor_id, 'admin', 'course_trainer.assigned',
    'course', p_course_id, 1, correlation_id,
    jsonb_build_object('trainer_id', p_trainer_id, 'course_id', p_course_id)
  );

  return assignment_row;
end;
$function$;

create or replace function public.remove_trainer_from_course(
  p_course_id uuid,
  p_trainer_id uuid,
  p_correlation_id uuid default null
) returns public.course_trainers
language plpgsql
security definer
set search_path = ''
as $function$
declare
  actor_id uuid := (select auth.uid());
  correlation_id uuid := coalesce(p_correlation_id, app_private.uuid7());
  assignment_row public.course_trainers;
  delivery_organization_id uuid;
begin
  if actor_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select course_trainer.organization_id into delivery_organization_id
  from public.course_trainers course_trainer
  where course_trainer.course_id = p_course_id
    and course_trainer.trainer_id = p_trainer_id
    and course_trainer.removed_at is null;
  if delivery_organization_id is null then
    raise exception 'trainer % is not assigned to course %', p_trainer_id, p_course_id
      using errcode = 'P0002';
  end if;

  if not (select app_private.has_permission(
    'cohort.manage', delivery_organization_id, null
  )) then
    raise exception 'remove_trainer_from_course: assignment administration denied'
      using errcode = '42501';
  end if;

  update public.course_trainers course_trainer
  set removed_at = statement_timestamp()
  where course_trainer.course_id = p_course_id
    and course_trainer.trainer_id = p_trainer_id
    and course_trainer.removed_at is null
  returning * into assignment_row;

  insert into public.audit_events (
    organization_id, actor_id, actor_role, event_type, aggregate_type,
    aggregate_id, aggregate_version, correlation_id, metadata
  ) values (
    delivery_organization_id, actor_id, 'admin', 'course_trainer.removed',
    'course', p_course_id, 1, correlation_id,
    jsonb_build_object('trainer_id', p_trainer_id, 'course_id', p_course_id)
  );

  return assignment_row;
end;
$function$;

create or replace function public.assign_trainer_to_learner(
  p_learner_id uuid,
  p_trainer_id uuid,
  p_organization_id uuid default null,
  p_correlation_id uuid default null
) returns public.learner_trainers
language plpgsql
security definer
set search_path = ''
as $function$
declare
  actor_id uuid := (select auth.uid());
  correlation_id uuid := coalesce(p_correlation_id, app_private.uuid7());
  resolved_organization_id uuid := p_organization_id;
  assignment_row public.learner_trainers;
begin
  if actor_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if p_learner_id is null or p_trainer_id is null then
    raise exception 'assign_trainer_to_learner: a learner and a trainer are required'
      using errcode = '22023';
  end if;
  if p_learner_id = p_trainer_id then
    raise exception 'a person cannot be their own trainer' using errcode = '23514';
  end if;

  if resolved_organization_id is null then
    select membership.organization_id into resolved_organization_id
    from public.organization_memberships membership
    where membership.user_id = p_learner_id
      and membership.state = 'active'
      and membership.removed_at is null
      and (membership.valid_until is null
           or membership.valid_until > statement_timestamp())
      and exists (
        select 1 from public.organization_memberships trainer_membership
        where trainer_membership.organization_id = membership.organization_id
          and trainer_membership.user_id = p_trainer_id
          and trainer_membership.state = 'active'
          and trainer_membership.removed_at is null
          and (trainer_membership.valid_until is null
               or trainer_membership.valid_until > statement_timestamp())
      )
    order by membership.organization_id
    limit 1;
    if resolved_organization_id is null then
      raise exception 'learner and trainer share no active organisation'
        using errcode = '23514';
    end if;
  else
    if not exists (
      select 1 from public.organization_memberships membership
      where membership.organization_id = resolved_organization_id
        and membership.user_id = p_learner_id
        and membership.state = 'active'
        and membership.removed_at is null
    ) then
      raise exception 'learner is not an active member of this organisation'
        using errcode = '23514';
    end if;
    if not exists (
      select 1 from public.organization_memberships membership
      where membership.organization_id = resolved_organization_id
        and membership.user_id = p_trainer_id
        and membership.state = 'active'
        and membership.removed_at is null
    ) then
      raise exception 'trainer is not an active member of this organisation'
        using errcode = '23514';
    end if;
  end if;

  if not (select app_private.has_permission(
    'cohort.manage', resolved_organization_id, null
  )) then
    raise exception 'assign_trainer_to_learner: assignment administration denied'
      using errcode = '42501';
  end if;

  insert into public.learner_trainers (
    learner_id, trainer_id, organization_id, assigned_by, assigned_at
  ) values (
    p_learner_id, p_trainer_id, resolved_organization_id, actor_id,
    statement_timestamp()
  )
  on conflict (learner_id, trainer_id) do update
    set removed_at = null,
        assigned_by = actor_id,
        assigned_at = statement_timestamp(),
        organization_id = excluded.organization_id
  returning * into assignment_row;

  insert into public.audit_events (
    organization_id, actor_id, actor_role, event_type, aggregate_type,
    aggregate_id, aggregate_version, correlation_id, metadata
  ) values (
    resolved_organization_id, actor_id, 'admin', 'learner_trainer.assigned',
    'profile', p_learner_id, 1, correlation_id,
    jsonb_build_object('learner_id', p_learner_id, 'trainer_id', p_trainer_id)
  );

  return assignment_row;
end;
$function$;

create or replace function public.remove_trainer_from_learner(
  p_learner_id uuid,
  p_trainer_id uuid,
  p_correlation_id uuid default null
) returns public.learner_trainers
language plpgsql
security definer
set search_path = ''
as $function$
declare
  actor_id uuid := (select auth.uid());
  correlation_id uuid := coalesce(p_correlation_id, app_private.uuid7());
  assignment_row public.learner_trainers;
  resolved_organization_id uuid;
begin
  if actor_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select pairing.organization_id into resolved_organization_id
  from public.learner_trainers pairing
  where pairing.learner_id = p_learner_id
    and pairing.trainer_id = p_trainer_id;
  if resolved_organization_id is null then
    raise exception 'trainer % is not assigned to learner %', p_trainer_id, p_learner_id
      using errcode = 'P0002';
  end if;

  if not (select app_private.has_permission(
    'cohort.manage', resolved_organization_id, null
  )) then
    raise exception 'remove_trainer_from_learner: assignment administration denied'
      using errcode = '42501';
  end if;

  update public.learner_trainers pairing
  set removed_at = statement_timestamp()
  where pairing.learner_id = p_learner_id
    and pairing.trainer_id = p_trainer_id
    and pairing.removed_at is null
  returning * into assignment_row;

  if assignment_row.learner_id is null then
    raise exception 'trainer % is already unassigned from learner %',
      p_trainer_id, p_learner_id using errcode = 'P0002';
  end if;

  insert into public.audit_events (
    organization_id, actor_id, actor_role, event_type, aggregate_type,
    aggregate_id, aggregate_version, correlation_id, metadata
  ) values (
    resolved_organization_id, actor_id, 'admin', 'learner_trainer.removed',
    'profile', p_learner_id, 1, correlation_id,
    jsonb_build_object('learner_id', p_learner_id, 'trainer_id', p_trainer_id)
  );

  return assignment_row;
end;
$function$;

commit;

-- ─── Verification ──────────────────────────────────────────────────────────
-- Again by DEFINITION: all six functions already existed, so existence proves
-- nothing. Assert that none of them can still pass a null correlation id, and
-- that no local named after a column survives.
do $verify$
declare
  offender text;
begin
  select string_agg(proc_record.proname, ', ') into offender
  from pg_catalog.pg_proc proc_record
  join pg_catalog.pg_namespace namespace_record
    on namespace_record.oid = proc_record.pronamespace
  where namespace_record.nspname = 'public'
    and proc_record.proname in (
      'enroll_learner_in_course', 'remove_learner_from_course',
      'assign_trainer_to_course', 'remove_trainer_from_course',
      'assign_trainer_to_learner', 'remove_trainer_from_learner'
    )
    and proc_record.prosrc not like '%coalesce(p_correlation_id, app_private.uuid7())%';
  if offender is not null then
    raise exception 'still able to write a null correlation_id: %', offender
      using errcode = '55000';
  end if;

  select string_agg(proc_record.proname, ', ') into offender
  from pg_catalog.pg_proc proc_record
  join pg_catalog.pg_namespace namespace_record
    on namespace_record.oid = proc_record.pronamespace
  where namespace_record.nspname in ('public', 'app_private')
    and proc_record.proname in (
      'enroll_learner_in_course', 'ensure_default_course_cohort'
    )
    and proc_record.prosrc ~ '^\s*cohort_id uuid';
  if offender is not null then
    raise exception 'a local named cohort_id survived in: %', offender
      using errcode = '55000';
  end if;

  raise notice 'Phase 1b correction 2 verified';
end
$verify$;
