-- ═══════════════════════════════════════════════════════════════════════════
-- A course-assigned trainer can see the queue, but every column in it is "—",
-- and the decision is locked with a message about a "Gruppe".
--
-- `20260805200000` fixed three gates and stopped short of the two that matter
-- most. Measured on the cloud project as Trainer Eins, who holds the `trainer`
-- role and a live `public.course_trainers` row for the submitted course:
--
--     public.submissions            1 row     ← the queue finds it
--     public.profiles               2 rows    ← fixed by 20260805200000
--     public.courses                0 rows    ← "Kurs: —"
--     public.course_localizations   0 rows    ← "Kurs: —"
--     public.tasks                  0 rows    ← "Aufgabe: —"
--     public.task_localizations     0 rows    ← "Aufgabe: —"
--     public.cohorts                0 rows    ← "Die Gruppe ist nicht aktiv"
--
-- ⭐ ONE cause, and it is not what the four empty content tables suggest.
--
-- Their trainer policies all have the same shape:
--
--     EXISTS (SELECT 1 FROM cohorts cohort_record
--             WHERE cohort_record.course_id = <this>.course_id
--               AND app_private.can_train_cohort(cohort_record.id))
--
-- `can_train_cohort` was taught the course-based model by `20260805200000`, so
-- the predicate itself is right. But **a policy body is not `security definer`**
-- — its subquery over `public.cohorts` is evaluated under `cohorts`' OWN RLS,
-- which is `cohorts_scoped_read` → `app_private.can_access_cohort`, and THAT
-- still requires a `cohort_memberships` row. The inner select returns zero
-- rows, so the EXISTS is false and all four policies deny. The same trap is
-- recorded in `20260727110000` as I-050: fixing the predicate a policy calls
-- does nothing while the table it reads is still shut.
--
-- So one function is repaired, not four policies, and the four unblock behind
-- it. `decide_submission` is separate and is the second half below.
-- ═══════════════════════════════════════════════════════════════════════════

begin;

-- ─── 1. can_access_cohort learns the course-based model ────────────────────
-- Recreated whole; the two existing branches are copied verbatim and the third
-- is new. It mirrors branch (b) of `app_private.can_access_submission` and the
-- branch `20260805200000` added to `can_train_cohort` — `is_course_trainer`
-- AND `review.manage` — so it widens nothing beyond the trainers the database
-- already lets open the submission itself.
create or replace function app_private.can_access_cohort(p_cohort_id uuid)
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
              and cohort_membership.state = 'active'
              and cohort_membership.removed_at is null
              and (select app_private.has_role(
                cohort_membership.role::text,
                cohort_record.organization_id,
                cohort_record.id
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

alter function app_private.can_access_cohort(uuid) owner to postgres;
revoke all on function app_private.can_access_cohort(uuid)
  from public, anon, authenticated, service_role;
grant execute on function app_private.can_access_cohort(uuid)
  to authenticated, service_role;

comment on function app_private.can_access_cohort is
  'Cohort visibility. Three ways in: cohort.manage, an active cohort '
  'membership, or assignment to the cohort''s COURSE. The third exists because '
  'every trainer read policy on courses/tasks/localizations reaches through a '
  'subquery on public.cohorts, and a policy body is not security definer — so '
  'those policies are only as open as this function is.';

-- ─── 2. The decision itself ────────────────────────────────────────────────
-- Without this the fix above would be worse than the bug: the button would
-- light up and then fail with a bare 42501, because `decide_submission` asks
-- `is_active_cohort_review_trainer` (cohort membership) or `cohort.manage`,
-- and a course-assigned trainer has neither.
--
-- Patched rather than re-declared — the idiom of 20260717100050, 20260722100000
-- and 20260805200000. Idempotent, and it aborts rather than half-applying if
-- the deployed text is not the one this was written against.
do $migration$
declare
  function_body text;
  old_auth constant text :=
$old$  actor_can_manage := app_private.has_permission(
    'cohort.manage',
    submission_record.organization_id,
    submission_record.cohort_id
  );$old$;
  new_auth constant text :=
$new$  actor_can_manage := app_private.has_permission(
    'cohort.manage',
    submission_record.organization_id,
    submission_record.cohort_id
  );
  -- Assigned to the submission's COURSE. Mirrors branch (b) of
  -- app_private.can_access_submission, which is what let this trainer read
  -- the submission and open the review screen in the first place.
  if not actor_is_trainer and not actor_can_manage then
    actor_is_trainer := app_private.is_course_trainer(
      actor_id,
      submission_record.course_id,
      submission_record.organization_id
    ) and app_private.has_permission(
      'review.manage', submission_record.organization_id, null
    );
  end if;$new$;
  occurrences integer;
begin
  select procedure_record.prosrc into function_body
  from pg_catalog.pg_proc procedure_record
  where procedure_record.oid = ('public.decide_submission(uuid,uuid,bigint,'
    || 'public.review_decision,text,jsonb,text,uuid)')::regprocedure;

  if function_body is null then
    raise exception 'decide_submission is missing' using errcode = '55000';
  end if;

  if position('is_course_trainer' in function_body) > 0 then
    raise notice 'decide_submission already course-aware; nothing to do';
    return;
  end if;

  occurrences := (length(function_body) - length(
    replace(function_body, old_auth, '')
  )) / length(old_auth);
  if occurrences <> 1 then
    raise exception
      'decide_submission authorization block does not match the frozen '
      'contract (found % occurrences, expected 1)', occurrences
      using errcode = '55000';
  end if;

  function_body := replace(function_body, old_auth, new_auth);

  execute format($function$
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
    as %L
  $function$, function_body);
end
$migration$;

alter function public.decide_submission(
  uuid, uuid, bigint, public.review_decision, text, jsonb, text, uuid
) owner to postgres;
revoke all on function public.decide_submission(
  uuid, uuid, bigint, public.review_decision, text, jsonb, text, uuid
) from public, anon, authenticated, service_role;
grant execute on function public.decide_submission(
  uuid, uuid, bigint, public.review_decision, text, jsonb, text, uuid
) to authenticated, service_role;

commit;

-- ─── Verification, as the trainer and by row counts ────────────────────────
-- Asserting the function bodies changed would prove only that the text moved.
-- What was broken is what a trainer can SEE, so that is what is measured —
-- through RLS, as `authenticated`, with the trainer's own claim.
do $verify$
declare
  trainer constant uuid := '01991007-0000-7000-8000-000000000002';
  observed integer;
begin
  if not exists (select 1 from auth.users where id = trainer) then
    raise notice 'Trainer Eins is not on this deployment — skipping the read check';
    return;
  end if;
  if not exists (
    select 1 from public.course_trainers
    where trainer_id = trainer and removed_at is null
  ) then
    raise notice 'Trainer Eins is assigned to no course — skipping the read check';
    return;
  end if;

  perform set_config('request.jwt.claims',
                     json_build_object('sub', trainer, 'role', 'authenticated')::text,
                     true);
  perform set_config('role', 'authenticated', true);

  select count(*) into observed from public.cohorts;
  if observed = 0 then
    raise exception 'the course trainer still reads no cohorts';
  end if;

  select count(*) into observed from public.courses;
  if observed = 0 then
    raise exception 'the course trainer still reads no courses — "Kurs: —"';
  end if;

  select count(*) into observed from public.course_localizations;
  if observed = 0 then
    raise exception 'the course trainer still reads no course titles';
  end if;

  select count(*) into observed from public.tasks;
  if observed = 0 then
    raise exception 'the course trainer still reads no tasks — "Aufgabe: —"';
  end if;

  select count(*) into observed from public.task_localizations;
  if observed = 0 then
    raise exception 'the course trainer still reads no task titles';
  end if;

  perform set_config('role', 'postgres', true);
  raise notice 'course trainer reads cohorts, courses and tasks';
end
$verify$;

do $verify_decide$
begin
  if position('is_course_trainer' in (
    select procedure_record.prosrc
    from pg_catalog.pg_proc procedure_record
    where procedure_record.oid = ('public.decide_submission(uuid,uuid,bigint,'
      || 'public.review_decision,text,jsonb,text,uuid)')::regprocedure
  )) = 0 then
    raise exception 'decide_submission did not become course-aware';
  end if;
  raise notice 'decide_submission accepts a course-assigned trainer';
end
$verify_decide$;
