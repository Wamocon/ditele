-- ═══════════════════════════════════════════════════════════════════════════
-- Bug Arena ticket — the hunt_findings write path.
-- 06_ARENA_WORKSTREAMS.md §8, WS-10 item 5.
--
-- WS-8 created hunt_findings with a scoped SELECT policy and deliberately no
-- INSERT/UPDATE policy, because every domain write in this codebase goes
-- through a SECURITY DEFINER path (ISSUES.md I-003). This migration supplies
-- the two halves of that path:
--
--   1. ON SUBMIT   -- one finding per hunt submission, verdict 'pending'.
--   2. ON REVIEW   -- public.decide_hunt_finding(...), the trainer's verdict.
--
-- ─── Why the submit half is a trigger, when 05_… §G5 says "not a trigger" ───
--
-- That instruction is about the AWARD engine (WS-11), and its reason is stated:
-- XP must land in the same transaction as the review decision so a student can
-- never see "accepted" without it. The constraint is same-transaction, not
-- no-trigger -- and a trigger on submission_versions IS in the submit
-- transaction, by definition.
--
-- The alternative was to splice a block into public.submit_attempt, the way
-- WS-8's 20260722100000 spliced one token into it. That function is ~16.8k
-- characters of validated command logic on the critical path of EVERY task
-- submission in the product. Editing its text to serve one task kind risks
-- practical, knowledge and placement submissions -- features that shipped in V3
-- -- to add a row that nothing else depends on. This phase's stated main risk
-- is "a feature that used to work and now silently does not". A trigger that
-- returns immediately for every non-hunt task cannot produce that outcome.
--
-- ─── Why submission_versions and not submissions ────────────────────────────
--
-- public.submissions carries a UNIQUE constraint on attempt_id
-- (submissions_attempt_id_key), so there is exactly ONE submission row per
-- attempt and a resubmission UPDATEs it rather than inserting. A trigger on
-- INSERT would therefore fire on the first submit and never again, and a
-- learner who corrected their report after a revision request would have the
-- trainer reading their FIRST wording forever. submission_versions gets one row
-- per actual submit event, which is precisely the event being recorded.
--
-- ─── Totality ───────────────────────────────────────────────────────────────
--
-- This trigger sits on the submission path, so if it can raise, it can stop a
-- learner submitting work. It is therefore total by construction rather than by
-- an exception handler -- swallowing errors here would hide a real defect and
-- still leave the data wrong. Every hunt_findings constraint is satisfied
-- unconditionally: verdict is the literal 'pending' (so the confirmed- and
-- bonus-code constraints are vacuous), decided_by/decided_at are both null (so
-- the pair constraint holds), severity is coerced to a member of the allowed
-- set or null, row_version defaults to 1, and attempt_id is copied from a row
-- that provably exists. No lookup is required to succeed: a missing scenario,
-- a missing draft or an unparseable evidence_draft each degrade to a null or an
-- empty string, never to an exception.
--
-- Idempotent: create-or-replace throughout, drop trigger if exists before
-- create, and the trigger body itself upserts rather than accumulating.
-- Forward-only. Non-destructive: it adds rows to a table that WS-10 is the
-- first to write, and alters nothing that exists.
-- ═══════════════════════════════════════════════════════════════════════════

begin;

-- ─── 1. The defect a learner reported, pulled out of the draft ──────────────
-- attempt_drafts.evidence_draft is jsonb holding the DefectReport the form
-- round-trips (src/features/learning/model.ts). The data layer writes it as a
-- one-element ARRAY -- `p_evidence_draft: [defect]` -- but has stored a bare
-- object in the past, so both shapes are accepted here rather than trusting one.
create or replace function app_private.hunt_defect_from_draft(p_attempt_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case
           when jsonb_typeof(draft_record.evidence_draft) = 'array'
             then draft_record.evidence_draft -> 0
           when jsonb_typeof(draft_record.evidence_draft) = 'object'
             then draft_record.evidence_draft
           else null
         end
  from public.attempt_drafts draft_record
  where draft_record.attempt_id = p_attempt_id;
$$;

comment on function app_private.hunt_defect_from_draft(uuid) is
  'The structured defect report from an attempt draft, or null. Accepts both '
  'the array and bare-object shapes evidence_draft has held.';

-- ─── 2. The submit-time trigger ─────────────────────────────────────────────
create or replace function app_private.record_hunt_finding_on_submit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  submission_record public.submissions;
  task_kind_value text;
  scenario_code text;
  scenario_id_value uuid;
  defect_json jsonb;
  summary_value text;
  severity_value text;
  existing_id uuid;
begin
  select * into submission_record
  from public.submissions
  where id = new.submission_id;

  -- No submission means nothing to attach a finding to. Not an error: this
  -- trigger never decides whether a submit is valid, only whether it is a hunt.
  if submission_record.id is null then
    return new;
  end if;

  select task_record.task_kind,
         case when task_record.source_system = 'arena'
              then task_record.external_id end
    into task_kind_value, scenario_code
  from public.tasks task_record
  where task_record.id = submission_record.task_id;

  -- The guard that keeps every V3 submission path bit-for-bit unchanged.
  if task_kind_value is distinct from 'hunt' then
    return new;
  end if;

  -- Ground truth, if any exists yet. hunt_scenarios was empty when WS-10 was
  -- written -- WS-9 seeds it -- so a null scenario is the expected state for
  -- now and must not stop a finding being recorded.
  if scenario_code is not null then
    select scenario_record.id into scenario_id_value
    from public.hunt_scenarios scenario_record
    where scenario_record.code = scenario_code
      and scenario_record.state = 'active'
    order by scenario_record.scenario_version desc
    limit 1;
  end if;

  defect_json := app_private.hunt_defect_from_draft(submission_record.attempt_id);

  -- The summary, with two fallbacks. A finding row whose summary is blank is
  -- useless to the trainer panel, and the answer text always exists because
  -- submit_attempt requires it for a hunt (WS-8's 20260722100000).
  summary_value := coalesce(
    nullif(btrim(defect_json ->> 'summary'), ''),
    nullif(btrim(left(new.answer_text, 200)), ''),
    ''
  );

  -- Coerced, not trusted: hunt_findings_severity_check would reject anything
  -- else, and rejecting it here would mean rejecting the submission.
  severity_value := nullif(btrim(lower(coalesce(defect_json ->> 'severity', ''))), '');
  if severity_value is not null
     and severity_value not in ('low', 'medium', 'high', 'critical') then
    severity_value := null;
  end if;

  -- Upsert on the attempt, not the submission. A resubmission is the same
  -- claimed defect said better, not a second defect -- so it refreshes the
  -- learner's wording and re-points the row at the current submission.
  --
  -- ⚠️ Only while the finding is still 'pending'. Once a trainer has ruled on
  -- it, that verdict is theirs; a learner editing their draft must never be
  -- able to quietly reset it.
  select finding_record.id into existing_id
  from public.hunt_findings finding_record
  where finding_record.attempt_id = submission_record.attempt_id
    and finding_record.verdict = 'pending'
  order by finding_record.created_at asc
  limit 1;

  if existing_id is not null then
    update public.hunt_findings
    set reported_summary = summary_value,
        severity = severity_value,
        submission_id = submission_record.id,
        scenario_id = coalesce(scenario_id_value, scenario_id),
        row_version = row_version + 1,
        updated_at = statement_timestamp()
    where id = existing_id;
  else
    insert into public.hunt_findings (
      organization_id, attempt_id, submission_id, scenario_id,
      reported_summary, planted_code, verdict, severity
    )
    values (
      submission_record.organization_id,
      submission_record.attempt_id,
      submission_record.id,
      scenario_id_value,
      summary_value,
      -- Never guessed here. The system RANKS a report against the planted list
      -- for the trainer (decision D2) and the trainer confirms; writing a match
      -- at submit time would be the auto-accept 06_… §8 forbids.
      null,
      'pending',
      severity_value
    );
  end if;

  return new;
end;
$$;

comment on function app_private.record_hunt_finding_on_submit() is
  'Records one pending hunt_findings row per hunt submission. Returns '
  'immediately for every other task kind. Total by construction -- it sits on '
  'the submission path and must never be able to stop a learner submitting.';

drop trigger if exists submission_versions_record_hunt_finding
  on public.submission_versions;
create trigger submission_versions_record_hunt_finding
  after insert on public.submission_versions
  for each row
  execute function app_private.record_hunt_finding_on_submit();

-- ─── 3. The trainer's verdict ───────────────────────────────────────────────
-- The other half of decision D2. The matching engine ranks and annotates; this
-- is where a human's judgement is recorded, including a human overruling the
-- match.
create or replace function public.decide_hunt_finding(
  p_finding_id uuid,
  p_verdict text,
  p_planted_code text,
  p_expected_version bigint,
  p_correlation_id uuid,
  p_idempotency_key text
)
returns public.hunt_findings
language plpgsql
security definer
set search_path = ''
as $$
declare
  finding_record public.hunt_findings;
  submission_record public.submissions;
  actor_id uuid := (select auth.uid());
  actor_is_trainer boolean;
  actor_can_manage boolean;
  clean_code text;
  updated_record public.hunt_findings;
begin
  if actor_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  if p_correlation_id is null then
    raise exception 'p_correlation_id is required' using errcode = '22023';
  end if;

  if length(coalesce(p_idempotency_key, '')) < 8 then
    raise exception 'p_idempotency_key is required' using errcode = '22023';
  end if;

  if p_verdict not in ('pending', 'confirmed', 'duplicate', 'invalid', 'bonus') then
    raise exception 'unknown verdict: %', p_verdict using errcode = '22023';
  end if;

  select * into finding_record
  from public.hunt_findings
  where id = p_finding_id;

  if finding_record.id is null then
    raise exception 'hunt finding not found' using errcode = 'P0002';
  end if;

  -- ⚠️ Authorization is the SAME PAIR OF CHECKS public.decide_submission makes,
  -- so "may I rule on this finding" and "may I decide this submission" cannot
  -- drift into two different answers.
  --
  -- This was originally written against app_private.can_access_submission, and
  -- probing it as each role caught the mistake before it landed: that helper
  -- governs READ access on the review screen, and a learner may of course read
  -- their own submission — so a student could mark their own bug report
  -- 'confirmed', which WS-11's award engine then pays XP for. Grading is not a
  -- read. The correct gate is "is a review trainer on this cohort, or holds
  -- cohort.manage", and nothing weaker.
  if finding_record.submission_id is null then
    raise exception 'review scope denied' using errcode = '42501';
  end if;

  select * into submission_record
  from public.submissions
  where id = finding_record.submission_id;

  if submission_record.id is null then
    raise exception 'review scope denied' using errcode = '42501';
  end if;

  actor_is_trainer := app_private.is_active_cohort_review_trainer(
    actor_id,
    submission_record.cohort_id,
    submission_record.organization_id
  );
  actor_can_manage := app_private.has_permission(
    'cohort.manage',
    submission_record.organization_id,
    submission_record.cohort_id
  );
  if not actor_is_trainer and not actor_can_manage then
    raise exception 'review scope denied' using errcode = '42501';
  end if;

  -- 'confirmed' names a planted defect; 'bonus' is by definition unplanted, and
  -- 'duplicate'/'invalid'/'pending' carry no code. Normalising here keeps the
  -- table's CHECK constraints from surfacing as raw Postgres errors in the UI.
  clean_code := nullif(btrim(coalesce(p_planted_code, '')), '');
  if p_verdict = 'confirmed' and clean_code is null then
    raise exception 'a confirmed finding must name the planted defect it matches'
      using errcode = '22023';
  end if;
  if p_verdict <> 'confirmed' then
    clean_code := null;
  end if;

  -- Replay. Same verdict, same code -> return what is already there rather than
  -- bumping row_version, so a double-click or a retried request is free.
  if finding_record.verdict = p_verdict
     and finding_record.planted_code is not distinct from clean_code then
    return finding_record;
  end if;

  -- Optimistic concurrency, deliberately written as a plain guarded UPDATE with
  -- no lock and no retry loop. ISSUES.md I-007/I-009: on this deployment a
  -- stale expected-version HANGS rather than erroring, Kong 504s and the
  -- PostgREST pool is unusable for ~30s afterwards. Whatever produces that, it
  -- is not reproduced here -- this either matches one row or matches none.
  update public.hunt_findings
  set verdict = p_verdict,
      planted_code = clean_code,
      decided_by = case when p_verdict = 'pending' then null else actor_id end,
      decided_at = case when p_verdict = 'pending' then null
                        else statement_timestamp() end,
      row_version = row_version + 1,
      updated_at = statement_timestamp()
  where id = p_finding_id
    and row_version = p_expected_version
  returning * into updated_record;

  if updated_record.id is null then
    raise exception
      'hunt finding % changed since it was read (expected version %)',
      p_finding_id, p_expected_version
      using errcode = '40001';
  end if;

  return updated_record;
end;
$$;

comment on function public.decide_hunt_finding(uuid, text, text, bigint, uuid, text) is
  'The trainer''s verdict on one reported defect. Authorized by the same pair '
  'of checks as decide_submission -- is_active_cohort_review_trainer or '
  'cohort.manage -- NOT by can_access_submission, which a learner passes on '
  'their own row. Ranking never writes here: a match is only ever a human''s.';

alter function public.decide_hunt_finding(uuid, text, text, bigint, uuid, text)
  owner to postgres;
revoke all on function public.decide_hunt_finding(uuid, text, text, bigint, uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function public.decide_hunt_finding(uuid, text, text, bigint, uuid, text)
  to authenticated;

commit;

-- ─── Verify ─────────────────────────────────────────────────────────────────
-- Assert the trigger is attached and the RPC is callable by the role that needs
-- it. A trigger that silently failed to attach looks exactly like "hunts do not
-- record findings", which is invisible until a trainer opens a review.
do $verify$
declare
  trigger_count integer;
  can_execute boolean;
begin
  select count(*) into trigger_count
  from pg_catalog.pg_trigger
  where tgrelid = 'public.submission_versions'::regclass
    and tgname = 'submission_versions_record_hunt_finding'
    and not tgisinternal;

  if trigger_count <> 1 then
    raise exception 'submission_versions_record_hunt_finding is not attached'
      using errcode = '55000';
  end if;

  select has_function_privilege(
    'authenticated',
    'public.decide_hunt_finding(uuid,text,text,bigint,uuid,text)',
    'execute'
  ) into can_execute;

  if not can_execute then
    raise exception 'authenticated cannot execute decide_hunt_finding'
      using errcode = '55000';
  end if;

  raise notice 'hunt finding write path: trigger attached, RPC granted';
end
$verify$;
