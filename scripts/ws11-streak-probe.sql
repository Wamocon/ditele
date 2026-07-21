-- ---------------------------------------------------------------------------
-- WS-11 — streak probe. §8.4, including the freeze allowance.
--
--   PGPASSWORD=postgres psql "postgresql://postgres@192.168.178.75:56722/postgres?sslmode=disable" \
--     -f scripts/ws11-streak-probe.sql
--
-- Runs inside a transaction that is ROLLED BACK. It fabricates activity by
-- cloning a real `attempts` row with different `started_at` values, because the
-- streak is derived from those dates and there is no other honest way to make a
-- learner look like they studied on eleven specific days.
--
-- The freeze rule is the part of §8.4 most likely to be quietly wrong: "1
-- verpasster Tag → Streak Freeze (max. 2 pro Monat)". Off by one in either
-- direction and a learner either loses a streak they should have kept or keeps
-- one they should have lost. Both are worse than not having the feature.
-- ---------------------------------------------------------------------------

\pset pager off
\set ON_ERROR_STOP on

begin;

do $probe$
declare
  -- A seeded learner with an enrollment and NO submissions, so the probe can
  -- rewrite their attempt history freely. Deleting attempts for a learner who
  -- has submitted fails on the submissions FK.
  learner uuid := 'c47227c6-7e76-427d-99e0-39d13df3815d';
  org uuid := '01980a10-0000-7000-8000-000000000001';
  template public.attempts;
  today date;
  streak_row public.learner_streaks;
  second_pass public.learner_streaks;
  xp_after integer;
  next_sequence integer;
  offset_days integer;
begin
  select a.* into template from public.attempts a where a.learner_id = learner limit 1;
  if template.id is null then
    raise exception 'no attempt to clone for learner % — probe cannot fabricate activity', learner;
  end if;

  today := (timezone('UTC', statement_timestamp()))::date;
  select coalesce(max(sequence_number), 0) into next_sequence
  from public.attempts where enrollment_id = template.enrollment_id;

  -- The learner already has one real attempt and it cannot be deleted without
  -- disturbing rows this probe does not own. Push it a year into the past
  -- instead: the streak walk only looks back from today, so an attempt in 2025
  -- is invisible to it and the row is restored by the rollback either way.
  update public.attempts
  set started_at = started_at - interval '400 days',
      last_activity_at = last_activity_at - interval '400 days',
      submitted_at = submitted_at - interval '400 days'
  where learner_id = learner;

  raise notice '';
  raise notice '=== 1. No activity at all ===';
  streak_row := app_private.refresh_learner_streak(learner, org);
  raise notice '      -> current=% longest=% last=%',
    streak_row.current_length, streak_row.longest_length, streak_row.last_activity_date;
  if streak_row.current_length <> 0 then
    raise exception 'FAIL  expected 0, got %', streak_row.current_length;
  end if;
  raise notice 'PASS  a learner who has done nothing has no streak';

  raise notice '';
  raise notice '=== 2. Five consecutive days ending today ===';
  foreach offset_days in array array[0, 1, 2, 3, 4] loop
    next_sequence := next_sequence + 1;
    insert into public.attempts (
      organization_id, enrollment_id, learner_id, cohort_id, task_id,
      sequence_number, state, started_at, last_activity_at,
      start_idempotency_key, course_id, content_version_id
    ) values (
      template.organization_id, template.enrollment_id, learner, template.cohort_id,
      -- 'abandoned', not a live state: `attempts_active_task_uidx` is unique on
      -- (enrollment_id, task_id) WHERE state is in_progress/submitted/
      -- revision_required/resubmitted, so five rows on one task collide. An
      -- abandoned attempt is still real activity -- the learner opened the unit
      -- -- and the streak reads the timestamps, not the state, which is the
      -- correct reading of 8.4's "1 Unit starten".
      template.task_id, next_sequence, 'abandoned',
      (today - offset_days)::timestamptz + interval '10 hours',
      (today - offset_days)::timestamptz + interval '10 hours',
      'ws11-probe-' || next_sequence::text || '-' || offset_days::text,
      template.course_id, template.content_version_id
    );
  end loop;
  streak_row := app_private.refresh_learner_streak(learner, org);
  raise notice '      -> current=% freezes_used=%', streak_row.current_length, streak_row.freezes_used;
  if streak_row.current_length <> 5 then
    raise exception 'FAIL  expected 5, got %', streak_row.current_length;
  end if;
  raise notice 'PASS  five days counts five, no freeze spent';

  raise notice '';
  raise notice '=== 3. Refreshing twice does not change the answer ===';
  second_pass := app_private.refresh_learner_streak(learner, org);
  if second_pass.current_length <> streak_row.current_length
     or second_pass.freezes_used <> streak_row.freezes_used then
    raise exception 'FAIL  refresh is not stable: % / % then % / %',
      streak_row.current_length, streak_row.freezes_used,
      second_pass.current_length, second_pass.freezes_used;
  end if;
  raise notice 'PASS  derived, not accumulated — the second refresh agrees';

  raise notice '';
  raise notice '=== 4. ONE missed day is bridged by a freeze (§8.4 grace period) ===';
  -- days 0,1,2 present · day 3 MISSING · days 4,5 present
  -- -> streak 5, one freeze spent. FIVE, not six: §8.4 counts days WITH
  -- activity, and a freeze keeps the chain alive without crediting a day the
  -- learner did not study. Getting this backwards inflates every streak in the
  -- product by one per missed day.
  delete from public.attempts where learner_id = learner and start_idempotency_key like 'ws11-probe%';
  foreach offset_days in array array[0, 1, 2, 4, 5] loop
    next_sequence := next_sequence + 1;
    insert into public.attempts (
      organization_id, enrollment_id, learner_id, cohort_id, task_id,
      sequence_number, state, started_at, last_activity_at,
      start_idempotency_key, course_id, content_version_id
    ) values (
      template.organization_id, template.enrollment_id, learner, template.cohort_id,
      -- 'abandoned', not a live state: `attempts_active_task_uidx` is unique on
      -- (enrollment_id, task_id) WHERE state is in_progress/submitted/
      -- revision_required/resubmitted, so five rows on one task collide. An
      -- abandoned attempt is still real activity -- the learner opened the unit
      -- -- and the streak reads the timestamps, not the state, which is the
      -- correct reading of 8.4's "1 Unit starten".
      template.task_id, next_sequence, 'abandoned',
      (today - offset_days)::timestamptz + interval '10 hours',
      (today - offset_days)::timestamptz + interval '10 hours',
      'ws11-probe-gap-' || next_sequence::text, template.course_id, template.content_version_id
    );
  end loop;
  streak_row := app_private.refresh_learner_streak(learner, org);
  raise notice '      -> current=% freezes_used=%  [expect 5, 1]',
    streak_row.current_length, streak_row.freezes_used;
  if streak_row.current_length <> 5 or streak_row.freezes_used <> 1 then
    raise exception 'FAIL  expected a 5-day streak with 1 freeze spent; got % / %',
      streak_row.current_length, streak_row.freezes_used;
  end if;
  raise notice 'PASS  the hospital day does not end the streak, and does not pad it either';

  raise notice '';
  raise notice '=== 5. TWO missed days in a row ends it ===';
  -- days 0,1 present · days 2,3 MISSING · days 4,5 present -> 2
  delete from public.attempts where learner_id = learner and start_idempotency_key like 'ws11-probe%';
  foreach offset_days in array array[0, 1, 4, 5] loop
    next_sequence := next_sequence + 1;
    insert into public.attempts (
      organization_id, enrollment_id, learner_id, cohort_id, task_id,
      sequence_number, state, started_at, last_activity_at,
      start_idempotency_key, course_id, content_version_id
    ) values (
      template.organization_id, template.enrollment_id, learner, template.cohort_id,
      -- 'abandoned', not a live state: `attempts_active_task_uidx` is unique on
      -- (enrollment_id, task_id) WHERE state is in_progress/submitted/
      -- revision_required/resubmitted, so five rows on one task collide. An
      -- abandoned attempt is still real activity -- the learner opened the unit
      -- -- and the streak reads the timestamps, not the state, which is the
      -- correct reading of 8.4's "1 Unit starten".
      template.task_id, next_sequence, 'abandoned',
      (today - offset_days)::timestamptz + interval '10 hours',
      (today - offset_days)::timestamptz + interval '10 hours',
      'ws11-probe-break-' || next_sequence::text, template.course_id, template.content_version_id
    );
  end loop;
  streak_row := app_private.refresh_learner_streak(learner, org);
  raise notice '      -> current=%  [expect 2]', streak_row.current_length;
  if streak_row.current_length <> 2 then
    raise exception 'FAIL  two missed days must end the streak; got %', streak_row.current_length;
  end if;
  raise notice 'PASS  the grace period is one day, not two';

  raise notice '';
  raise notice '=== 6. Only TWO freezes per month (§8.4 max. 2) ===';
  -- present 0,1 · gap 2 · present 3,4 · gap 5 · present 6,7 · gap 8 · present 9
  -- The first two gaps are bridged and the third is not, so the walk stops at
  -- day 7: six studied days (0,1,3,4,6,7) and two freezes spent.
  delete from public.attempts where learner_id = learner and start_idempotency_key like 'ws11-probe%';
  foreach offset_days in array array[0, 1, 3, 4, 6, 7, 9] loop
    next_sequence := next_sequence + 1;
    insert into public.attempts (
      organization_id, enrollment_id, learner_id, cohort_id, task_id,
      sequence_number, state, started_at, last_activity_at,
      start_idempotency_key, course_id, content_version_id
    ) values (
      template.organization_id, template.enrollment_id, learner, template.cohort_id,
      -- 'abandoned', not a live state: `attempts_active_task_uidx` is unique on
      -- (enrollment_id, task_id) WHERE state is in_progress/submitted/
      -- revision_required/resubmitted, so five rows on one task collide. An
      -- abandoned attempt is still real activity -- the learner opened the unit
      -- -- and the streak reads the timestamps, not the state, which is the
      -- correct reading of 8.4's "1 Unit starten".
      template.task_id, next_sequence, 'abandoned',
      (today - offset_days)::timestamptz + interval '10 hours',
      (today - offset_days)::timestamptz + interval '10 hours',
      'ws11-probe-freeze-' || next_sequence::text, template.course_id, template.content_version_id
    );
  end loop;
  streak_row := app_private.refresh_learner_streak(learner, org);
  raise notice '      -> current=% freezes_used=%', streak_row.current_length, streak_row.freezes_used;
  if to_char(today - 9, 'YYYY-MM') = to_char(today, 'YYYY-MM') then
    if streak_row.current_length <> 6 or streak_row.freezes_used <> 2 then
      raise exception 'FAIL  expected 6 days and exactly 2 freezes; got % / %',
        streak_row.current_length, streak_row.freezes_used;
    end if;
    raise notice 'PASS  the third gap was not bridged — the month allowance is 2';
  else
    -- Honest rather than green: run near a month boundary the ten days span two
    -- months, each with its own allowance, so all three gaps are legitimately
    -- bridged. Asserting 6 here would fail for the right reason on the wrong day.
    raise notice 'SKIP  today is within 9 days of a month start, so the allowance resets mid-window';
  end if;

  raise notice '';
  raise notice '=== 7. `longest_length` is a record and never goes down ===';
  delete from public.attempts where learner_id = learner and start_idempotency_key like 'ws11-probe%';
  streak_row := app_private.refresh_learner_streak(learner, org);
  raise notice '      -> current=% longest=%', streak_row.current_length, streak_row.longest_length;
  if streak_row.current_length <> 0 then
    raise exception 'FAIL  current should be 0';
  end if;
  if streak_row.longest_length < 5 then
    raise exception 'FAIL  longest was erased by a recompute; got %', streak_row.longest_length;
  end if;
  raise notice 'PASS  losing a streak does not erase the record';

  raise notice '';
  raise notice '=== 8. Streak XP is paid once, not once per refresh ===';
  select coalesce(sum(points), 0) into xp_after
  from public.xp_ledger where learner_id = learner and source_kind in ('daily_activity', 'streak_milestone');
  perform app_private.refresh_learner_streak(learner, org);
  perform app_private.refresh_learner_streak(learner, org);
  if (select coalesce(sum(points), 0) from public.xp_ledger
      where learner_id = learner and source_kind in ('daily_activity', 'streak_milestone')) <> xp_after then
    raise exception 'FAIL  a repeated refresh paid again';
  end if;
  raise notice 'PASS  % XP from streak sources, unchanged across three refreshes', xp_after;

  raise notice '';
  raise notice 'ALL STREAK PROBES PASSED — rolling back';
end
$probe$;

rollback;

select
  (select count(*) from public.learner_streaks) as streak_rows,
  (select count(*) from public.xp_ledger) as xp_rows,
  (select count(*) from public.attempts) as attempts;
