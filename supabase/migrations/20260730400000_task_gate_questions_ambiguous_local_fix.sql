-- ═══════════════════════════════════════════════════════════════════════════
-- Phase 1c, part 3, correction — the gate-question lock never ran.
--
-- 20260730300000 declared a local called `gate_question_id` and then wrote
--
--     where response_record.enrollment_id = p_enrollment_id
--       and response_record.gate_question_id = gate_question_id
--
-- against public.task_gate_responses, which has a COLUMN of that name. plpgsql
-- raises 42702, "column reference is ambiguous".
--
--
-- WHY THIS ONE WAS WORSE THAN THE TWO BEFORE IT
--
-- This is the third local-shadows-a-column bug in this build (20260729110000
-- fixed `organization_id`, 20260729120000 fixed `cohort_id`). Those two raised
-- to the caller and were obvious the first time the command ran.
--
-- learner_snapshot_task_lock_reasons ends with
--
--     exception when others then
--       return reasons || jsonb_build_array(jsonb_build_object('code','configuration'));
--
-- so the 42702 was caught and returned as a generic 'configuration' lock. The
-- effect on a learner: the next task is locked, permanently, with a reason that
-- says only "this task is misconfigured" — no error in any log, and the gate
-- rule never evaluated once. A skipped question and an answered question
-- produced byte-identical output, which is precisely the distinction the whole
-- feature exists to make.
--
-- It was found only because the verification ran the rule in all four states
-- (unanswered / skipped / answered / the question's own task) and compared the
-- results. A single-state test would have shown a lock, which is what a lock
-- test expects to see, and passed.
--
-- Renamed to `gate_response_question_id`, which is not a column of any table
-- this function touches. The other locals were re-checked against every table
-- in the function — enrollments, content_versions, courses, tasks,
-- task_schedules, prerequisites, skills, attempts, submissions,
-- submission_versions, mastery_snapshots, task_gate_responses — and
-- `gate_question_id` was the only collision.
-- ═══════════════════════════════════════════════════════════════════════════

begin;

do $fix$
declare
  function_body text;
  declaration_before constant text := '  gate_question_id uuid;';
  declaration_after  constant text := '  gate_response_question_id uuid;';
  assignment_before constant text :=
    '    gate_question_id := (gate_previous_task #>> ''{gate_question,id}'')::uuid;';
  assignment_after constant text :=
    '    gate_response_question_id := (gate_previous_task #>> ''{gate_question,id}'')::uuid;';
  predicate_before constant text :=
    '        and response_record.gate_question_id = gate_question_id';
  predicate_after constant text :=
    '        and response_record.gate_question_id = gate_response_question_id';
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
  if position('gate_response_question_id' in function_body) > 0 then
    raise notice 'already corrected — nothing to do';
    return;
  end if;

  -- Each of the three sites is asserted separately. A replace() that matched
  -- two of three would leave a function that still fails at run time, and the
  -- exception handler would hide that too.
  occurrences := (length(function_body)
                  - length(replace(function_body, declaration_before, '')))
                 / length(declaration_before);
  if occurrences <> 1 then
    raise exception 'expected 1 gate_question_id declaration, found %', occurrences
      using errcode = '55000';
  end if;
  occurrences := (length(function_body)
                  - length(replace(function_body, assignment_before, '')))
                 / length(assignment_before);
  if occurrences <> 1 then
    raise exception 'expected 1 gate_question_id assignment, found %', occurrences
      using errcode = '55000';
  end if;
  occurrences := (length(function_body)
                  - length(replace(function_body, predicate_before, '')))
                 / length(predicate_before);
  if occurrences <> 1 then
    raise exception 'expected 1 ambiguous predicate, found %', occurrences
      using errcode = '55000';
  end if;

  function_body := replace(function_body, declaration_before, declaration_after);
  function_body := replace(function_body, assignment_before, assignment_after);
  function_body := replace(function_body, predicate_before, predicate_after);

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

  raise notice 'gate-question lock local renamed; the rule can now actually run';
end
$fix$;

commit;

-- ─── Verification, by running the rule rather than by reading it ───────────
--
-- The bug this file fixes was invisible to every check that asked "does the
-- function exist" or "does its body mention gate_question" — both were true the
-- whole time. So this asserts the ambiguity is gone the only way that proves it:
-- by executing the exact predicate shape in a block that reports 42702 instead
-- of swallowing it.
do $verify$
declare
  function_body text;
  probe_result boolean;
begin
  select proc_record.prosrc into function_body
  from pg_catalog.pg_proc proc_record
  join pg_catalog.pg_namespace namespace_record
    on namespace_record.oid = proc_record.pronamespace
  where namespace_record.nspname = 'app_private'
    and proc_record.proname = 'learner_snapshot_task_lock_reasons';

  if function_body ~ '^\s*gate_question_id uuid;' then
    raise exception 'the shadowing local survived' using errcode = '55000';
  end if;
  if position('gate_response_question_id' in function_body) = 0 then
    raise exception 'the rename did not take' using errcode = '55000';
  end if;

  -- The predicate itself, run for real against the same table.
  declare
    gate_response_question_id uuid := '00000000-0000-7000-8000-000000000000';
  begin
    select exists (
      select 1 from public.task_gate_responses response_record
      where response_record.gate_question_id = gate_response_question_id
    ) into probe_result;
  exception when others then
    raise exception
      'the renamed predicate STILL raises %: %', sqlstate, sqlerrm
      using errcode = '55000';
  end;

  raise notice 'Phase 1c part 3 correction verified';
end
$verify$;
