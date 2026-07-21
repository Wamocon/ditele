-- ═══════════════════════════════════════════════════════════════════════════
-- WS-12 probe — `public.list_progress_board` under real sessions.
--
--   PGPASSWORD=postgres psql "postgresql://postgres@192.168.178.75:56722/postgres?sslmode=disable" \
--     -v ON_ERROR_STOP=1 -f scripts/ws12-board-probe.sql
--
-- Everything runs inside ONE transaction that ROLLS BACK. This probe fabricates
-- an enrollment three weeks old to prove the plan-relative arithmetic, and a
-- live database must not keep it.
--
-- What it asserts:
--   §1  postgres (no auth.uid()) is refused           — the definer guard holds
--   §2  an admin session sees the organization's enrollments
--   §3  a TRAINER session sees rows       ← the whole point of I-018 / item 4
--   §4  a learner session sees NOTHING    ← it is `security definer`; prove it
--   §5  day_index is plan-relative: two learners, same today, different day N
--   §6  the board is sorted by risk, descending
--   §7  the reward figures are non-zero for a learner who has XP
--       (the `[]`-not-an-error trap: a board reading 0 for everyone looks like
--        data, so assert against a learner who demonstrably HAS a ledger row)
-- ═══════════════════════════════════════════════════════════════════════════

begin;

\set ON_ERROR_STOP on

do $probe$
declare
  admin_uid   constant uuid := '01980a00-0000-7000-8000-000000000003';
  trainer_uid constant uuid := '01980a00-0000-7000-8000-000000000002';
  learner_uid constant uuid := '01980a00-0000-7000-8000-000000000001';
  board jsonb;
  row_count integer;
  problems text[] := array[]::text[];
  first_score integer;
  previous_score integer;
  element jsonb;
  learner_row jsonb;
  old_day integer;
  new_day integer;
  xp_learner uuid;
begin
  -- ── §1 no session ────────────────────────────────────────────────────────
  begin
    board := public.list_progress_board('de');
    problems := problems || '§1 postgres was NOT refused';
  exception when insufficient_privilege then
    raise notice '§1 ok — no auth.uid() is refused with 42501';
  end;

  -- ── §2 admin ─────────────────────────────────────────────────────────────
  perform set_config('request.jwt.claims',
                     json_build_object('sub', admin_uid)::text, true);
  board := public.list_progress_board('de');
  row_count := jsonb_array_length(board);
  if row_count = 0 then
    problems := problems || '§2 admin sees ZERO rows';
  else
    raise notice '§2 ok — admin sees % enrollment rows', row_count;
  end if;

  -- Sanity: the shape carries the columns the UI binds to.
  element := board -> 0;
  if element ->> 'learner_name' is null or element ->> 'day_index' is null
     or element ->> 'risks' is null then
    problems := problems || '§2 board row is missing a required field';
  end if;

  -- ── §3 trainer ───────────────────────────────────────────────────────────
  -- I-018: a trainer reads 0 rows from `enrollments` directly. If this comes
  -- back empty, item 4 of the workstream did not land and the trainer view
  -- cannot be unified onto this function.
  perform set_config('request.jwt.claims',
                     json_build_object('sub', trainer_uid)::text, true);
  board := public.list_progress_board('de');
  if jsonb_array_length(board) = 0 then
    problems := problems || '§3 trainer sees ZERO rows — the unification target fails';
  else
    raise notice '§3 ok — trainer sees % rows via course_trainers',
      jsonb_array_length(board);
  end if;

  -- ── §4 learner ───────────────────────────────────────────────────────────
  -- A `security definer` function bypasses RLS by construction, so "a learner
  -- cannot read other learners' progress" is a property of THIS function's
  -- scope clause and nothing else. It has to be asserted, not assumed.
  perform set_config('request.jwt.claims',
                     json_build_object('sub', learner_uid)::text, true);
  board := public.list_progress_board('de');
  if jsonb_array_length(board) <> 0 then
    problems := problems || format(
      '§4 PRIVILEGE LEAK: a learner reads %s progress rows',
      jsonb_array_length(board));
  else
    raise notice '§4 ok — a learner sees nothing';
  end if;

  -- ── §5 plan-relative day index ───────────────────────────────────────────
  -- Move one learner's anchor back three weeks. Same "today" for both, so any
  -- difference in day_index can only come from their own enrollment date —
  -- which is the entire promise of relative scheduling.
  update public.enrollments
  set decided_at = statement_timestamp() - interval '21 days'
  where public.enrollments.learner_id = learner_uid;

  perform set_config('request.jwt.claims',
                     json_build_object('sub', admin_uid)::text, true);
  board := public.list_progress_board('de');

  select value into learner_row
  from jsonb_array_elements(board) value
  where (value ->> 'learner_id')::uuid = learner_uid
  limit 1;

  if learner_row is null then
    problems := problems || '§5 the shifted learner is not on the board';
  else
    new_day := (learner_row ->> 'day_index')::integer;
    if new_day < 22 then
      problems := problems || format(
        '§5 day_index is %s, expected >= 22 after a 21-day shift', new_day);
    else
      raise notice '§5 ok — shifted learner is on day % of their own plan', new_day;
    end if;
  end if;

  -- Everyone else must still be near day 1 — the shift is per learner, not global.
  select min((value ->> 'day_index')::integer) into old_day
  from jsonb_array_elements(board) value
  where (value ->> 'learner_id')::uuid <> learner_uid;
  if old_day is not null and old_day > 7 then
    problems := problems || format(
      '§5 an unshifted learner shows day %s — the anchor is not per learner', old_day);
  else
    raise notice '§5 ok — unshifted learners still show day %', old_day;
  end if;

  -- ── §6 sorted by risk, descending ────────────────────────────────────────
  previous_score := null;
  for element in select value from jsonb_array_elements(board) value loop
    first_score := (element ->> 'risk_score')::integer;
    if previous_score is not null and first_score > previous_score then
      problems := problems || '§6 the board is not sorted by risk descending';
      exit;
    end if;
    previous_score := first_score;
  end loop;
  if not ('§6 the board is not sorted by risk descending' = any (problems)) then
    raise notice '§6 ok — risk descending, top score %',
      (board -> 0 ->> 'risk_score');
  end if;

  -- ── §7 the reward figures actually arrive ────────────────────────────────
  select entry.learner_id into xp_learner
  from public.xp_ledger entry group by entry.learner_id
  order by sum(entry.points) desc limit 1;

  if xp_learner is null then
    raise notice '§7 skipped — xp_ledger is empty on this deployment';
  else
    select value into learner_row
    from jsonb_array_elements(board) value
    where (value ->> 'learner_id')::uuid = xp_learner
    limit 1;

    if learner_row is null then
      raise notice '§7 skipped — the top XP holder has no active enrollment';
    elsif (learner_row ->> 'total_xp')::integer = 0 then
      -- This is the failure WS-11 warned about: self-read RLS silently
      -- returning [] to an admin session, which renders as "Level 1, no XP".
      problems := problems || '§7 total_xp is 0 for a learner who HAS ledger rows';
    else
      raise notice '§7 ok — % XP, level % read under an admin session',
        learner_row ->> 'total_xp', learner_row ->> 'level';
    end if;
  end if;

  -- ── verdict ──────────────────────────────────────────────────────────────
  if array_length(problems, 1) > 0 then
    raise exception E'WS-12 board probe FAILED:\n  %',
      array_to_string(problems, E'\n  ');
  end if;
  raise notice 'WS-12 board probe: all sections passed';
end
$probe$;

rollback;
