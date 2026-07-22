-- ═══════════════════════════════════════════════════════════════════════════
-- An unanswered question must keep blocking ACROSS Arena tasks.
--
-- The order the product owner described:
--
--     Arena 1 ─→ Q1 ─→ Course 1 ─→ Arena 2 ─→ Q2 ─→ Course 2
--
--     "first student need to attempt question 1 then only he can access
--      question 2 or course task 2. but user can finish all the arena tasks
--      at once, there is no limit or error."
--
-- Two rules. 20260802100000 fixed the first (Arena tasks are never blocked by a
-- question). The second was still wrong: an unanswered Q1 did NOT block Q2 or
-- Course 2.
--
-- Why. The walk remembered the task immediately before the one being judged:
--
--     loop
--       if this is the task we are judging then exit; end if;
--       gate_previous_task := gate_probe;      -- every task, unconditionally
--     end loop;
--
-- so it ended up holding whatever sat one step back. For Course 2 that is
-- **Arena 2**, which carries no question — the rule found nothing to enforce
-- and Course 2 opened while Q1 was still unanswered.
--
-- The bug needs an Arena task BETWEEN two course tasks, which is exactly the
-- interleaving this product is built around. With the two tasks adjacent it
-- behaved correctly, and that is why the earlier verification passed: the
-- seeded course has a single hunt, and both probes placed the question directly
-- behind the task under test. A test built from the real sequence would have
-- caught it; a test built from the convenient fixture did not.
--
-- One condition inside the loop: remember a task only if it actually asks
-- something. `gate_previous_task` then means "the nearest preceding task that
-- asks a question", and intervening Arena tasks are stepped over instead of
-- erasing it — which is precisely "first answer Q1, then you get Q2".
-- ═══════════════════════════════════════════════════════════════════════════

begin;

do $fix$
declare
  function_body text;
  anchor constant text :=
    '    gate_previous_task := gate_probe;' || E'\n' || '  end loop;';
  replacement constant text :=
    '    -- Only a task that ASKS something is remembered. Assigning on every'
    || E'\n'
    || '    -- iteration made this "the task one step back", so an Arena task'
    || E'\n'
    || '    -- between two course tasks erased the question still owed.'
    || E'\n'
    || '    if jsonb_typeof(gate_probe -> ''gate_question'') = ''object'' then'
    || E'\n'
    || '      gate_previous_task := gate_probe;'
    || E'\n'
    || '    end if;'
    || E'\n' || '  end loop;';
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
  if position('Only a task that ASKS something' in function_body) > 0 then
    raise notice 'already narrowed to the nearest asking task — nothing to do';
    return;
  end if;

  occurrences := (length(function_body) - length(replace(function_body, anchor, '')))
                 / length(anchor);
  if occurrences <> 1 then
    raise exception 'expected exactly 1 gate walk assignment, found %', occurrences
      using errcode = '55000';
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

  raise notice 'the question now carries across intervening Arena tasks';
end
$fix$;

commit;

-- ─── Verification: the real seeded tasks, in the shape that exposes the bug ─
--
-- ⚠️ Uses REAL task ids. A first attempt built four synthetic tasks and every
-- call came back `configuration`: the function checks that the task it is
-- judging actually exists under the content version before it evaluates any
-- rule, so invented ids are rejected before the gate logic is reached.
--
-- The seeded stage already has the shape needed, once a question is placed on
-- the first task:
--
--     position 0  course task  ← Q1 lives here
--     position 1  HUNT           ← the task that used to erase Q1
--     position 2  course task    ← must still be blocked by Q1
--
-- Under the old rule the task at position 2 looked one step back, found the
-- hunt, saw no question, and opened. That is the bug.
do $verify$
declare
  learner constant uuid := '01980a00-0000-7000-8000-000000000001';
  live_version constant uuid := '01980a22-0000-7000-8000-000000000001';
  fake_question constant uuid := '019f8990-3722-75f3-ae2f-b1a07c149fd0';
  hunt_task constant uuid := '019f9100-0000-7000-8000-000000000001';
  course_2 constant uuid := '019f9100-0000-7000-8000-000000000002';
  snapshot_payload jsonb;
  enrollment_record record;
  probe jsonb;
  arena_reasons jsonb;
  course_reasons jsonb;
begin
  select version_record.snapshot into snapshot_payload
  from public.content_versions version_record where version_record.id = live_version;
  select enrollment.id, enrollment.organization_id, enrollment.cohort_id,
         cohort_record.progression_mode
  into enrollment_record
  from public.enrollments enrollment
  join public.cohorts cohort_record on cohort_record.id = enrollment.cohort_id
  where enrollment.learner_id = learner and enrollment.state = 'assigned' limit 1;

  if snapshot_payload is null or enrollment_record.id is null then
    raise notice 'seeded fixture absent; behavioural check skipped';
    return;
  end if;

  -- Q1 onto the task at position 0, leaving the hunt at 1 between it and the
  -- course task at 2.
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
  into probe;

  perform set_config('request.jwt.claims',
    json_build_object('sub', learner, 'role', 'authenticated')::text, true);

  arena_reasons := app_private.learner_snapshot_task_lock_reasons(
    enrollment_record.id, enrollment_record.organization_id, enrollment_record.cohort_id,
    enrollment_record.progression_mode, live_version, probe,
    app_private.snapshot_task_payload(probe, hunt_task));
  course_reasons := app_private.learner_snapshot_task_lock_reasons(
    enrollment_record.id, enrollment_record.organization_id, enrollment_record.cohort_id,
    enrollment_record.progression_mode, live_version, probe,
    app_private.snapshot_task_payload(probe, course_2));

  -- "user can finish all the arena tasks at once, there is no limit or error"
  if arena_reasons::text like '%gate_question%' then
    raise exception 'the HUNT is blocked by Q1: %', arena_reasons using errcode = '55000';
  end if;

  -- "first attempt question 1, then only he can access course task 2"
  if course_reasons::text not like '%gate_question%' then
    raise exception
      'the COURSE task after the hunt is NOT blocked by the unanswered Q1: % — '
      'the intervening Arena task still erases the question', course_reasons
      using errcode = '55000';
  end if;

  raise notice 'verified: Q1 blocks the course task across the intervening hunt, '
    'and the hunt itself stays open';
end
$verify$;
