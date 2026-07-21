-- ═══════════════════════════════════════════════════════════════════════════
-- WS-12 — the oversight read. `05_…` §G10, `06_…` §8 WS-12 items 1, 2 and 5.
--
-- One `security definer` function returns the whole progress board, and it
-- serves BOTH the admin screen and the trainer screen by scoping on the
-- caller's own role.
--
-- ── Why a definer function and not a view or a set of table reads ──────────
--
-- There is no session on this deployment that can read what this board needs.
-- Measured, in `RPC_CONTRACTS.md` §10 and `plan/status/WS-11.md`:
--
--   * an **admin** reads 0 rows from `attempts` and 0 from `submissions`
--   * a **trainer** reads 0 rows from `enrollments`  (I-018)
--   * `xp_ledger`, `badge_awards` and `learner_streaks` are **self-read only**,
--     so every non-learner reads 0 rows from all three
--
-- Built from direct reads, this board would render every learner at Level 1,
-- no streak, no tasks done — and it would look like data, not like a
-- permission failure. That is the `[]`-not-an-error trap `RPC_CONTRACTS.md`
-- §10 calls the most expensive bug in this codebase, and it is worse here than
-- anywhere else: a progress board that wrongly reads "no activity for 7 days"
-- is indistinguishable from one that is working correctly and reporting a
-- stalled learner. The failure would be invisible precisely where it matters.
--
-- ── Why ONE function for two roles ────────────────────────────────────────
--
-- `06_…` §8 item 4: "migrate the trainer view to read `enrollments` directly,
-- or admin and trainer will show different numbers and nobody will trust
-- either." Two functions that are supposed to agree eventually do not. One
-- function that scopes by the caller cannot disagree with itself.
--
-- ── ⚠️ What this function deliberately does NOT do ────────────────────────
--
-- It does not call `app_private.refresh_learner_streak`. That function AWARDS
-- XP as a side effect (`20260725200000` §2: daily-activity and milestone
-- payments). Refreshing every learner's streak because an admin opened a
-- dashboard would pay real XP for an administrator's page view, which is
-- exactly the "gamification pointing the wrong way" failure `05_…` §6 names.
-- The board reads the STORED row. It is as fresh as the learner's own last
-- visit to the Arena, and that is the correct trade.
--
-- Forward-only and idempotent: `create or replace`, no data change, no drop.
-- ═══════════════════════════════════════════════════════════════════════════

begin;

-- ---------------------------------------------------------------------------
-- 1. `app_private.safe_timezone` — a bad profile value must not take a page down
-- ---------------------------------------------------------------------------
--
-- `timezone(name, ts)` RAISES on an unknown zone name. `profiles.timezone` is
-- free text, so one bad row would fail the whole board for every learner on it
-- rather than for the one it belongs to. WS-11 solved this inline with a
-- BEGIN/EXCEPTION block; a board that computes a day index per row needs it as
-- an expression, so it becomes a function here.

create or replace function app_private.safe_timezone(p_timezone text)
returns text
language plpgsql
immutable
set search_path = ''
as $tz$
declare
  candidate text := coalesce(nullif(btrim(p_timezone), ''), 'UTC');
  probe timestamptz;
begin
  probe := timezone(candidate, statement_timestamp());
  return candidate;
exception when others then
  return 'UTC';
end
$tz$;

comment on function app_private.safe_timezone(text) is
  'A profiles.timezone value that is safe to pass to timezone(). Falls back to '
  'UTC rather than raising, so one bad row cannot fail a whole report.';

-- ---------------------------------------------------------------------------
-- 2. `public.list_progress_board` — the board, role-scoped
-- ---------------------------------------------------------------------------
--
-- Returns a jsonb array, one object per active enrollment, already sorted by
-- risk. `05_…` §G10: "Sorted by risk, not alphabetically."
--
-- Every number is PLAN-RELATIVE (`06_…` §8 item 5). `day_index` counts from
-- the learner's own `enrollments.decided_at` in the learner's own timezone, and
-- `tasks_expected` resolves `task_schedules.offset_days` against that same day
-- index — so two learners who enrolled three weeks apart are compared on their
-- own clocks and neither is ahead merely for having started earlier.

create or replace function public.list_progress_board(p_locale text default 'de')
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $board$
declare
  actor_id uuid := (select auth.uid());
  board jsonb;

  -- The three risk signals of `06_…` §8 item 2, as named thresholds rather
  -- than magic numbers buried in a predicate.
  stalled_after_days constant integer := 7;
  -- "behind (completed ≪ elapsed plan)" — the design writes ≪, not <, and the
  -- difference matters. A learner one task behind their schedule is a normal
  -- Tuesday; flagging them trains an admin to ignore the column. Two is the
  -- point at which it is worth a human's attention.
  behind_shortfall constant integer := 2;
  stuck_rejections constant integer := 3;
begin
  if actor_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  with visible as (
    -- The scope decision, and the only place authorization happens.
    --
    -- `app_private.has_role(code, org)` is the shipped helper every RLS policy
    -- already uses. Calling it per row rather than computing a role once is
    -- deliberate: it handles a globally-scoped admin and an organization-scoped
    -- one identically, and it inherits the one authorization model instead of
    -- introducing a second one inside a definer function — which is how a
    -- privilege leak gets built.
    select
      enrollment.id                  as enrollment_id,
      enrollment.learner_id,
      enrollment.course_id,
      enrollment.cohort_id,
      enrollment.organization_id,
      enrollment.state::text         as enrollment_state,
      enrollment.decided_at,
      cohort.content_version_id
    from public.enrollments enrollment
    left join public.cohorts cohort on cohort.id = enrollment.cohort_id
    where enrollment.state in ('approved', 'assigned', 'completed')
      and (
        app_private.has_role('admin', enrollment.organization_id)
        or app_private.has_role('organization_admin', enrollment.organization_id)
        or exists (
          select 1
          from public.course_trainers assignment
          where assignment.course_id = enrollment.course_id
            and assignment.trainer_id = actor_id
            and assignment.removed_at is null
        )
      )
  ),
  anchored as (
    select
      visible.*,
      coalesce(profile.display_name, '') as learner_name,
      app_private.safe_timezone(profile.timezone) as learner_timezone,
      -- Day N of THIS learner's own plan. Day 1 is the day they were approved,
      -- so the number reads the way a human counts days, not the way a
      -- subtraction does.
      greatest(
        1,
        (timezone(app_private.safe_timezone(profile.timezone), statement_timestamp()))::date
          - (timezone(app_private.safe_timezone(profile.timezone),
                      coalesce(visible.decided_at, statement_timestamp())))::date
          + 1
      ) as day_index
    from visible
    left join public.profiles profile on profile.user_id = visible.learner_id
  ),
  task_totals as (
    -- The denominator. `state = 'active'` matters: a draft task is not part of
    -- anyone's plan, and this deployment holds one, so an unfiltered count
    -- would quietly overstate every learner's remaining work.
    select
      anchored.enrollment_id,
      count(*)::integer as tasks_total,
      count(*) filter (where task.task_kind = 'hunt')::integer as hunts_total,
      -- How many tasks the learner's own schedule says should be open by now.
      -- Relative rows resolve against day_index; absolute rows against the
      -- clock; an unscheduled task is open from the start. That three-way
      -- split is exactly WS-8's `task_schedules` contract, read from the other
      -- end.
      count(*) filter (
        where case
          when schedule.offset_days is not null
            then schedule.offset_days <= anchored.day_index - 1
          when schedule.available_from is not null
            then schedule.available_from <= statement_timestamp()
          else true
        end
      )::integer as tasks_expected
    from anchored
    join public.tasks task
      on task.content_version_id = anchored.content_version_id
     and task.state = 'active'
    left join public.task_schedules schedule
      on schedule.task_id = task.id
     and schedule.cohort_id = anchored.cohort_id
    group by anchored.enrollment_id
  ),
  attempt_totals as (
    select
      attempt.enrollment_id,
      count(distinct attempt.task_id) filter (where attempt.state = 'accepted')::integer as tasks_done,
      max(greatest(
        attempt.started_at,
        attempt.last_activity_at,
        coalesce(attempt.submitted_at, attempt.started_at)
      )) as last_activity_at
    from public.attempts attempt
    where attempt.enrollment_id in (select enrollment_id from anchored)
    group by attempt.enrollment_id
  ),
  hunt_totals as (
    -- An "open hunt" is a hunt task this learner has not had ACCEPTED. Not
    -- "has not started" — a hunt sitting in revision_required is still open,
    -- and it is the one an admin most wants to see.
    select
      anchored.enrollment_id,
      count(*) filter (
        where not exists (
          select 1
          from public.attempts attempt
          where attempt.enrollment_id = anchored.enrollment_id
            and attempt.task_id = task.id
            and attempt.state = 'accepted'
        )
      )::integer as open_hunts
    from anchored
    join public.tasks task
      on task.content_version_id = anchored.content_version_id
     and task.task_kind = 'hunt'
     and task.state = 'active'
    group by anchored.enrollment_id
  ),
  finding_totals as (
    select
      attempt.enrollment_id,
      count(*)::integer as pending_findings
    from public.hunt_findings finding
    join public.attempts attempt on attempt.id = finding.attempt_id
    where finding.verdict = 'pending'
      and attempt.enrollment_id in (select enrollment_id from anchored)
    group by attempt.enrollment_id
  ),
  rejection_totals as (
    -- `stuck` = the SAME hunt sent back three times. Counting rejections
    -- across different tasks would flag a learner who is simply working
    -- through hard material; counting them per task is what makes this a
    -- signal about one scenario, which is why `05_…` §G10 calls it a teaching
    -- problem rather than a student problem.
    select per_task.enrollment_id, max(per_task.rejections)::integer as worst_rejections
    from (
      select
        attempt.enrollment_id,
        submission.task_id,
        count(*) as rejections
      from public.reviews review
      join public.submissions submission on submission.id = review.submission_id
      join public.attempts attempt on attempt.id = submission.attempt_id
      join public.tasks task on task.id = submission.task_id
      where review.decision = 'revision_required'
        and task.task_kind = 'hunt'
        and attempt.enrollment_id in (select enrollment_id from anchored)
      group by attempt.enrollment_id, submission.task_id
    ) per_task
    group by per_task.enrollment_id
  ),
  xp_totals as (
    select entry.learner_id, coalesce(sum(entry.points), 0)::integer as total_xp
    from public.xp_ledger entry
    where entry.learner_id in (select learner_id from anchored)
    group by entry.learner_id
  ),
  assembled as (
    select
      anchored.enrollment_id,
      anchored.learner_id,
      anchored.learner_name,
      anchored.course_id,
      anchored.organization_id,
      anchored.enrollment_state,
      anchored.decided_at,
      anchored.day_index,
      coalesce(course_title.title, '') as course_title,
      coalesce(task_totals.tasks_total, 0) as tasks_total,
      coalesce(task_totals.tasks_expected, 0) as tasks_expected,
      coalesce(task_totals.hunts_total, 0) as hunts_total,
      coalesce(attempt_totals.tasks_done, 0) as tasks_done,
      attempt_totals.last_activity_at,
      coalesce(hunt_totals.open_hunts, 0) as open_hunts,
      coalesce(finding_totals.pending_findings, 0) as pending_findings,
      coalesce(rejection_totals.worst_rejections, 0) as worst_rejections,
      coalesce(xp_totals.total_xp, 0) as total_xp,
      app_private.xp_level(coalesce(xp_totals.total_xp, 0)) as level,
      coalesce(streak.current_length, 0) as streak_current,
      coalesce(streak.longest_length, 0) as streak_longest
    from anchored
    left join task_totals   on task_totals.enrollment_id   = anchored.enrollment_id
    left join attempt_totals on attempt_totals.enrollment_id = anchored.enrollment_id
    left join hunt_totals   on hunt_totals.enrollment_id   = anchored.enrollment_id
    left join finding_totals on finding_totals.enrollment_id = anchored.enrollment_id
    left join rejection_totals on rejection_totals.enrollment_id = anchored.enrollment_id
    left join xp_totals     on xp_totals.learner_id        = anchored.learner_id
    left join public.learner_streaks streak
      on streak.learner_id = anchored.learner_id
     and streak.organization_id = anchored.organization_id
    left join lateral (
      -- The requested locale, else German, else whatever exists. Course titles
      -- are catalogue text and DO carry three locales — unlike hunt scenario
      -- titles, which are course material and German-only.
      select localization.title
      from public.course_localizations localization
      where localization.course_id = anchored.course_id
      order by (localization.locale = coalesce(p_locale, 'de')) desc,
               (localization.locale = 'de') desc,
               localization.locale
      limit 1
    ) course_title on true
  ),
  scored as (
    select
      assembled.*,
      (assembled.last_activity_at is null
        or assembled.last_activity_at
             < statement_timestamp() - make_interval(days => stalled_after_days)) as is_stalled,
      (assembled.tasks_expected - assembled.tasks_done >= behind_shortfall) as is_behind,
      (assembled.worst_rejections >= stuck_rejections) as is_stuck
    from assembled
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'enrollment_id', scored.enrollment_id,
        'learner_id', scored.learner_id,
        'learner_name', scored.learner_name,
        'course_id', scored.course_id,
        'course_title', scored.course_title,
        'enrollment_state', scored.enrollment_state,
        'decided_at', scored.decided_at,
        'day_index', scored.day_index,
        'tasks_done', scored.tasks_done,
        'tasks_total', scored.tasks_total,
        'tasks_expected', scored.tasks_expected,
        'hunts_total', scored.hunts_total,
        'open_hunts', scored.open_hunts,
        'pending_findings', scored.pending_findings,
        'total_xp', scored.total_xp,
        'level', scored.level,
        'streak_current', scored.streak_current,
        'streak_longest', scored.streak_longest,
        'last_activity_at', scored.last_activity_at,
        'worst_rejections', scored.worst_rejections,
        'risks', (
          case when scored.is_stalled then jsonb_build_array('stalled') else '[]'::jsonb end
          || case when scored.is_stuck then jsonb_build_array('stuck') else '[]'::jsonb end
          || case when scored.is_behind then jsonb_build_array('behind') else '[]'::jsonb end
        ),
        'risk_score', risk.score
      )
      -- Risk first, then the quietest learner first inside a band. An admin
      -- reads this top-down and should be able to stop reading when the risks
      -- run out.
      order by risk.score desc,
               scored.last_activity_at asc nulls first,
               scored.learner_name asc
    ),
    '[]'::jsonb
  )
  into board
  from scored
  cross join lateral (
    -- Weights, stated once. `stalled` outranks the rest because a learner who
    -- has not appeared in a week is the only one of the three who may already
    -- be gone; `stuck` outranks `behind` because it names a specific scenario
    -- a human can go and fix today.
    select (case when scored.is_stalled then 4 else 0 end)
         + (case when scored.is_stuck   then 3 else 0 end)
         + (case when scored.is_behind  then 1 else 0 end) as score
  ) risk;

  return coalesce(board, '[]'::jsonb);
end
$board$;

comment on function public.list_progress_board(text) is
  'WS-12 oversight board. One row per active enrollment, sorted by risk. '
  'Scoped by the caller''s own role: admin/organization_admin see their '
  'organization, a trainer sees the courses they are assigned in '
  'course_trainers. Every figure is plan-relative. Does NOT refresh streaks -- '
  'that writes XP.';

-- ---------------------------------------------------------------------------
-- 3. Ownership and grants
-- ---------------------------------------------------------------------------
--
-- ⚠️ `alter function … owner to postgres` is load-bearing, not boilerplate.
-- Every reward table has FORCE ROW LEVEL SECURITY, which subjects even the
-- table owner to its policies; only `postgres` holds `rolbypassrls`. A definer
-- function owned by any other role is silently blocked by the very tables it
-- exists to read. (`plan/status/WS-11.md`, learning 2.)

alter function app_private.safe_timezone(text) owner to postgres;
alter function public.list_progress_board(text) owner to postgres;

revoke all on function app_private.safe_timezone(text)
  from public, anon, authenticated, service_role;
revoke all on function public.list_progress_board(text) from public, anon;
grant execute on function public.list_progress_board(text) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Verify by effect
-- ---------------------------------------------------------------------------
--
-- `schema_migrations` on this deployment does not describe reality (I-036), so
-- every Arena migration proves its own work rather than trusting the ledger.

do $verify$
declare
  problems text[] := array[]::text[];
  sample jsonb;
begin
  if not exists (
    select 1 from pg_catalog.pg_proc proc
    join pg_catalog.pg_namespace space on space.oid = proc.pronamespace
    where space.nspname = 'public' and proc.proname = 'list_progress_board'
  ) then
    problems := problems || 'list_progress_board was not created';
  end if;

  if not exists (
    select 1 from pg_catalog.pg_proc proc
    join pg_catalog.pg_namespace space on space.oid = proc.pronamespace
    where space.nspname = 'app_private' and proc.proname = 'safe_timezone'
  ) then
    problems := problems || 'safe_timezone was not created';
  end if;

  -- A definer function that is not owned by postgres reads zero rows from the
  -- FORCE-RLS reward tables and reports it as "no data". Assert the owner.
  if exists (
    select 1 from pg_catalog.pg_proc proc
    join pg_catalog.pg_namespace space on space.oid = proc.pronamespace
    where space.nspname = 'public' and proc.proname = 'list_progress_board'
      and pg_catalog.pg_get_userbyid(proc.proowner) <> 'postgres'
  ) then
    problems := problems || 'list_progress_board is not owned by postgres';
  end if;

  if exists (
    select 1 from pg_catalog.pg_proc proc
    join pg_catalog.pg_namespace space on space.oid = proc.pronamespace
    where space.nspname = 'public' and proc.proname = 'list_progress_board'
      and not proc.prosecdef
  ) then
    problems := problems || 'list_progress_board is not security definer';
  end if;

  -- A bad timezone must fall back, not raise.
  if app_private.safe_timezone('Not/AZone') <> 'UTC' then
    problems := problems || 'safe_timezone does not fall back to UTC';
  end if;
  if app_private.safe_timezone('Europe/Berlin') <> 'Europe/Berlin' then
    problems := problems || 'safe_timezone rejects a valid zone';
  end if;

  -- The function must return an ARRAY even with no visible rows. `postgres`
  -- has no auth.uid(), so this runs the authentication guard, not the query.
  begin
    sample := public.list_progress_board('de');
    problems := problems || 'list_progress_board did not require authentication';
  exception
    when insufficient_privilege then null;   -- 42501, the expected path
  end;

  if array_length(problems, 1) > 0 then
    raise exception 'WS-12 progress board verification failed: %',
      array_to_string(problems, '; ');
  end if;
  raise notice 'WS-12 progress board verified';
end
$verify$;

commit;
