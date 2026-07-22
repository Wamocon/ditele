-- ═══════════════════════════════════════════════════════════════════════════
-- A course-assigned trainer can open the queue but cannot read anything in it.
--
-- Migration 20260721130000 moved trainer authorization from cohort membership
-- to COURSE assignment: `can_access_submission` grew branch (b), "trainer
-- assigned to the submission's course", and that is why the review queue lists
-- the row at all. Three older gates were never told about the new model, and
-- each still insists on a `cohort_memberships` row the modern trainer does not
-- have:
--
--   1. app_private.can_train_cohort      → tasks_pinned_trainer_read, whose
--      denial cascades into task_localizations_member_read (its USING clause
--      joins public.tasks), so the task title reads as "—".
--   2. profiles_shared_active_cohort_trainer_read → the learner's display name
--      reads as "—".
--   3. public.get_submission_review_context → returns NULL, and the review
--      screen renders "Abgabe nicht verfügbar" for a submission the same
--      trainer is explicitly assigned to review.
--
-- Measured on the live database, not inferred: Trainer Eins holds the `trainer`
-- role (permissions: catalog.read, cohort.read, profile.read_self,
-- profile.update_self, question.manage, review.manage — NOT cohort.manage) and
-- has a live public.course_trainers row for the submitted course, but
-- public.cohort_memberships contains exactly one row, the learner's. Every
-- other precondition is sound: the cohort is active, its content_version_id
-- matches the id frozen into the submission snapshot, that version is
-- published, and the task is present in the snapshot with a `de` localization.
-- Authorization was the only thing failing.
--
-- Each addition below mirrors branch (b) of can_access_submission exactly —
-- `is_course_trainer(...)` AND `review.manage` — so this widens nothing beyond
-- the trainers the database already lets read the submission itself. It grants
-- no new visibility to anyone who could not already open the queue row.
-- ═══════════════════════════════════════════════════════════════════════════

begin;

-- ─── 1. can_train_cohort learns the course-based model ─────────────────────
-- Recreated in full rather than patched: the body is short and reproducing it
-- verbatim is safer than string surgery. The two existing branches are
-- unchanged; the third is new.
create or replace function app_private.can_train_cohort(p_cohort_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.cohorts cohort_record
    where cohort_record.id = p_cohort_id
      and (
        (select app_private.has_permission(
          'cohort.manage', cohort_record.organization_id, cohort_record.id
        ))
        or (
          cohort_record.state in ('waiting', 'active', 'completed')
          and exists (
            select 1
            from public.cohort_memberships cohort_membership
            where cohort_membership.cohort_id = cohort_record.id
              and cohort_membership.user_id = (select auth.uid())
              and cohort_membership.role = 'trainer'
              and cohort_membership.state = 'active'
              and cohort_membership.removed_at is null
              and (select app_private.has_role(
                'trainer', cohort_record.organization_id, cohort_record.id
              ))
              and (select app_private.has_permission(
                'cohort.read',
                cohort_record.organization_id,
                cohort_record.id
              ))
          )
        )
        -- NEW: assigned to the cohort's COURSE (20260721130000's model).
        or (
          cohort_record.state in ('waiting', 'active', 'completed')
          and (select app_private.is_course_trainer(
            (select auth.uid()),
            cohort_record.course_id,
            cohort_record.organization_id
          ))
          and (select app_private.has_permission(
            'review.manage', cohort_record.organization_id, null
          ))
        )
      )
  );
$$;

alter function app_private.can_train_cohort(uuid) owner to postgres;
revoke all on function app_private.can_train_cohort(uuid)
  from public, anon, authenticated, service_role;
grant execute on function app_private.can_train_cohort(uuid)
  to authenticated, service_role;

-- ─── 2. The learner's name ─────────────────────────────────────────────────
-- An ADDITIONAL policy, not a replacement: PostgreSQL ORs permissive policies
-- together, so the cohort-based rule keeps working untouched for trainers who
-- do have a membership row.
drop policy if exists profiles_course_trainer_read on public.profiles;
create policy profiles_course_trainer_read on public.profiles
  for select to authenticated
  using (exists (
    select 1
    from public.enrollments enrollment_record
    where enrollment_record.learner_id = profiles.user_id
      and (select app_private.is_course_trainer(
        (select auth.uid()),
        enrollment_record.course_id,
        enrollment_record.organization_id
      ))
      and (select app_private.has_permission(
        'review.manage', enrollment_record.organization_id, null
      ))
  ));

comment on policy profiles_course_trainer_read on public.profiles is
  'A trainer assigned to a course may read the display name of learners '
  'enrolled in it. Mirrors branch (b) of app_private.can_access_submission.';

-- ─── 3. The review context RPC ─────────────────────────────────────────────
-- Patched rather than re-declared: the body is ~120 lines of validated
-- projection logic and retyping it to change one predicate is how a subtle
-- corruption gets introduced — the idiom migrations 20260717100050 and
-- 20260722100000 already use. Idempotent: re-running detects the applied text
-- and returns early. Aborts if the frozen predecessor is not what we expect,
-- rather than applying a partial rewrite.
do $migration$
declare
  function_body text;
  old_auth constant text :=
$old$        or app_private.has_permission(
          'cohort.manage',
          submission_record.organization_id,
          submission_record.cohort_id
        )
      )$old$;
  new_auth constant text :=
$new$        or app_private.has_permission(
          'cohort.manage',
          submission_record.organization_id,
          submission_record.cohort_id
        )
        or (
          app_private.is_course_trainer(
            (select auth.uid()),
            submission_record.course_id,
            submission_record.organization_id
          )
          and app_private.has_permission(
            'review.manage',
            submission_record.organization_id,
            null
          )
        )
      )$new$;
  occurrences integer;
begin
  select procedure_record.prosrc into function_body
  from pg_catalog.pg_proc procedure_record
  where procedure_record.oid =
    'public.get_submission_review_context(uuid,text)'::regprocedure;

  if function_body is null then
    raise exception 'get_submission_review_context is missing'
      using errcode = '55000';
  end if;

  if position('is_course_trainer' in function_body) > 0 then
    raise notice 'review context already course-aware; nothing to do';
    return;
  end if;

  occurrences := (length(function_body) - length(
    replace(function_body, old_auth, '')
  )) / length(old_auth);
  if occurrences <> 1 then
    raise exception
      'review-context authorization block does not match the frozen contract '
      '(found % occurrences, expected 1)', occurrences
      using errcode = '55000';
  end if;

  function_body := replace(function_body, old_auth, new_auth);

  execute format($function$
    create or replace function public.get_submission_review_context(
      p_submission_id uuid,
      p_locale text default 'en'
    )
    returns jsonb
    language sql
    stable
    security definer
    set search_path = ''
    as %L
  $function$, function_body);
end
$migration$;

alter function public.get_submission_review_context(uuid, text)
  owner to postgres;
revoke all on function public.get_submission_review_context(uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function public.get_submission_review_context(uuid, text)
  to authenticated, service_role;

-- ─── Verification ──────────────────────────────────────────────────────────
do $verify$
declare
  observed integer;
begin
  select count(*) into observed
  from pg_catalog.pg_policy
  where polrelid = 'public.profiles'::regclass
    and polname = 'profiles_course_trainer_read';
  if observed <> 1 then
    raise exception 'profiles_course_trainer_read was not created'
      using errcode = '55000';
  end if;

  if position('is_course_trainer' in (
    select procedure_record.prosrc
    from pg_catalog.pg_proc procedure_record
    where procedure_record.oid =
      'public.get_submission_review_context(uuid,text)'::regprocedure
  )) = 0 then
    raise exception 'review context did not become course-aware'
      using errcode = '55000';
  end if;

  if position('is_course_trainer' in (
    select procedure_record.prosrc
    from pg_catalog.pg_proc procedure_record
    where procedure_record.oid =
      'app_private.can_train_cohort(uuid)'::regprocedure
  )) = 0 then
    raise exception 'can_train_cohort did not become course-aware'
      using errcode = '55000';
  end if;

  raise notice 'course-trainer context reads in place';
end
$verify$;

commit;
