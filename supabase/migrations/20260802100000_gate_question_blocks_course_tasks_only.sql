-- ═══════════════════════════════════════════════════════════════════════════
-- A skipped gate question must block only the next COURSE task.
--
-- AUTHORING_AND_FLOW §5.6:
--
--     A skipped gate question blocks only the next COURSE task. The Arena chain
--     is unaffected: a learner may keep working through Arena tasks with an
--     unanswered question behind them. What they cannot do is start the next
--     course task.
--
--         Arena 1 ─ approved ─→ Course 1 ─ question SKIPPED
--            │                                  │
--            ↓ still open                       ↓ blocked
--         Arena 2 ─ approved ─→ Course 2   ← locked until Course 1 is answered
--
-- The deployed rule did not implement that. It looked only at the PREVIOUS
-- task — "does the task before me carry an unanswered gate question?" — and
-- never at the kind of task being locked. So an Arena task sitting after a
-- course task whose question had been skipped was locked too, and the learner
-- was told to go and answer a question in order to reach a hunt that has
-- nothing to do with it.
--
-- Worse, it produced exactly the deadlock §5.6 is written to avoid. The two
-- chains are meant to interleave — Arena 1 → Course 1 → Arena 2 → Course 2 —
-- so a learner who skipped Course 1's question lost access to Arena 2, and
-- Arena 2 is what would have unlocked Course 2. Skipping, which the product
-- deliberately offers as a free choice ("SKIP AND DO IT LATER"), quietly
-- stopped all forward progress instead of only the next course task.
--
-- One condition added: the lock now applies only when the task being considered
-- is NOT a hunt. `task_kind` is already in the snapshot — the builder has
-- emitted it since long before this feature — so no snapshot, validator or
-- builder change is needed, and §6.3's "none of these needs a migration" holds
-- for everything except this predicate.
--
-- The required_hunt gate above it is deliberately NOT touched: that one gates a
-- course task on an Arena approval, which is the chain working as intended.
-- ═══════════════════════════════════════════════════════════════════════════

begin;

do $fix$
declare
  function_body text;
  anchor constant text :=
    '  if gate_previous_task is not null' || E'\n'
    || '     and jsonb_typeof(gate_previous_task -> ''gate_question'') = ''object''' || E'\n'
    || '     and jsonb_typeof(gate_previous_task #> ''{gate_question,id}'') = ''string'' then';
  replacement constant text :=
    '  if gate_previous_task is not null' || E'\n'
    -- ⭐ The Arena chain is exempt (AUTHORING_AND_FLOW §5.6). Without this, a
    -- skipped question blocked the next hunt as well, and since hunts are what
    -- unlock later course tasks, skipping stopped progress entirely.
    || '     and (p_task_payload ->> ''task_kind'') is distinct from ''hunt''' || E'\n'
    || '     and jsonb_typeof(gate_previous_task -> ''gate_question'') = ''object''' || E'\n'
    || '     and jsonb_typeof(gate_previous_task #> ''{gate_question,id}'') = ''string'' then';
  occurrences integer;
begin
  select proc_record.prosrc into function_body
  from pg_catalog.pg_proc proc_record
  join pg_catalog.pg_namespace namespace_record
    on namespace_record.oid = proc_record.pronamespace
  where namespace_record.nspname = 'app_private'
    and proc_record.proname = 'learner_snapshot_task_lock_reasons';

  if function_body is null then
    raise exception 'learner_snapshot_task_lock_reasons not found' using errcode = '55000';
  end if;
  if position('is distinct from ''hunt''' in function_body) > 0 then
    raise notice 'the gate lock already spares hunt tasks — nothing to do';
    return;
  end if;

  occurrences := (length(function_body) - length(replace(function_body, anchor, '')))
                 / length(anchor);
  if occurrences <> 1 then
    raise exception
      'expected exactly 1 gate_question guard, found % — the deployed body has '
      'changed and this patch must be re-read', occurrences using errcode = '55000';
  end if;

  function_body := replace(function_body, anchor, replacement);

  execute format(
    'create or replace function app_private.learner_snapshot_task_lock_reasons('
    || 'p_enrollment_id uuid, p_organization_id uuid, p_cohort_id uuid, '
    || 'p_progression_mode text, p_content_version_id uuid, p_snapshot jsonb, '
    || 'p_task_payload jsonb) '
    || 'returns jsonb language plpgsql stable security definer '
    || 'set search_path to '''' as %L',
    function_body
  );
  alter function app_private.learner_snapshot_task_lock_reasons(
    uuid, uuid, uuid, text, uuid, jsonb, jsonb
  ) owner to postgres;

  raise notice 'the gate question now blocks course tasks only';
end
$fix$;

commit;

-- ─── Verification: both sides of §5.6's diagram ───────────────────────────
--
-- Asserting on the body would prove only that a string is present. This runs
-- the rule for real, twice.
--
-- ⚠️ TWO probes, not one, and the first draft of this block got it wrong.
-- Putting the question on position 0 and then checking the task at position 2
-- proves nothing about the fix: that task's PREVIOUS task is the hunt at
-- position 1, which carries no question, so it is unlocked either way. The
-- lock always looks one step back, so each half needs the question placed
-- directly behind the task under test.
--
--   probe A   question on position 0  →  the HUNT at 1 must NOT be locked
--   probe B   question on position 1  →  the COURSE task at 2 MUST be locked
do $verify$
declare
  learner constant uuid := '01980a00-0000-7000-8000-000000000001';
  live_version constant uuid := '01980a22-0000-7000-8000-000000000001';
  hunt_task constant uuid := '019f9100-0000-7000-8000-000000000001';
  course_task constant uuid := '019f9100-0000-7000-8000-000000000002';
  fake_question constant uuid := '019f8990-3722-75f3-ae2f-b1a07c149fd0';
  snapshot_payload jsonb;
  enrollment_record record;
  probe_a jsonb;
  probe_b jsonb;
  hunt_reasons jsonb;
  course_reasons jsonb;
begin
  select version_record.snapshot into snapshot_payload
  from public.content_versions version_record where version_record.id = live_version;

  select enrollment.id, enrollment.organization_id, enrollment.cohort_id,
         cohort_record.progression_mode
  into enrollment_record
  from public.enrollments enrollment
  join public.cohorts cohort_record on cohort_record.id = enrollment.cohort_id
  where enrollment.learner_id = learner and enrollment.state = 'assigned'
  limit 1;

  if snapshot_payload is null or enrollment_record.id is null then
    raise notice 'seeded fixture absent; behavioural check skipped';
    return;
  end if;

  -- Probe A: the question sits on position 0, so the HUNT at position 1 is the
  -- task directly behind it.
  select jsonb_set(snapshot_payload, '{stages}', (
    select jsonb_agg(jsonb_set(stage_element.value, '{tasks}', (
      select jsonb_agg(
        case when task_element.value ->> 'position' = '0'
          then task_element.value || jsonb_build_object('gate_question',
                 jsonb_build_object('id', fake_question,
                   'question_translations', '{"en":"q","de":"f","ru":"v"}'::jsonb))
          else task_element.value end
        order by task_element.ordinality)
      from jsonb_array_elements(stage_element.value -> 'tasks')
        with ordinality task_element(value, ordinality)))
      order by stage_element.ordinality)
    from jsonb_array_elements(snapshot_payload -> 'stages')
      with ordinality stage_element(value, ordinality)))
  into probe_a;

  -- Probe B: the question sits on position 1, so the COURSE task at position 2
  -- is the task directly behind it.
  select jsonb_set(snapshot_payload, '{stages}', (
    select jsonb_agg(jsonb_set(stage_element.value, '{tasks}', (
      select jsonb_agg(
        case when task_element.value ->> 'position' = '1'
          then task_element.value || jsonb_build_object('gate_question',
                 jsonb_build_object('id', fake_question,
                   'question_translations', '{"en":"q","de":"f","ru":"v"}'::jsonb))
          else task_element.value end
        order by task_element.ordinality)
      from jsonb_array_elements(stage_element.value -> 'tasks')
        with ordinality task_element(value, ordinality)))
      order by stage_element.ordinality)
    from jsonb_array_elements(snapshot_payload -> 'stages')
      with ordinality stage_element(value, ordinality)))
  into probe_b;

  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', learner, 'role', 'authenticated')::text, true);

  hunt_reasons := app_private.learner_snapshot_task_lock_reasons(
    enrollment_record.id, enrollment_record.organization_id, enrollment_record.cohort_id,
    enrollment_record.progression_mode, live_version, probe_a,
    app_private.snapshot_task_payload(probe_a, hunt_task));

  course_reasons := app_private.learner_snapshot_task_lock_reasons(
    enrollment_record.id, enrollment_record.organization_id, enrollment_record.cohort_id,
    enrollment_record.progression_mode, live_version, probe_b,
    app_private.snapshot_task_payload(probe_b, course_task));

  if hunt_reasons::text like '%gate_question%' then
    raise exception
      'the ARENA task is still locked by a gate question: % — §5.6 says the '
      'Arena chain must be unaffected', hunt_reasons using errcode = '55000';
  end if;

  -- The other half. Without it this block would pass just as well if the lock
  -- had been deleted outright rather than narrowed.
  if course_reasons::text not like '%gate_question%' then
    raise exception
      'the COURSE task is no longer locked by an unanswered question: % — the '
      'gate has been removed rather than narrowed', course_reasons
      using errcode = '55000';
  end if;

  raise notice 'verified: an unanswered question blocks the next COURSE task '
    'and leaves the next Arena task open';
end
$verify$;
