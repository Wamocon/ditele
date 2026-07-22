-- ═══════════════════════════════════════════════════════════════════════════
-- Phase 1b — the four assignment write paths.
--
-- FEATURE_BUILD_PLAN §1.5 asks for four admin actions and their inverses:
--
--     enrol a learner on a course          remove them
--     assign a trainer to a course         remove them
--     assign a trainer to a learner        remove them
--
-- None of them is possible today. Domain tables refuse direct DML from the
-- application (ISSUES I-003/I-011/I-012 — a client insert returns 42501), and
-- there is no RPC for any of the six. The only way a learner reaches a course
-- is by requesting it themselves and an admin approving the request.
--
--
-- WHERE EACH RELATIONSHIP LIVES, AND WHY
--
-- The build plan asks specifically whether cohort_memberships.role is the right
-- home for all three, since it already carries learner|trainer. It is the right
-- home for one of them and the wrong home for the other two.
--
--   trainer ↔ course   →  public.course_trainers, WHICH ALREADY EXISTS.
--       Added by 20260721130000 for exactly this, and that migration's header
--       says why: the approved requirements model a trainer as attached to a
--       COURSE, not to a cohort, and cohort_memberships(role='trainer') was
--       explicitly superseded. It was even backfilled from cohort_memberships.
--       Nothing new is created here; only the write path was missing.
--
--   trainer ↔ learner  →  public.learner_trainers, NEW.
--       cohort_memberships cannot express this and no column of it could. Every
--       row there pairs a user with a COHORT. "This trainer, for this learner"
--       pairs a user with a USER — there is nowhere to put the second user_id,
--       and adding one would give the same table two different meanings
--       depending on which columns are null. Two trainers on one cohort do not
--       tell you which of them a given learner belongs to, which is the whole
--       question §1.5 asks.
--
--   learner ↔ course   →  public.enrollments, plus a cohort membership.
--       Not a choice: it is what the learner read path demands. A learner sees
--       a course through list_my_learning_courses →
--       current_actor_pinned_course_context, which requires an enrolment in
--       state 'assigned' joined to an ACTIVE cohort carrying a PUBLISHED
--       content pin, and current_actor_is_active_learner additionally requires
--       an active cohort_memberships row with role='learner'. An enrolment
--       without those is a row that shows the learner nothing.
--
--
-- THE DEFAULT COHORT
--
-- QA_TEST_PLAN §9 records that group (cohort) administration was removed from
-- the product: there are no /admin/groups pages and no way to create a cohort.
-- Only one of the five seeded courses has a cohort at all. So "add this student
-- to this course" would fail on four courses out of five for a reason the admin
-- cannot see or fix.
--
-- ensure_default_course_cohort resolves that: it returns the course's
-- assignable cohort and creates one pinned to the latest published version if
-- there is none. Cohorts stay in the data model — the trainer queue and the
-- progress board both show a group column — they simply stop being something a
-- human has to think about.
--
-- The cohort is created 'active' with the published pin, because
-- guard_cohort_content_pin refuses an active cohort without one, and a
-- 'waiting' cohort would not satisfy current_actor_pinned_course_context.
--
--
-- WHY AN ADMIN ENROLMENT IS INSERTED DIRECTLY AT 'assigned'
--
-- validate_named_transition allows requested → approved → assigned, and that
-- chain is right for a learner-initiated request. An admin enrolment has no
-- request: nobody asked, so there is no decision to record and no learner to
-- notify twice. The state machine constrains TRANSITIONS; it says nothing about
-- which state a row may be born in, and the trigger is BEFORE UPDATE only.
-- enrollments_decision_consistency still applies and is satisfied — decided_by
-- and decided_at name the admin who did it.
--
-- Removal does go through the machine: assigned → cancelled is a real
-- transition and the row's history should show it.
--
--
-- IDEMPOTENCY
--
-- enrollments_live_course_uidx is unique on (learner_id, course_id) for the
-- live states, so re-enrolling a learner who is already on a course is a no-op
-- that returns the existing row rather than a 23505 the UI would have to
-- interpret. course_trainers and learner_trainers are keyed on the pair and use
-- the same rule: re-assigning revives a removed row instead of failing.
-- ═══════════════════════════════════════════════════════════════════════════

begin;

-- ─── 1. learner_trainers — the one genuinely new relationship ───────────────

create table if not exists public.learner_trainers (
  learner_id      uuid not null references auth.users (id) on delete cascade,
  trainer_id      uuid not null references auth.users (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  assigned_by     uuid references auth.users (id) on delete set null,
  assigned_at     timestamptz not null default statement_timestamp(),
  removed_at      timestamptz,
  primary key (learner_id, trainer_id),
  -- §1.5: "a student can have many trainers, a trainer many students", but a
  -- person is never their own trainer.
  constraint learner_trainers_distinct_people check (learner_id <> trainer_id)
);

comment on table public.learner_trainers is
  'Which trainers mentor which learners. Many-to-many, organisation-scoped. '
  'Not expressible in cohort_memberships: that table pairs a user with a '
  'cohort, this one pairs a user with another user.';

create index if not exists learner_trainers_trainer_idx
  on public.learner_trainers (trainer_id) where removed_at is null;
create index if not exists learner_trainers_learner_idx
  on public.learner_trainers (learner_id) where removed_at is null;

alter table public.learner_trainers enable row level security;

grant select on public.learner_trainers to authenticated;
-- No DML grant. Every write goes through the RPCs below (I-003).
revoke insert, update, delete on public.learner_trainers from authenticated;

-- Both sides of the pair may read it — a learner should be able to see who
-- their trainer is — plus anyone who administers assignment.
drop policy if exists learner_trainers_scoped_read on public.learner_trainers;
create policy learner_trainers_scoped_read
  on public.learner_trainers for select to authenticated
  using (
    learner_id = (select auth.uid())
    or trainer_id = (select auth.uid())
    or (select app_private.has_permission('cohort.manage', organization_id, null))
    or (select app_private.has_permission('content.manage', organization_id, null))
  );

-- ─── 2. ensure_default_course_cohort ───────────────────────────────────────

create or replace function app_private.ensure_default_course_cohort(
  p_course_id uuid
) returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  course_row public.courses;
  cohort_id uuid;
  published_version_id uuid;
begin
  select course_record.* into course_row
  from public.courses course_record
  where course_record.id = p_course_id;
  if course_row.id is null then
    raise exception 'course % not found', p_course_id using errcode = 'P0002';
  end if;

  -- Prefer a cohort that is already assignable. Oldest first, so repeated calls
  -- land every learner in the same group rather than scattering them.
  select cohort_record.id into cohort_id
  from public.cohorts cohort_record
  join public.content_versions version_record
    on version_record.id = cohort_record.content_version_id
   and version_record.state = 'published'
  where cohort_record.course_id = p_course_id
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

  -- This is the honest failure. A course with nothing published has no content
  -- to pin, and an enrolment against it would be a row that shows the learner
  -- an empty course — which is exactly the silent-emptiness failure mode I-041
  -- warns about. Refuse loudly instead.
  if published_version_id is null then
    raise exception
      'course % has no published content version; publish it before enrolling learners',
      p_course_id
      using errcode = '23514';
  end if;

  insert into public.cohorts (
    organization_id, course_id, name, state, progression_mode,
    content_version_id, created_by
  ) values (
    course_row.organization_id, p_course_id, 'Standard', 'active', 'flexible',
    published_version_id, (select auth.uid())
  )
  returning id into cohort_id;

  return cohort_id;
end;
$function$;

comment on function app_private.ensure_default_course_cohort is
  'The assignable cohort for a course, created on demand. Cohort administration '
  'was removed from the product (QA_TEST_PLAN section 9), so no human creates '
  'these; the enrolment command does.';

-- progression_mode 'flexible' rather than 'scheduled' is deliberate:
-- learner_snapshot_task_lock_reasons adds a 'schedule' lock reason to every
-- task with no task_schedules row, and nothing creates task_schedules now that
-- cohort administration is gone. A 'scheduled' default cohort would lock every
-- task in the course.

-- ─── 3. enroll_learner_in_course ───────────────────────────────────────────

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

  -- Scoped to the COURSE's organisation, as duplicate_course is, so an admin of
  -- one tenant cannot place learners into another tenant's course.
  if not (select app_private.has_permission(
    'enrollment.decide', course_row.organization_id, null
  )) then
    raise exception 'enroll_learner_in_course: enrolment administration denied'
      using errcode = '42501';
  end if;

  if course_row.state not in ('active', 'draft') then
    raise exception 'course % is % and cannot take enrolments',
      p_course_id, course_row.state using errcode = '23514';
  end if;

  -- The same two liveness checks assign_enrollment makes. A suspended member or
  -- a deactivated profile must not be silently enrolled.
  if not exists (
    select 1 from public.organization_memberships membership
    where membership.organization_id = course_row.organization_id
      and membership.user_id = p_learner_id
      and membership.state = 'active'
      and membership.removed_at is null
      and (membership.valid_until is null
           or membership.valid_until > statement_timestamp())
  ) then
    raise exception 'learner is not an active member of this organisation'
      using errcode = '23514';
  end if;
  if not exists (
    select 1 from public.profiles profile_record
    where profile_record.user_id = p_learner_id
      and profile_record.state = 'active'
      and profile_record.deactivated_at is null
  ) then
    raise exception 'learner profile is not active' using errcode = '23514';
  end if;

  -- Already on the course? Return what is there. See the IDEMPOTENCY note.
  select enrollment_record.* into enrollment_row
  from public.enrollments enrollment_record
  where enrollment_record.learner_id = p_learner_id
    and enrollment_record.course_id = p_course_id
    and enrollment_record.state in ('requested', 'approved', 'assigned')
  limit 1;

  cohort_id := app_private.ensure_default_course_cohort(p_course_id);

  if enrollment_row.id is not null then
    -- A learner mid-request gets carried the rest of the way rather than
    -- colliding with enrollments_live_course_uidx.
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
      course_row.organization_id, p_learner_id, p_course_id, cohort_id,
      'assigned', p_reason, actor_id, statement_timestamp(),
      'admin-enrol:' || p_course_id::text || ':' || p_learner_id::text
    )
    returning * into enrollment_row;
  end if;

  -- The membership current_actor_is_active_learner insists on.
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

-- ─── 4. remove_learner_from_course ─────────────────────────────────────────

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
  course_row public.courses;
  enrollment_row public.enrollments;
begin
  if actor_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select course_record.* into course_row
  from public.courses course_record
  where course_record.id = p_course_id;
  if course_row.id is null then
    raise exception 'course % not found', p_course_id using errcode = 'P0002';
  end if;
  if not (select app_private.has_permission(
    'enrollment.decide', course_row.organization_id, null
  )) then
    raise exception 'remove_learner_from_course: enrolment administration denied'
      using errcode = '42501';
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

  update public.enrollments enrollment_record
  set state = 'cancelled',
      decision_reason = p_reason,
      decided_by = actor_id,
      decided_at = statement_timestamp()
  where enrollment_record.id = enrollment_row.id
  returning enrollment_record.* into enrollment_row;

  -- Membership is retired, not deleted: attempts and submissions reference the
  -- cohort, and removing the row would orphan the history a trainer still needs
  -- to read. Same reasoning as archiving a course rather than deleting it.
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

-- ─── 5. assign_trainer_to_course / remove_trainer_from_course ──────────────

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
  course_row public.courses;
  assignment_row public.course_trainers;
begin
  if actor_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if p_course_id is null or p_trainer_id is null then
    raise exception 'assign_trainer_to_course: a course and a trainer are required'
      using errcode = '22023';
  end if;

  select course_record.* into course_row
  from public.courses course_record
  where course_record.id = p_course_id;
  if course_row.id is null then
    raise exception 'course % not found', p_course_id using errcode = 'P0002';
  end if;
  if not (select app_private.has_permission(
    'cohort.manage', course_row.organization_id, null
  )) then
    raise exception 'assign_trainer_to_course: assignment administration denied'
      using errcode = '42501';
  end if;

  -- is_course_trainer, which every trainer read scope goes through, requires an
  -- active organisation membership. Assigning someone who has none produces an
  -- assignment that grants nothing — worth refusing where it can be explained.
  if not exists (
    select 1 from public.organization_memberships membership
    where membership.organization_id = course_row.organization_id
      and membership.user_id = p_trainer_id
      and membership.state = 'active'
      and membership.removed_at is null
      and (membership.valid_until is null
           or membership.valid_until > statement_timestamp())
  ) then
    raise exception 'trainer is not an active member of this organisation'
      using errcode = '23514';
  end if;

  insert into public.course_trainers (
    course_id, trainer_id, organization_id, assigned_by, assigned_at
  ) values (
    p_course_id, p_trainer_id, course_row.organization_id, actor_id,
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
    course_row.organization_id, actor_id, 'admin', 'course_trainer.assigned',
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
  course_row public.courses;
  assignment_row public.course_trainers;
begin
  if actor_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select course_record.* into course_row
  from public.courses course_record
  where course_record.id = p_course_id;
  if course_row.id is null then
    raise exception 'course % not found', p_course_id using errcode = 'P0002';
  end if;
  if not (select app_private.has_permission(
    'cohort.manage', course_row.organization_id, null
  )) then
    raise exception 'remove_trainer_from_course: assignment administration denied'
      using errcode = '42501';
  end if;

  -- Tombstoned, not deleted: reviews this trainer already decided reference
  -- them, and is_course_trainer keys off removed_at rather than absence.
  update public.course_trainers course_trainer
  set removed_at = statement_timestamp()
  where course_trainer.course_id = p_course_id
    and course_trainer.trainer_id = p_trainer_id
    and course_trainer.removed_at is null
  returning * into assignment_row;

  if assignment_row.course_id is null then
    raise exception 'trainer % is not assigned to course %', p_trainer_id, p_course_id
      using errcode = 'P0002';
  end if;

  insert into public.audit_events (
    organization_id, actor_id, actor_role, event_type, aggregate_type,
    aggregate_id, aggregate_version, correlation_id, metadata
  ) values (
    course_row.organization_id, actor_id, 'admin', 'course_trainer.removed',
    'course', p_course_id, 1, p_correlation_id,
    jsonb_build_object('trainer_id', p_trainer_id, 'course_id', p_course_id)
  );

  return assignment_row;
end;
$function$;

-- ─── 6. assign_trainer_to_learner / remove_trainer_from_learner ────────────

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
  organization_id uuid := p_organization_id;
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

  -- The organisation is derivable when both people share exactly one, which is
  -- the single-tenant case this deployment is. Ambiguity is refused rather than
  -- guessed: picking the wrong one would assign a trainer across tenants.
  if organization_id is null then
    select membership.organization_id into organization_id
    from public.organization_memberships membership
    where membership.user_id = p_learner_id
      and membership.state = 'active'
      and membership.removed_at is null
      and exists (
        select 1 from public.organization_memberships trainer_membership
        where trainer_membership.organization_id = membership.organization_id
          and trainer_membership.user_id = p_trainer_id
          and trainer_membership.state = 'active'
          and trainer_membership.removed_at is null
      );
    if not found then
      raise exception 'learner and trainer share no active organisation'
        using errcode = '23514';
    end if;
  end if;

  if not (select app_private.has_permission(
    'cohort.manage', organization_id, null
  )) then
    raise exception 'assign_trainer_to_learner: assignment administration denied'
      using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.organization_memberships membership
    where membership.organization_id = organization_id
      and membership.user_id = p_trainer_id
      and membership.state = 'active'
      and membership.removed_at is null
  ) then
    raise exception 'trainer is not an active member of this organisation'
      using errcode = '23514';
  end if;
  if not exists (
    select 1 from public.organization_memberships membership
    where membership.organization_id = organization_id
      and membership.user_id = p_learner_id
      and membership.state = 'active'
      and membership.removed_at is null
  ) then
    raise exception 'learner is not an active member of this organisation'
      using errcode = '23514';
  end if;

  insert into public.learner_trainers (
    learner_id, trainer_id, organization_id, assigned_by, assigned_at
  ) values (
    p_learner_id, p_trainer_id, organization_id, actor_id, statement_timestamp()
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
    organization_id, actor_id, 'admin', 'learner_trainer.assigned',
    'profile', p_learner_id, 1, p_correlation_id,
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
  assignment_row public.learner_trainers;
  organization_id uuid;
begin
  if actor_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select pairing.organization_id into organization_id
  from public.learner_trainers pairing
  where pairing.learner_id = p_learner_id
    and pairing.trainer_id = p_trainer_id;
  if organization_id is null then
    raise exception 'trainer % is not assigned to learner %', p_trainer_id, p_learner_id
      using errcode = 'P0002';
  end if;

  if not (select app_private.has_permission(
    'cohort.manage', organization_id, null
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
    raise exception 'trainer % is not assigned to learner %', p_trainer_id, p_learner_id
      using errcode = 'P0002';
  end if;

  insert into public.audit_events (
    organization_id, actor_id, actor_role, event_type, aggregate_type,
    aggregate_id, aggregate_version, correlation_id, metadata
  ) values (
    organization_id, actor_id, 'admin', 'learner_trainer.removed',
    'profile', p_learner_id, 1, p_correlation_id,
    jsonb_build_object('learner_id', p_learner_id, 'trainer_id', p_trainer_id)
  );

  return assignment_row;
end;
$function$;

-- ─── 7. Grants ─────────────────────────────────────────────────────────────
-- Callable by any signed-in user; each function checks its own permission.
-- Matching the existing commands, which are granted the same way.

grant execute on function public.enroll_learner_in_course(uuid, uuid, text, uuid) to authenticated;
grant execute on function public.remove_learner_from_course(uuid, uuid, text, uuid) to authenticated;
grant execute on function public.assign_trainer_to_course(uuid, uuid, uuid) to authenticated;
grant execute on function public.remove_trainer_from_course(uuid, uuid, uuid) to authenticated;
grant execute on function public.assign_trainer_to_learner(uuid, uuid, uuid, uuid) to authenticated;
grant execute on function public.remove_trainer_from_learner(uuid, uuid, uuid) to authenticated;

commit;

-- ─── Verification, by schema effect ────────────────────────────────────────
do $verify$
declare
  missing text;
begin
  select string_agg(expected.name, ', ') into missing
  from (values
    ('enroll_learner_in_course'), ('remove_learner_from_course'),
    ('assign_trainer_to_course'), ('remove_trainer_from_course'),
    ('assign_trainer_to_learner'), ('remove_trainer_from_learner')
  ) as expected(name)
  where not exists (
    select 1 from pg_catalog.pg_proc proc_record
    join pg_catalog.pg_namespace namespace_record
      on namespace_record.oid = proc_record.pronamespace
    where namespace_record.nspname = 'public'
      and proc_record.proname = expected.name
      and proc_record.prosecdef
  );
  if missing is not null then
    raise exception 'missing or non-SECURITY DEFINER: %', missing using errcode = '55000';
  end if;

  if not exists (
    select 1 from pg_catalog.pg_class class_record
    join pg_catalog.pg_namespace namespace_record
      on namespace_record.oid = class_record.relnamespace
    where namespace_record.nspname = 'public'
      and class_record.relname = 'learner_trainers'
      and class_record.relrowsecurity
  ) then
    raise exception 'RLS is not enabled on learner_trainers' using errcode = '55000';
  end if;

  raise notice 'Phase 1b verified: 6 commands, learner_trainers with RLS on';
end
$verify$;
