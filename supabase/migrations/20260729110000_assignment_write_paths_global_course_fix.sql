-- ═══════════════════════════════════════════════════════════════════════════
-- Phase 1b, correction 1 — global courses, and one ambiguous identifier.
--
-- 20260729100000 was exercised against the seeded data and two defects fell
-- out. Both are fixed here rather than in that file, because it has been
-- applied (FEATURE_BUILD_PLAN §6.1).
--
--
-- DEFECT 1 — a course may have NO organisation, and the only usable one hasn't.
--
-- 20260717100000 introduced globally-scoped content: courses.organization_id is
-- nullable and null means "available to every tenant". `practical-software-
-- testing` — the ONLY course in this database with a published version and a
-- cohort, and therefore the only one a learner can actually be enrolled on — is
-- exactly that: organization_id is null.
--
-- Every command in 20260729100000 read course.organization_id and used it for
-- three things. On a global course all three misfired:
--
--   • the membership check compared organization_memberships.organization_id to
--     null, which is never true, so enrolling ANY learner on the one working
--     course failed with "learner is not an active member of this
--     organisation";
--   • the permission check became has_permission(code, null, null), which
--     has_role answers only from a GLOBALLY-scoped role assignment. admin@ has
--     one and passed. org-admin@ holds a single organisation-scoped assignment
--     and would have been refused — a silent privilege difference between two
--     accounts the UI presents identically (see 7c6c5bc, which mapped both onto
--     the admin shell);
--   • cohorts.organization_id is NOT NULL, so creating the default cohort would
--     have failed on a 23502 after all the other checks had passed.
--
-- The fix is the idiom request_enrollment(p_course_id, …) already uses for the
-- same problem, lifted into a helper so all four commands share one answer:
-- for an organisation-scoped course the delivery organisation IS the course's,
-- and the person must be a member of it; for a global course it is the person's
-- own organisation, and ambiguity is refused rather than guessed.
--
-- Note WHOSE membership decides. For an enrolment it is the LEARNER's: the
-- enrolment belongs to the learner's tenant, not to whichever admin happened to
-- click. request_enrollment derives it from the requesting learner for the same
-- reason. For a trainer assignment it is the trainer's.
--
--
-- DEFECT 2 — `organization_id` was both a variable and a column.
--
-- assign_trainer_to_learner declared `organization_id uuid` and then wrote
-- `where membership.organization_id = organization_id`. plpgsql resolved it to
-- the column, not the variable, and raised 42702 "column reference is
-- ambiguous" at runtime — so the command could never succeed, in any tenant.
-- The surrounding code has a convention that would have prevented it (every
-- other function prefixes locals or names them <thing>_row); renamed to
-- resolved_organization_id.
-- ═══════════════════════════════════════════════════════════════════════════

begin;

-- ─── 1. The shared answer to "which organisation is this delivery in?" ─────

create or replace function app_private.resolve_delivery_organization(
  p_course_id uuid,
  p_user_id uuid
) returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  course_organization_id uuid;
  resolved_organization_id uuid;
  course_exists boolean;
begin
  select true, course_record.organization_id
  into course_exists, course_organization_id
  from public.courses course_record
  where course_record.id = p_course_id;
  if not course_exists then
    raise exception 'course % not found', p_course_id using errcode = 'P0002';
  end if;

  if course_organization_id is not null then
    select membership.organization_id into resolved_organization_id
    from public.organization_memberships membership
    where membership.user_id = p_user_id
      and membership.organization_id = course_organization_id
      and membership.state = 'active'
      and membership.removed_at is null
      and (membership.valid_until is null
           or membership.valid_until > statement_timestamp());
    if resolved_organization_id is null then
      raise exception
        'user % is not an active member of the organisation that owns course %',
        p_user_id, p_course_id using errcode = '23514';
    end if;
    return resolved_organization_id;
  end if;

  -- Global course: the delivery belongs to the person's own tenant. Exactly one
  -- candidate, or refuse — picking one of several would put a learner in the
  -- wrong tenant, which no later screen would reveal.
  select (array_agg(membership.organization_id
                    order by membership.organization_id))[1]
  into resolved_organization_id
  from public.organization_memberships membership
  where membership.user_id = p_user_id
    and membership.state = 'active'
    and membership.removed_at is null
    and (membership.valid_until is null
         or membership.valid_until > statement_timestamp())
  having count(*) = 1;

  if resolved_organization_id is null then
    raise exception
      'user % needs exactly one active organisation membership to join a global course',
      p_user_id using errcode = '23514';
  end if;
  return resolved_organization_id;
end;
$function$;

comment on function app_private.resolve_delivery_organization is
  'The organisation a course delivery belongs to for a given person. Handles '
  'globally-scoped courses (courses.organization_id is null), where the answer '
  'is the persons own organisation. Same rule as request_enrollment(p_course_id).';

-- ─── 2. ensure_default_course_cohort now takes the organisation ────────────
-- cohorts.organization_id is NOT NULL and cannot be copied from a global
-- course, so the caller — which has already resolved it — passes it in.

drop function if exists app_private.ensure_default_course_cohort(uuid);

create or replace function app_private.ensure_default_course_cohort(
  p_course_id uuid,
  p_organization_id uuid
) returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  cohort_id uuid;
  published_version_id uuid;
begin
  if p_organization_id is null then
    raise exception 'ensure_default_course_cohort: an organisation is required'
      using errcode = '22023';
  end if;

  select cohort_record.id into cohort_id
  from public.cohorts cohort_record
  join public.content_versions version_record
    on version_record.id = cohort_record.content_version_id
   and version_record.state = 'published'
  where cohort_record.course_id = p_course_id
    and cohort_record.organization_id = p_organization_id
    and cohort_record.state = 'active'
  order by cohort_record.created_at, cohort_record.id
  limit 1;
  if cohort_id is not null then
    return cohort_id;
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
  returning id into cohort_id;

  return cohort_id;
end;
$function$;

comment on function app_private.ensure_default_course_cohort is
  'The assignable cohort for a course within one organisation, created on '
  'demand. Cohort administration was removed from the product (QA_TEST_PLAN '
  'section 9), so no human creates these; the enrolment command does.';

-- ─── 3. enroll_learner_in_course ──────────────────────────────────────────

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
  course_row public.courses;
  delivery_organization_id uuid;
  cohort_id uuid;
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

  -- Resolved from the LEARNER, and it doubles as the "is this learner a live
  -- member?" check the previous revision made separately.
  delivery_organization_id :=
    app_private.resolve_delivery_organization(p_course_id, p_learner_id);

  -- Authorisation is now checked against the delivery organisation, so an
  -- organisation-scoped admin can administer a global course inside their own
  -- tenant. Scoping it to the course (null, for a global course) demanded a
  -- global role assignment and refused org-admin@.
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

  cohort_id := app_private.ensure_default_course_cohort(
    p_course_id, delivery_organization_id
  );

  if enrollment_row.id is not null then
    if enrollment_row.state = 'assigned'
       and enrollment_row.cohort_id = cohort_id then
      return enrollment_row;
    end if;
    update public.enrollments enrollment_record
    set state = 'assigned',
        cohort_id = cohort_id,
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
      delivery_organization_id, p_learner_id, p_course_id, cohort_id,
      'assigned', p_reason, actor_id, statement_timestamp(),
      'admin-enrol:' || p_course_id::text || ':' || p_learner_id::text
    )
    returning * into enrollment_row;
  end if;

  insert into public.cohort_memberships (
    cohort_id, user_id, role, state, assigned_by, assigned_at
  ) values (
    cohort_id, p_learner_id, 'learner', 'active', actor_id, statement_timestamp()
  )
  on conflict do nothing;

  update public.cohort_memberships membership
  set state = 'active', removed_at = null, assigned_by = actor_id
  where membership.cohort_id = cohort_id
    and membership.user_id = p_learner_id
    and membership.role = 'learner'
    and (membership.state <> 'active' or membership.removed_at is not null);

  insert into public.audit_events (
    organization_id, actor_id, actor_role, event_type, aggregate_type,
    aggregate_id, aggregate_version, correlation_id, metadata
  ) values (
    enrollment_row.organization_id, actor_id, 'admin', 'enrollment.assigned',
    'enrollment', enrollment_row.id, enrollment_row.row_version,
    p_correlation_id,
    jsonb_build_object(
      'course_id', p_course_id, 'cohort_id', cohort_id,
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
      'cohort_id', cohort_id
    ),
    'enrollment-assigned:' || enrollment_row.id::text
      || ':version:' || enrollment_row.row_version::text
  ) on conflict (recipient_id, deduplication_key) do nothing;

  return enrollment_row;
end;
$function$;

-- ─── 4. remove_learner_from_course ────────────────────────────────────────
-- Reads the organisation off the enrolment, which already carries it and can
-- never be null. No resolution needed, and none guessed.

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
    p_correlation_id,
    jsonb_build_object('decision', 'cancelled', 'reason', p_reason,
                       'course_id', p_course_id, 'source', 'admin_direct')
  );

  return enrollment_row;
end;
$function$;

-- ─── 5. assign_trainer_to_course / remove_trainer_from_course ─────────────

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

  -- Resolved from the TRAINER. is_course_trainer, which every trainer read
  -- scope runs through, joins course_trainers.organization_id to the trainer's
  -- own active membership — so any other answer produces an assignment that
  -- grants nothing and shows an empty review queue.
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
    'course', p_course_id, 1, p_correlation_id,
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
  assignment_row public.course_trainers;
  delivery_organization_id uuid;
begin
  if actor_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  -- The assignment row carries its own organisation; nothing to resolve.
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
    'course', p_course_id, 1, p_correlation_id,
    jsonb_build_object('trainer_id', p_trainer_id, 'course_id', p_course_id)
  );

  return assignment_row;
end;
$function$;

-- ─── 6. assign_trainer_to_learner — the ambiguous identifier ──────────────

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
    'profile', p_learner_id, 1, p_correlation_id,
    jsonb_build_object('learner_id', p_learner_id, 'trainer_id', p_trainer_id)
  );

  return assignment_row;
end;
$function$;

grant execute on function app_private.resolve_delivery_organization(uuid, uuid) to authenticated;

commit;

-- ─── Verification, by definition rather than existence ─────────────────────
-- These are REPLACEMENTS, so "the function exists" proves nothing — it existed
-- before the migration too. Assert on the body.
do $verify$
declare
  body text;
begin
  select proc_record.prosrc into body
  from pg_catalog.pg_proc proc_record
  join pg_catalog.pg_namespace namespace_record
    on namespace_record.oid = proc_record.pronamespace
  where namespace_record.nspname = 'public'
    and proc_record.proname = 'assign_trainer_to_learner';
  if body is null or body like '%resolved_organization_id uuid := p_organization_id%' is not true then
    raise exception 'assign_trainer_to_learner still declares the ambiguous local'
      using errcode = '55000';
  end if;

  select proc_record.prosrc into body
  from pg_catalog.pg_proc proc_record
  join pg_catalog.pg_namespace namespace_record
    on namespace_record.oid = proc_record.pronamespace
  where namespace_record.nspname = 'public'
    and proc_record.proname = 'enroll_learner_in_course';
  if body is null or body not like '%resolve_delivery_organization%' then
    raise exception 'enroll_learner_in_course was not replaced' using errcode = '55000';
  end if;

  if exists (
    select 1 from pg_catalog.pg_proc proc_record
    join pg_catalog.pg_namespace namespace_record
      on namespace_record.oid = proc_record.pronamespace
    where namespace_record.nspname = 'app_private'
      and proc_record.proname = 'ensure_default_course_cohort'
      and proc_record.pronargs = 1
  ) then
    raise exception 'the one-argument ensure_default_course_cohort survived'
      using errcode = '55000';
  end if;

  raise notice 'Phase 1b correction 1 verified';
end
$verify$;
