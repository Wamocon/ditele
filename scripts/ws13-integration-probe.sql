-- ============================================================================
-- WS-13 — probes for the three fixes in 20260727100000.
--
-- Everything runs inside ONE transaction that is ROLLED BACK at the end, so it
-- is safe against the live database. Read-only assertions would not need it;
-- §3 writes a verdict, and that must not survive.
--
-- Run:
--   PGPASSWORD=postgres psql "postgresql://postgres@192.168.178.75:56722/postgres?sslmode=disable" \
--     -v ON_ERROR_STOP=1 -f scripts/ws13-integration-probe.sql
--
-- ⚠️ The role-switching idiom matters. `set local role authenticated` alone is
-- not enough — RLS reads `auth.uid()`, which reads the `request.jwt.claims`
-- GUC. Both have to be set, and both have to be `local` so the rollback undoes
-- them. Getting this wrong reads as "the policy is broken" when in fact nobody
-- was logged in.
-- ============================================================================

begin;

\set learner_sub '01980a00-0000-7000-8000-000000000001'

-- ── §1 · I-050 — a learner can now read the hunt scenario ───────────────────
--
-- This is the assertion WS-9 could only fail. Before the fix, every count below
-- was 0 and `getHuntScenarioByCode` returned null, which no caller could tell
-- apart from "no such scenario".

do $probe1$
declare
  scenario_count integer;
  task_count integer;
  reachable boolean;
begin
  perform set_config('role', 'authenticated', true);
  perform set_config(
    'request.jwt.claims',
    json_build_object(
      'sub', '01980a00-0000-7000-8000-000000000001',
      'role', 'authenticated'
    )::text,
    true
  );

  select count(*) into task_count from public.tasks where external_id = 'checkout-v1';
  select count(*) into scenario_count from public.hunt_scenarios;
  select app_private.hunt_scenario_is_reachable('checkout-v1') into reachable;

  perform set_config('role', 'postgres', true);

  raise notice '§1 as learner: tasks(checkout-v1)=%  hunt_scenarios=%  reachable=%',
    task_count, scenario_count, reachable;

  -- The learner STILL reads 0 tasks. That is correct and unchanged — the whole
  -- point is that the definer helper answers the question the policy could not.
  if task_count <> 0 then
    raise exception '§1 FAILED: a learner now reads public.tasks — this fix widened the wrong thing';
  end if;
  if not reachable then
    raise exception '§1 FAILED: hunt_scenario_is_reachable is false for an enrolled learner';
  end if;
  if scenario_count < 1 then
    raise exception '§1 FAILED: a learner still reads 0 hunt_scenarios (I-050 not fixed)';
  end if;

  raise notice '§1 PASS — learner reads % scenario(s) while still reading 0 tasks', scenario_count;
end
$probe1$;

-- ── §2 · I-050 must not leak to a learner with no claim on the scenario ─────
--
-- A fix that makes the policy true for EVERYONE is not a fix. `learner6` holds
-- an account but no approved enrollment on the cohort carrying this content.

do $probe2$
declare
  scenario_count integer;
  reachable boolean;
begin
  perform set_config('role', 'authenticated', true);
  perform set_config(
    'request.jwt.claims',
    json_build_object(
      'sub', 'b087ef52-e17f-48c2-9b56-00eeafa7d576',
      'role', 'authenticated'
    )::text,
    true
  );

  select count(*) into scenario_count from public.hunt_scenarios;
  select app_private.hunt_scenario_is_reachable('checkout-v1') into reachable;

  perform set_config('role', 'postgres', true);

  raise notice '§2 as unenrolled learner6: hunt_scenarios=%  reachable=%',
    scenario_count, reachable;

  if reachable or scenario_count > 0 then
    raise warning '§2 ATTENTION: an unenrolled learner can read % scenario(s). '
      'If learner6 turns out to be enrolled on this cohort, this is expected — '
      'check before treating it as a leak.', scenario_count;
  else
    raise notice '§2 PASS — scoping still refuses a learner with no claim';
  end if;
end
$probe2$;

-- ── §3 · I-051 — a verdict ruled on AFTER acceptance now pays ───────────────

do $probe3$
declare
  target_submission public.submissions;
  target_finding public.hunt_findings;
  review_row public.reviews;
  xp_before integer;
  xp_after integer;
  gained integer;
begin
  select submission_row.* into target_submission
  from public.submissions submission_row
  join public.hunt_findings finding on finding.submission_id = submission_row.id
  where submission_row.state = 'accepted'
  order by submission_row.updated_at desc
  limit 1;

  if target_submission.id is null then
    raise notice '§3 SKIPPED — no accepted submission carries a hunt finding on this database';
    return;
  end if;

  select * into target_finding
  from public.hunt_findings
  where submission_id = target_submission.id
  order by created_at
  limit 1;

  select * into review_row
  from public.reviews
  where submission_id = target_submission.id and decision = 'accepted'
  order by created_at desc
  limit 1;

  if review_row.id is null then
    raise notice '§3 SKIPPED — the accepted submission has no accepted review row';
    return;
  end if;

  -- Reset the finding to pending so the award has something new to pay for,
  -- exactly as a trainer who accepted first and ruled afterwards would leave it.
  update public.hunt_findings
  set verdict = 'pending', planted_code = null, decided_at = null, decided_by = null
  where id = target_finding.id;

  delete from public.xp_ledger
  where learner_id = target_submission.learner_id
    and source_event_id = target_finding.id;

  select coalesce(sum(points), 0) into xp_before
  from public.xp_ledger where learner_id = target_submission.learner_id;

  -- The award path the fix adds, invoked exactly as decide_hunt_finding does.
  update public.hunt_findings
  set verdict = 'confirmed', planted_code = 'QTY_ACCEPTS_NEGATIVE'
  where id = target_finding.id;

  perform app_private.award_for_event(
    target_submission.learner_id,
    target_submission.organization_id,
    'accepted_submission',
    review_row.id,
    target_submission.id
  );

  select coalesce(sum(points), 0) into xp_after
  from public.xp_ledger where learner_id = target_submission.learner_id;

  gained := xp_after - xp_before;
  raise notice '§3 late verdict: xp % → % (gained %)', xp_before, xp_after, gained;

  if gained <= 0 then
    raise exception '§3 FAILED: a verdict confirmed after acceptance still pays nothing (I-051)';
  end if;

  -- ⭐ And the half that matters as much: calling it again must pay ZERO.
  -- Replay-safety is the only reason this fix is safe to add at all.
  perform app_private.award_for_event(
    target_submission.learner_id,
    target_submission.organization_id,
    'accepted_submission',
    review_row.id,
    target_submission.id
  );

  select coalesce(sum(points), 0) into xp_before
  from public.xp_ledger where learner_id = target_submission.learner_id;

  if xp_before <> xp_after then
    raise exception '§3 FAILED: replaying the award paid a second time (% vs %)',
      xp_before, xp_after;
  end if;

  raise notice '§3 PASS — late verdict paid % XP, replay paid 0', gained;
end
$probe3$;

-- ── §4 · I-048 — the hunt task can reach its sandbox ────────────────────────

do $probe4$
declare
  url text;
begin
  select target_url into url
  from public.tasks
  where id = '019f9100-0000-7000-8000-000000000001';

  raise notice '§4 hunt task target_url = %', coalesce(url, '(null)');

  if url is null then
    raise exception '§4 FAILED: target_url is still null (I-048)';
  end if;
  if url !~ '^/[^/]' and url !~ '^https?://' then
    raise exception '§4 FAILED: target_url % does not satisfy the widened constraint', url;
  end if;

  raise notice '§4 PASS';
end
$probe4$;

-- ── §5 · the widened constraint still refuses what it should ───────────────

-- ⚠️ This CANNOT be probed with an UPDATE against the real task. The published
-- content graph is immutable and `tasks_guard_published_graph` fires BEFORE the
-- constraint is ever evaluated, so an attempt raises "published content graph
-- is immutable" and tells you nothing about the CHECK. The first version of
-- this probe did exactly that and read as a failure of the fix.
--
-- So the constraint is applied to a scratch table instead — its definition read
-- out of the catalogue rather than retyped, or this proves a regex that is not
-- the one in force.

do $probe5$
declare
  constraint_body text;
  rejected integer := 0;
  candidate text;
begin
  select pg_get_constraintdef(oid) into constraint_body
  from pg_constraint where conname = 'tasks_target_url_protocol';

  raise notice '§5 constraint in force: %', constraint_body;

  create temporary table ws13_url_probe (target_url text) on commit drop;
  execute 'alter table ws13_url_probe add constraint ws13_url_check '
       || replace(constraint_body, 'target_url', 'target_url');

  foreach candidate in array array[
    '//evil.example/x',      -- protocol-relative: frames a FOREIGN origin
    'javascript:alert(1)',
    'data:text/html,x',
    'ftp://example.com/x'
  ] loop
    begin
      insert into ws13_url_probe values (candidate);
    exception when check_violation then
      rejected := rejected + 1;
    end;
  end loop;

  raise notice '§5 refused %/4 hostile target_url values', rejected;
  if rejected <> 4 then
    raise exception '§5 FAILED: the widened constraint accepts a hostile URL';
  end if;

  -- ...and still accepts both legitimate shapes.
  insert into ws13_url_probe values ('/de/arena/sandbox/checkout-v1?embed=1');
  insert into ws13_url_probe values ('https://example.invalid/testing-target');

  raise notice '§5 PASS — 4 hostile refused, both legitimate shapes accepted';
end
$probe5$;

rollback;
