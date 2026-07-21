-- ═══════════════════════════════════════════════════════════════════════════
-- Course-based trainer assignment (replaces cohort-based scoping).
--
-- WHY
-- anforderung/01_RESEARCH_LERNPLATTFORM.md — the approved requirements — never
-- mentions "Gruppe", "Kohorte" or "cohort". Not once. Its data model (§7.2) is:
--
--     course_trainers    (course_id, trainer_id, assigned_by)
--     course_enrollments (course_id, student_id, enrolled_by, status)
--
-- Workflow C assigns students to COURSES ("Studenten einladen & Kursen
-- zuordnen"). Workflow D assigns trainers to COURSES ("Trainer zu Kursen
-- zuweisen / entfernen"). R8 and R16 say the same. Cohorts were invented by the
-- previous architecture and carry no requirement behind them.
--
-- STRATEGY — additive, not a cutover.
-- This migration ADDS the course-based path and leaves every cohort-based path
-- working. can_access_submission accepts EITHER. Nothing breaks the moment this
-- lands, the UI migrates at its own pace, and cohorts can be dropped later in a
-- separate migration once nothing reads them.
--
-- Rewriting an authorization model in one shot on a live database is how you
-- get a silent privilege leak. This is the strangler-fig instead.
--
-- Verified before writing: enrollments and submissions BOTH already carry
-- course_id alongside cohort_id, so no data backfill is needed for scoping —
-- only the trainer↔course link is new.
-- ═══════════════════════════════════════════════════════════════════════════

begin;

-- ─── 1. course_trainers — the missing link from §7.2 ───────────────────────

create table if not exists public.course_trainers (
  course_id       uuid not null references public.courses(id) on delete cascade,
  trainer_id      uuid not null references auth.users(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  assigned_by     uuid references auth.users(id),
  assigned_at     timestamptz not null default statement_timestamp(),
  removed_at      timestamptz,
  primary key (course_id, trainer_id)
);

comment on table public.course_trainers is
  'Trainer assigned to a course. Replaces cohort_memberships(role=trainer) as the '
  'unit of trainer scope. Matches course_trainers in requirements doc section 7.2.';

create index if not exists course_trainers_trainer_idx
  on public.course_trainers (trainer_id) where removed_at is null;
create index if not exists course_trainers_course_idx
  on public.course_trainers (course_id) where removed_at is null;

alter table public.course_trainers enable row level security;

grant select, insert, update, delete on public.course_trainers to authenticated;

-- Anyone who can manage cohorts today (admin, organization_admin) can assign
-- trainers to courses. Trainers may read their own assignments.
drop policy if exists course_trainers_scoped_read on public.course_trainers;
create policy course_trainers_scoped_read
  on public.course_trainers for select to authenticated
  using (
    trainer_id = (select auth.uid())
    or (select app_private.has_permission('cohort.manage', organization_id, null))
    or (select app_private.has_permission('content.manage', organization_id, null))
  );

drop policy if exists course_trainers_admin_write on public.course_trainers;
create policy course_trainers_admin_write
  on public.course_trainers for all to authenticated
  using ((select app_private.has_permission('cohort.manage', organization_id, null)))
  with check ((select app_private.has_permission('cohort.manage', organization_id, null)));

-- ─── 2. is_course_trainer — the course-based counterpart ───────────────────
-- Mirrors is_active_cohort_review_trainer: the assignment must be live AND the
-- trainer must still be an active member of an active organization. Dropping
-- either check would let a removed trainer keep reading submissions.

create or replace function app_private.is_course_trainer(
  p_user_id uuid,
  p_course_id uuid,
  p_organization_id uuid
) returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_user_id is not null
    and p_course_id is not null
    and p_organization_id is not null
    and exists (
      select 1
      from public.course_trainers course_trainer
      join public.organizations organization_record
        on organization_record.id = course_trainer.organization_id
       and organization_record.state = 'active'
       and organization_record.archived_at is null
      join public.organization_memberships organization_membership
        on organization_membership.organization_id = course_trainer.organization_id
       and organization_membership.user_id = p_user_id
       and organization_membership.state = 'active'
       and organization_membership.removed_at is null
       and (
         organization_membership.valid_until is null
         or organization_membership.valid_until > statement_timestamp()
       )
      where course_trainer.course_id = p_course_id
        and course_trainer.trainer_id = p_user_id
        and course_trainer.organization_id = p_organization_id
        and course_trainer.removed_at is null
    );
$$;

comment on function app_private.is_course_trainer is
  'True when the user is a live trainer on the course and still an active member '
  'of an active organization. Course-based counterpart of is_active_cohort_review_trainer.';

-- ─── 3. can_access_submission — accept EITHER path ─────────────────────────
-- submissions_scoped (SELECT) delegates to this one function, so replacing it
-- migrates the entire trainer read scope. The cohort branches are preserved
-- verbatim; only the course-trainer branch is new.

create or replace function app_private.can_access_submission(p_submission_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.submissions submission_record
    where submission_record.id = p_submission_id
      and (
        -- (a) the learner's own submission (unchanged)
        (
          submission_record.learner_id = (select auth.uid())
          and (select app_private.has_role(
            'learner',
            submission_record.organization_id,
            submission_record.cohort_id
          ))
          and (select app_private.can_access_cohort(submission_record.cohort_id))
        )
        -- (b) NEW: trainer assigned to the submission's course
        or (
          (select app_private.is_course_trainer(
            (select auth.uid()),
            submission_record.course_id,
            submission_record.organization_id
          ))
          and (select app_private.has_permission(
            'review.manage',
            submission_record.organization_id,
            null
          ))
        )
        -- (c) legacy: trainer assigned via cohort membership (kept so nothing
        --     breaks while the UI migrates; removable once cohorts are dropped)
        or (
          (select app_private.is_active_cohort_review_trainer(
            (select auth.uid()),
            submission_record.cohort_id,
            submission_record.organization_id
          ))
          and (select app_private.has_permission(
            'review.manage',
            submission_record.organization_id,
            submission_record.cohort_id
          ))
        )
        -- (d) admin override (unchanged)
        or (select app_private.has_permission(
          'cohort.manage',
          submission_record.organization_id,
          submission_record.cohort_id
        ))
      )
  );
$$;

-- ─── 4. Trainers can read enrolments for their courses (fixes I-018) ───────
-- WS-4 measured that a trainer reads 0 rows from enrollments, because
-- enrollments_scoped_read only admits the learner themselves or a holder of
-- 'enrollment.decide'. That forced the progress screen to be rebuilt from
-- cohort_memberships and made an approved-but-unassigned learner invisible to
-- their trainer. Course assignment gives it a correct, direct answer.

drop policy if exists enrollments_scoped_read on public.enrollments;
create policy enrollments_scoped_read
  on public.enrollments for select to authenticated
  using (
    learner_id = (select auth.uid())
    or (select app_private.has_permission('enrollment.decide', organization_id, cohort_id))
    or (select app_private.is_course_trainer(
          (select auth.uid()), course_id, organization_id))
  );

-- ─── 5. Backfill from the cohort world ─────────────────────────────────────
-- Every current cohort trainer becomes a course trainer on that cohort's course,
-- so the switch is invisible to anyone already working.

insert into public.course_trainers (course_id, trainer_id, organization_id, assigned_at)
select distinct cohort_record.course_id,
       cohort_membership.user_id,
       cohort_record.organization_id,
       statement_timestamp()
from public.cohort_memberships cohort_membership
join public.cohorts cohort_record on cohort_record.id = cohort_membership.cohort_id
where cohort_membership.role = 'trainer'
  and cohort_membership.state = 'active'
  and cohort_membership.removed_at is null
on conflict (course_id, trainer_id) do nothing;

-- ─── 6. Fold in the two fixes from 20260721120000 ──────────────────────────
-- (Safe to re-run; both are idempotent.)

-- I-011: cohorts had only `grant select`, so creation was impossible even though
-- the cohorts_scoped_write policy already gated it correctly.
grant insert, update, delete on public.cohorts to authenticated;

-- I-028/I-015: audit_events has DML grants but no INSERT policy, so no
-- app-level admin action could ever be logged. actor_id is pinned to the caller
-- so the actor cannot be forged; no UPDATE/DELETE policy exists, so the log
-- stays append-only from the client.
drop policy if exists audit_events_actor_insert on public.audit_events;
create policy audit_events_actor_insert
  on public.audit_events for insert to authenticated
  with check (actor_id = (select auth.uid()));

commit;
