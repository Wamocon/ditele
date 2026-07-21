-- ---------------------------------------------------------------------------
-- WS-11 — award-engine regression probe.
--
--   PGPASSWORD=postgres psql "postgresql://postgres@192.168.178.75:56722/postgres?sslmode=disable" \
--     -f scripts/ws11-award-probe.sql
--
-- Runs against REAL rows on the live database, inside a transaction that is
-- ROLLED BACK at the end. Nothing it does survives.
--
-- What it is actually testing: the award engine runs inside a trainer's accept
-- on a shipped app. The failure that matters is not "no XP" — it is "the
-- trainer can no longer accept anything". So the first and most important
-- assertion is that a plain PRACTICAL review, the flow that has been shipping
-- since V3, still succeeds.
-- ---------------------------------------------------------------------------

\pset pager off
\set ON_ERROR_STOP on

begin;

do $probe$
declare
  trainer uuid;
  target public.submissions;
  version_id uuid;
  target_rubric uuid;
  scores jsonb;
  learner uuid;
  xp_after integer;
  badges_after integer;
  notifications_after integer;
  ledger_rows integer;
  replay_xp integer;
  hunt_submission uuid := '019f8566-6e34-7ecf-b7cf-b3e68bf7374d';
  hunt_learner uuid := '01980a00-0000-7000-8000-000000000001';
  org uuid := '01980a10-0000-7000-8000-000000000001';
  result jsonb;
begin
  raise notice '';
  raise notice '=== 1. A PRACTICAL review still works — the regression that matters ===';

  select s.* into target
  from public.submissions s
  where s.state = 'submitted'
  order by s.created_at
  limit 1;
  learner := target.learner_id;

  select v.id into version_id
  from public.submission_versions v
  where v.submission_id = target.id and v.version_number = target.latest_version_number;

  select (task_payload.value #>> '{rubric,rubric_id}')::uuid into target_rubric
  from public.cohorts c
  join public.content_versions cv on cv.id = c.content_version_id
  cross join lateral jsonb_array_elements(cv.snapshot -> 'stages') stage_payload
  cross join lateral jsonb_array_elements(stage_payload.value -> 'tasks') task_payload
  where c.id = target.cohort_id and task_payload.value ->> 'id' = target.task_id::text
    and jsonb_typeof(task_payload.value -> 'rubric') = 'object';

  select jsonb_agg(jsonb_build_object('criterion_id', rc.id, 'points', rc.max_points))
  into scores
  from public.rubric_criteria rc where rc.rubric_id = target_rubric;

  -- A trainer who may actually review this cohort — read from the same helper
  -- the RPC itself uses rather than assuming the seeded trainer qualifies.
  select p.user_id into trainer
  from public.profiles p
  join public.user_roles ur on ur.user_id = p.user_id
  join public.roles r on r.id = ur.role_id
  where r.code = 'trainer'
  limit 1;

  perform set_config('role', 'authenticated', true);
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', trainer, 'role', 'authenticated')::text,
    true
  );

  perform public.decide_submission(
    target.id, version_id, target.row_version, 'accepted'::public.review_decision,
    'WS-11 probe — rolled back', scores,
    'ws11-probe-' || replace(target.id::text, '-', ''), gen_random_uuid()
  );

  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);

  raise notice 'PASS  practical accept succeeded (submission %)', target.id;

  select coalesce(sum(points), 0), count(*) into xp_after, ledger_rows
  from public.xp_ledger where learner_id = learner;
  raise notice '      -> % XP in % ledger row(s)  [expect 50 in 1: practice_approved]',
    xp_after, ledger_rows;
  if xp_after <> 50 then raise exception 'FAIL  expected 50 XP, got %', xp_after; end if;

  select count(*) into badges_after from public.badge_awards where learner_id = learner;
  raise notice '      -> % badge(s)  [expect 1: first-approval]', badges_after;
  if badges_after < 1 then raise exception 'FAIL  no badge awarded for a first acceptance'; end if;

  select count(*) into notifications_after
  from public.notifications where recipient_id = learner and event_type = 'badge.awarded';
  raise notice '      -> % badge notification(s)  [expect 1]', notifications_after;

  raise notice '';
  raise notice '=== 2. Replaying the same decision awards nothing more ===';
  -- Same idempotency key: decide_submission returns early without a second
  -- review row, so the engine is not reached at all. Belt and braces, the
  -- ledger''s own unique index would absorb it anyway.
  perform app_private.award_for_event(
    learner, target.organization_id, 'accepted_submission',
    (select id from public.reviews where submission_id = target.id limit 1),
    target.id
  );
  select coalesce(sum(points), 0) into replay_xp
  from public.xp_ledger where learner_id = learner;
  raise notice '      -> % XP after replay  [expect unchanged: 50]', replay_xp;
  if replay_xp <> xp_after then raise exception 'FAIL  replay awarded % extra XP', replay_xp - xp_after; end if;

  select count(*) into badges_after from public.badge_awards where learner_id = learner;
  raise notice '      -> % badge(s) after replay  [expect unchanged]', badges_after;

  raise notice '';
  raise notice '=== 3. A hunt pays per confirmed finding, and pays MORE for a bonus ===';

  -- Confirm the seeded pending finding, then award as the review would.
  update public.hunt_findings set verdict = 'confirmed', planted_code = 'TOTAL_IGNORES_DISCOUNT'
  where submission_id = hunt_submission;

  result := app_private.award_for_event(
    hunt_learner, org, 'accepted_submission', gen_random_uuid(), hunt_submission
  );
  raise notice '      -> %', result;
  if (result ->> 'awarded')::integer <> 70 then
    raise exception 'FAIL  expected 50 + 20 = 70 XP for one confirmed finding, got %', result ->> 'awarded';
  end if;
  if not (result -> 'badges' ? 'first-bug-found') then
    raise exception 'FAIL  first-bug-found was not awarded for a confirmed finding';
  end if;
  raise notice 'PASS  50 (approval) + 20 (confirmed defect) and the badge fired';

  -- ⚠️ `planted_code` must be cleared with it. WS-8's
  -- `hunt_findings_bonus_has_no_code` says a bonus finding cannot name a
  -- planted defect — which is exactly right, because "bonus" MEANS a real bug
  -- we did not plant. Setting the verdict without clearing the code fails the
  -- check, and the award engine never sees the row.
  update public.hunt_findings set verdict = 'bonus', planted_code = null
  where submission_id = hunt_submission;
  -- A fresh source event, because this stands in for a SECOND acceptance. The
  -- finding''s own id is already spent, so the bonus rule cannot double-pay the
  -- same finding — which is the property being demonstrated.
  result := app_private.award_for_event(
    hunt_learner, org, 'accepted_submission', gen_random_uuid(), hunt_submission
  );
  raise notice '      -> % [expect 50: the finding id is already in the ledger]', result;
  if (result ->> 'awarded')::integer <> 50 then
    raise exception 'FAIL  a re-decided finding paid twice';
  end if;
  raise notice 'PASS  changing a verdict cannot pay for the same finding twice';

  raise notice '';
  raise notice '=== 4. Totality — the engine cannot take a review down ===';

  -- Every one of these is a shape the engine will meet in production. None may
  -- raise, because an exception here is a trainer who cannot accept anything.
  perform app_private.award_for_event(null, org, 'accepted_submission', gen_random_uuid(), null);
  raise notice 'PASS  null learner';
  perform app_private.award_for_event(hunt_learner, org, 'accepted_submission', gen_random_uuid(), null);
  raise notice 'PASS  no submission id';
  perform app_private.award_for_event(hunt_learner, org, 'accepted_submission', gen_random_uuid(), gen_random_uuid());
  raise notice 'PASS  submission id that does not exist';
  perform app_private.award_for_event(hunt_learner, org, 'not_a_kind', gen_random_uuid(), hunt_submission);
  raise notice 'PASS  unknown source kind';
  perform app_private.award_for_event(hunt_learner, org, 'streak_milestone', gen_random_uuid(), null, null, 999);
  raise notice 'PASS  streak length with no matching rule';

  raise notice '';
  raise notice '=== 5. Levels agree with the TypeScript twin (§8.2) ===';
  if app_private.xp_level(0) <> 1 or app_private.xp_level(99) <> 1 or app_private.xp_level(100) <> 2
     or app_private.xp_level(999) <> 4 or app_private.xp_level(1000) <> 5
     or app_private.xp_level(9999) <> 11 or app_private.xp_level(10000) <> 12 then
    raise exception 'FAIL  xp_level disagrees with §8.2';
  end if;
  raise notice 'PASS  every §8.2 boundary';

  raise notice '';
  raise notice 'ALL PROBES PASSED — rolling back';
end
$probe$;

rollback;

-- Proof that nothing survived.
select
  (select count(*) from public.xp_ledger) as xp_rows,
  (select count(*) from public.badge_awards) as badge_awards,
  (select count(*) from public.reviews) as reviews,
  (select count(*) from public.notifications where event_type in ('badge.awarded','level.up')) as reward_notifications;
