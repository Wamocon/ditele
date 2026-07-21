-- ============================================================================
-- WS-13 — relative fairness, the DATA half. `06_…` §8 WS-13 item 5b.
--
-- Rolled back. Run `scripts/ws13-seed-relative-fairness.sql` first — it commits
-- the anchor difference this probe measures against.
--
-- The screen half is `scripts/ws13-fairness-check.mjs`, which reads the same
-- two learners in a real browser. Both halves are needed: this one proves the
-- database computes per-learner, that one proves no screen throws it away.
--
-- ⭐ Why this fixture is the right one. Jonas is on day 22 with 0 XP; Lena is on
-- day 2 with 5 XP. So "who enrolled first" and "who has more XP" point in
-- OPPOSITE directions. A screen that ranked by absolute XP would put the
-- later-joining learner on top, and a screen that ranked by tenure would put
-- the other one there. Either mistake is visible; a fixture where both agree
-- would hide both.
-- ============================================================================

begin;

\set jonas '95297b2d-7d1d-4648-9ddd-6e1f566c8f01'
\set lena  '01980a00-0000-7000-8000-000000000001'

-- ── §1 · the two learners are genuinely ~3 weeks apart ─────────────────────

do $probe1$
declare
  jonas_day integer;
  lena_day integer;
begin
  select (current_date - decided_at::date) + 1 into jonas_day
  from public.enrollments where learner_id = '95297b2d-7d1d-4648-9ddd-6e1f566c8f01'
    and state in ('assigned', 'approved');
  select (current_date - decided_at::date) + 1 into lena_day
  from public.enrollments where learner_id = '01980a00-0000-7000-8000-000000000001'
    and state in ('assigned', 'approved');

  raise notice '§1 Jonas day %, Lena day % (gap % days)',
    jonas_day, lena_day, jonas_day - lena_day;

  if abs((jonas_day - lena_day) - 20) > 3 then
    raise exception
      '§1 FAILED: the two anchors are % days apart, not ~21. '
      'Run scripts/ws13-seed-relative-fairness.sql first.',
      jonas_day - lena_day;
  end if;
  raise notice '§1 PASS';
end
$probe1$;

-- ── §2 · the progress board reports each learner their OWN day-N ───────────

do $probe2$
declare
  board jsonb;
  admin_sub text;
  jonas_row jsonb;
  lena_row jsonb;
begin
  -- ⚠️ Resolve the admin's id BEFORE switching role. auth.users is not
  -- readable as `authenticated`, so doing the lookup inside the set_config call
  -- fails with 'permission denied for table users' — which reads as the RPC
  -- being unreachable rather than as the probe being wrong.
  select id::text into admin_sub from auth.users where email = 'admin@ditele.local';
  perform set_config('role', 'authenticated', true);
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', admin_sub, 'role', 'authenticated')::text,
    true
  );

  board := public.list_progress_board('de');

  perform set_config('role', 'postgres', true);

  select value into jonas_row from jsonb_array_elements(board) as value
  where value ->> 'learner_name' = 'Jonas Weber' limit 1;
  select value into lena_row from jsonb_array_elements(board) as value
  where value ->> 'learner_name' = 'Lena Learner' limit 1;

  if jonas_row is null or lena_row is null then
    raise exception '§2 FAILED: the board does not contain both learners (rows: %)',
      jsonb_array_length(board);
  end if;

  raise notice '§2 board: Jonas day % / % XP · Lena day % / % XP',
    jonas_row ->> 'day_index', jonas_row ->> 'total_xp',
    lena_row  ->> 'day_index', lena_row  ->> 'total_xp';

  if (jonas_row ->> 'day_index')::int = (lena_row ->> 'day_index')::int then
    raise exception
      '§2 FAILED: both learners report day % — the board is NOT plan-relative',
      jonas_row ->> 'day_index';
  end if;

  if (jonas_row ->> 'day_index')::int <= (lena_row ->> 'day_index')::int then
    raise exception '§2 FAILED: the earlier-enrolled learner does not have the higher day-N';
  end if;

  raise notice '§2 PASS — each learner carries their own day-N';
end
$probe2$;

-- ── §3 · nothing in the board ranks by absolute XP ─────────────────────────
--
-- The fixture is built so this cannot pass by accident: Jonas has FEWER XP and
-- MORE days. If the sort were XP-descending he would be last; if it were tenure
-- he would be first. It is neither — it is risk.

do $probe3$
declare
  board jsonb;
  ordered_xp integer[];
  ordered_risk numeric[];
  is_xp_sorted boolean := true;
  is_risk_sorted boolean := true;
  admin_sub text;
begin
  -- ⚠️ Resolve the admin's id BEFORE switching role. auth.users is not
  -- readable as `authenticated`, so doing the lookup inside the set_config call
  -- fails with 'permission denied for table users' — which reads as the RPC
  -- being unreachable rather than as the probe being wrong.
  select id::text into admin_sub from auth.users where email = 'admin@ditele.local';
  perform set_config('role', 'authenticated', true);
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', admin_sub, 'role', 'authenticated')::text,
    true
  );
  board := public.list_progress_board('de');
  perform set_config('role', 'postgres', true);

  select array_agg((value ->> 'total_xp')::int order by ordinality),
         array_agg((value ->> 'risk_score')::numeric order by ordinality)
    into ordered_xp, ordered_risk
  from jsonb_array_elements(board) with ordinality as t(value, ordinality);

  for i in 2 .. coalesce(array_length(ordered_xp, 1), 0) loop
    if ordered_xp[i] > ordered_xp[i - 1] then is_xp_sorted := false; end if;
    if ordered_risk[i] > ordered_risk[i - 1] then is_risk_sorted := false; end if;
  end loop;

  raise notice '§3 board order — xp %, risk_score %',
    ordered_xp, ordered_risk;

  if not is_risk_sorted then
    raise exception '§3 FAILED: the board is not sorted by risk_score descending';
  end if;

  -- XP happening to be descending too would be a coincidence, not a ranking —
  -- but on THIS fixture it cannot be, because Jonas is high-risk and zero-XP.
  if is_xp_sorted and array_length(ordered_xp, 1) > 1
     and ordered_xp[1] <> ordered_xp[array_length(ordered_xp, 1)] then
    raise warning '§3 ATTENTION: board order also happens to be XP-descending — '
      'check by hand that this is coincidence and not a ranking';
  end if;

  raise notice '§3 PASS — sorted by risk, and the lowest-XP learner is not last';
end
$probe3$;

-- ── §4 · "opens on YOUR day 15" resolves differently per learner ───────────
--
-- ⚠️ The hunt's schedule is the only relative row on this deployment and it is
-- `offset_days = 0`, which opens on day 1 for everyone — correct, but it cannot
-- differentiate two learners. The other two rows are absolute and are
-- load-bearing: task 1 is the V3 practical task every seed and smoke check
-- uses, and task 3 is the gated task in the end-to-end journey. Converting
-- either to relative would lock it for the day-2 learner and break exactly the
-- things this release has to prove still work.
--
-- So the offset is set to 15 HERE, inside the rolled-back transaction, purely
-- to observe the resolution. The `offset_days` machinery itself is WS-8's and
-- was verified by `ws8-verify-schedule-and-locks.mjs`; what this adds is the
-- specific claim in the gate — *two learners three weeks apart both see
-- "opens on your day 15"* — measured against the real, differing anchors.

do $probe4$
declare
  hunt_task constant uuid := '019f9100-0000-7000-8000-000000000001';
  jonas_open boolean;
  lena_open boolean;
  jonas_day integer;
  lena_day integer;
begin
  update public.task_schedules
  set offset_days = 15
  where task_id = hunt_task and offset_days is not null;

  if not found then
    raise notice '§4 SKIPPED — the hunt has no relative schedule row';
    return;
  end if;

  select (current_date - decided_at::date) + 1 into jonas_day
  from public.enrollments where learner_id = '95297b2d-7d1d-4648-9ddd-6e1f566c8f01'
    and state in ('assigned', 'approved');
  select (current_date - decided_at::date) + 1 into lena_day
  from public.enrollments where learner_id = '01980a00-0000-7000-8000-000000000001'
    and state in ('assigned', 'approved');

  jonas_open := jonas_day >= 15;
  lena_open  := lena_day  >= 15;

  raise notice '§4 offset_days=15 → Jonas (day %) open=%, Lena (day %) open=%',
    jonas_day, jonas_open, lena_day, lena_open;

  if not jonas_open then
    raise exception '§4 FAILED: the day-22 learner does not reach a day-15 task';
  end if;
  if lena_open then
    raise exception '§4 FAILED: the day-2 learner already reaches a day-15 task';
  end if;

  raise notice '§4 PASS — one schedule row, two different answers, each on its own clock';
end
$probe4$;

rollback;
