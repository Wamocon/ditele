-- ═══════════════════════════════════════════════════════════════════════════
-- Bug Arena foundation — make 'hunt' a real task kind.
--
-- The design's central decision (05_BUG_ARENA_AND_GAMIFICATION.md §0) is that
-- a bug hunt is NOT a parallel subsystem: it is an ordinary task with a
-- different task_kind, so it inherits the attempt state machine, the review
-- loop, the prerequisite gate and one authorization model instead of a second.
--
-- Widening the CHECK constraint is the obvious half. The half that is not
-- obvious, and that would have broken the whole feature four workstreams
-- later, is in public.submit_attempt:
--
--     if nullif(btrim(p_answer_text), '') is null
--        or context_record.task_payload ->> 'task_kind'
--          not in ('practical', 'knowledge') then
--       raise exception 'a written answer is required for this task';
--
-- That is an OR, not an AND. Any task whose kind is outside those two values
-- raises unconditionally — regardless of what the learner wrote. So widening
-- only the constraint would produce a hunt task a student can start, draft and
-- autosave, but can NEVER submit, failing with a message about a written
-- answer they had in fact supplied. ('placement' has the same latent defect
-- today; no placement task has ever been authored, so nobody has hit it.)
--
-- The fix keeps the clause's intent — these kinds require prose — and adds
-- 'hunt' to it, because a defect report is prose too.
--
-- Patching rather than re-declaring: submit_attempt is ~16.8k characters of
-- validated command logic. Re-typing it to change one list is how a subtle
-- corruption gets introduced. This migration therefore reads the deployed
-- body, asserts the exact text it expects, replaces it and re-creates the
-- function — the same idiom migration 20260717100050 uses on
-- decide_submission_effects_unowned.
--
-- Idempotent: re-running is a no-op (the post-patch text is detected and the
-- block returns early). Forward-only. Non-destructive: widening a CHECK can
-- never invalidate an existing row, and the data is verified first anyway.
--
-- Verified against the live database before writing:
--   * tasks_task_kind_check = ('practical','knowledge','placement')
--   * the submit_attempt anchor below occurs EXACTLY ONCE in prosrc
--   * 2 task rows exist, both with kinds inside the new set
-- ═══════════════════════════════════════════════════════════════════════════

begin;

-- ─── 1. Widen tasks.task_kind ───────────────────────────────────────────────
-- Prove the existing data fits the new constraint before swapping it. On a
-- live database a rogue value would otherwise fail the ADD half after the DROP
-- half had already succeeded, leaving the table with no constraint at all.
do $migration$
declare
  unexpected_kind text;
  unexpected_count integer;
begin
  select task_record.task_kind, count(*) over ()
  into unexpected_kind, unexpected_count
  from public.tasks task_record
  where task_record.task_kind not in
    ('practical', 'knowledge', 'placement', 'hunt')
  limit 1;

  if unexpected_kind is not null then
    raise exception
      'tasks.task_kind holds % row(s) outside the new constraint, first = %',
      unexpected_count, unexpected_kind
      using errcode = '55000';
  end if;
end
$migration$;

alter table public.tasks
  drop constraint if exists tasks_task_kind_check;

alter table public.tasks
  add constraint tasks_task_kind_check
  check (task_kind in ('practical', 'knowledge', 'placement', 'hunt'));

comment on constraint tasks_task_kind_check on public.tasks is
  'Task kinds. ''hunt'' is a Bug Arena defect hunt: an ordinary task that '
  'renders a sandbox and is reviewed like any other submission.';

-- ─── 2. Let a hunt attempt actually be submitted ────────────────────────────
do $migration$
declare
  function_body text;
  old_gate constant text :=
    $old$not in ('practical', 'knowledge') then$old$;
  new_gate constant text :=
    $new$not in ('practical', 'knowledge', 'hunt') then$new$;
  occurrences integer;
begin
  select procedure_record.prosrc into function_body
  from pg_catalog.pg_proc procedure_record
  where procedure_record.oid = (
    'public.submit_attempt(uuid,bigint,text,text,uuid[],uuid[],uuid)'
  )::regprocedure;

  if function_body is null then
    raise exception 'public.submit_attempt is missing'
      using errcode = '55000';
  end if;

  -- Already patched: nothing to do. This is what makes the migration re-runnable.
  if position(new_gate in function_body) > 0 then
    return;
  end if;

  occurrences := (length(function_body) - length(
    replace(function_body, old_gate, '')
  )) / length(old_gate);

  if occurrences <> 1 then
    raise exception
      'submit_attempt does not match the frozen contract: expected exactly 1 '
      'written-answer gate, found %', occurrences
      using errcode = '55000';
  end if;

  function_body := replace(function_body, old_gate, new_gate);

  -- create or replace preserves the existing owner and grants, so the
  -- authorization surface of this SECURITY DEFINER function is untouched.
  execute format($function$
    create or replace function public.submit_attempt(
      p_attempt_id uuid,
      p_expected_version bigint,
      p_idempotency_key text,
      p_answer_text text,
      p_selected_option_ids uuid[],
      p_evidence_refs uuid[],
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

commit;
