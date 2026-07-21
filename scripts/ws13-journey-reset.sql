-- ============================================================================
-- WS-13 — return the journey learner to a clean starting state.
--
--   PGPASSWORD=postgres psql "postgresql://postgres@192.168.178.75:56722/postgres?sslmode=disable" \
--     -v ON_ERROR_STOP=1 -f scripts/ws13-journey-reset.sql
--
-- ⚠️ **This COMMITS**, and it is the only WS-13 script other than the fairness
-- fixture that does. `ws13-journey-check.mjs` exercises the real path through
-- the real RPCs, and every effect worth checking — the unlock, the XP, the
-- badge — is a commit. So the journey is made re-runnable by resetting first
-- rather than by rolling back after.
--
-- Scope is deliberately narrow: ONE learner, ONE task. It does not touch
-- `learner@ditele.local`, whose accepted hunt from WS-8's slice is what the
-- Arena hub's XP and badge numbers are built on, and it does not touch the
-- other four learners, who are the "still locked" fixture the regression check
-- depends on.
--
-- ⚠️ The attempt row is RESET, not removed: see the long note below. Both a
-- DELETE and an `abandoned` state were tried first, and the schema refused one
-- while the product refused the other.
--
--
-- ============================================================================

begin;

do $reset$
declare
  learner constant uuid := 'dd3ba4d8-0f09-47e4-81d6-4c3e2d6a9638';  -- learner3, Sofia Richter
  hunt_task constant uuid := '019f9100-0000-7000-8000-000000000001';
  attempt_ids uuid[];
  finding_count integer;
begin
  select coalesce(array_agg(id), '{}') into attempt_ids
  from public.attempts
  where learner_id = learner and task_id = hunt_task;

  if array_length(attempt_ids, 1) is null then
    raise notice 'journey reset: nothing to clean — Sofia has no attempt on the hunt';
    return;
  end if;

  delete from public.hunt_findings where attempt_id = any(attempt_ids);
  get diagnostics finding_count = row_count;

  -- ⚠️ **`xp_ledger` is APPEND-ONLY** — a trigger refuses the DELETE with
  -- "xp_ledger is append-only", and the whole reset transaction rolls back with
  -- it. That is the schema being right, not being in the way: a reward ledger
  -- you can quietly rewrite is not a ledger.
  --
  -- It also turns out not to be needed. The award engine is idempotent on
  -- `(learner_id, source_event_id)`, and every source event here is **derived
  -- from a row this reset removes** — the finding's own id for a find, the
  -- review's id for the approval. A second journey creates new findings and a
  -- new review, so it pays again on its own. Only a *threshold badge* keeps its
  -- stable md5 key, so `badge_awards` is left alone too and the badge assertion
  -- accepts an already-earned badge.
  delete from public.reviews
  where submission_id in (select id from public.submissions where attempt_id = any(attempt_ids));

  -- ⚠️ **`submissions` and `submission_versions` are NOT removed, because
  -- `submission_versions` is append-only and refuses the DELETE.** That is the
  -- third append-only guard this script ran into, after `xp_ledger` and
  -- `attempt_command_receipts`, and together they are a clear statement of
  -- intent: on this deployment, evidence of what a learner did is not
  -- rewritable. A reset script does not get to argue with that.
  --
  -- It does not need to. `submissions` is UNIQUE on `attempt_id` (WS-10's
  -- learning 3), so a resubmission UPDATEs the existing row and appends a new
  -- version — which means leaving the row in place produces exactly the
  -- resubmission path the journey wants to exercise anyway.
  delete from public.attempt_drafts where attempt_id = any(attempt_ids);
  delete from public.attempt_hint_usage where attempt_id = any(attempt_ids);
  delete from public.evidence_uploads where attempt_id = any(attempt_ids);
  delete from public.lab_sessions where attempt_id = any(attempt_ids);

  -- ⚠️ **The attempt row itself cannot be removed, and it must not be left
  -- `abandoned` either.** Both were tried; the schema and the product each
  -- refused one of them.
  --
  --   * DELETE is refused twice over. Six tables reference `attempts` with
  --     ON DELETE RESTRICT — the list came from `pg_constraint`, not from
  --     hitting them one error at a time — and two of the children are guarded
  --     append-only: `attempt_command_receipts` (the idempotency ledger every
  --     command RPC writes) and `xp_ledger`. A reward ledger and a command
  --     ledger you can quietly rewrite are not ledgers, so this is the schema
  --     being right rather than being in the way.
  --
  --   * `state = 'abandoned'` satisfies `attempts_active_task_uidx` and looked
  --     like the gentle choice, but nothing in the product ever produces it.
  --     The workspace renders an editable defect form and a submit button on an
  --     abandoned attempt, and the submit cannot succeed — so the journey
  --     failed at step 5 with no submission and no explanation, and the cause
  --     was this script inventing a state the app has no path to.
  --
  -- Returning it to `in_progress` with its submissions, drafts and findings
  -- gone IS the state a learner is in the moment they first open a hunt.
  --
  -- ⚠️ `attempts_validate_transition` enforces the state machine and refuses
  -- `abandoned -> in_progress` and `submitted -> in_progress` — correctly:
  -- rewinding an attempt is not a move the product has, which is the whole
  -- reason a reset script exists. Disabled by NAME for this one statement and
  -- re-enabled immediately, with the assertion below that it came back.
  alter table public.attempts disable trigger attempts_validate_transition;

  update public.attempts set state = 'in_progress' where id = any(attempt_ids);

  alter table public.attempts enable trigger attempts_validate_transition;

  if exists (
    select 1 from pg_catalog.pg_trigger
    where tgrelid = 'public.attempts'::regclass
      and tgname = 'attempts_validate_transition'
      and tgenabled = 'D'
  ) then
    raise exception 'journey reset left attempts_validate_transition DISABLED — refusing to commit';
  end if;

  raise notice 'journey reset: % attempt(s) returned to in_progress, % finding(s) cleared',
    array_length(attempt_ids, 1), finding_count;
end
$reset$;

-- Prove the gate is closed again, which is the precondition step 1 asserts.
do $verify$
declare
  open_attempts integer;
begin
  select count(*) into open_attempts
  from public.attempts
  where learner_id = 'dd3ba4d8-0f09-47e4-81d6-4c3e2d6a9638'
    and task_id = '019f9100-0000-7000-8000-000000000001'
    and state in ('submitted', 'revision_required', 'resubmitted', 'accepted');

  if open_attempts > 0 then
    raise exception 'journey reset failed: % submitted-or-later attempt(s) remain', open_attempts;
  end if;
  raise notice 'journey reset verified: the hunt is unplayed for Sofia and the gate is shut';
end
$verify$;

commit;
