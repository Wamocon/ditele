-- ═══════════════════════════════════════════════════════════════════════════
-- Bug Arena ticket — carry the structured report ON the finding.
--
-- ⭐ THE PROBLEM THIS SOLVES, WHICH IS NOT OBVIOUS FROM THE DESIGN
--
-- `06_…` §8 asks WS-10 for a ticket view "as the student and trainer both see
-- it" and for a trainer panel showing "whether all required fields are
-- present". Both need the STRUCTURED defect report -- summary, steps, expected,
-- actual, labels, environment -- not the rendered prose blob in
-- submissions.answer_text.
--
-- The structured report lives in `attempt_drafts.evidence_draft`. Reading the
-- deployed policy shows that is unreachable for both readers:
--
--   attempt_drafts_owner_read  FOR SELECT USING (
--     attempt.learner_id = auth.uid()
--     AND attempt.state IN ('in_progress', 'revision_required') )
--
-- There is exactly ONE policy on the table, and it is the owner's.
-- Consequences, both measured rather than assumed:
--
--   * A TRAINER can never read it. Not once, in any attempt state. So the
--     ground-truth panel has nothing structured to match or to check fields on.
--   * THE STUDENT LOSES IT TOO, the moment they submit. The state predicate
--     excludes 'submitted', 'resubmitted' and 'accepted' -- so a learner cannot
--     re-read their own filed ticket. Their work is not gone, but it is no
--     longer theirs to see, and a ticket view built on that table would show an
--     empty page precisely when the report matters most.
--
-- The alternative was to parse the report back out of `answer_text`. That blob
-- is assembled by `formatDefectReport` from TRANSLATED field labels, so a
-- parser would key on German strings and silently return nothing the day the
-- en/ru translation pass lands (RELEASE.md §8 item 1 — it is the next session's
-- first task). Parsing localized prose to recover data we already had is how a
-- feature breaks six weeks later for a reason nobody connects to the change.
--
-- So the finding row carries a faithful copy, written by the same trigger that
-- already reads the draft inside the submit transaction. `hunt_findings` is
-- readable by the learner who owns the attempt AND by anyone who may access the
-- submission (WS-8's hunt_findings_scoped_read), which is exactly the two
-- audiences the ticket view has.
--
-- Idempotent: add column if not exists, create or replace. Forward-only.
-- Non-destructive: one new nullable-by-default column and a function body swap.
-- ═══════════════════════════════════════════════════════════════════════════

begin;

-- ─── 1. The column ──────────────────────────────────────────────────────────
alter table public.hunt_findings
  add column if not exists reported_details jsonb not null default '{}'::jsonb;

do $migration$
begin
  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conrelid = 'public.hunt_findings'::regclass
      and conname = 'hunt_findings_reported_details_is_object'
  ) then
    alter table public.hunt_findings
      add constraint hunt_findings_reported_details_is_object
      check (jsonb_typeof(reported_details) = 'object');
  end if;
end
$migration$;

comment on column public.hunt_findings.reported_details is
  'A faithful copy of the structured DefectReport as filed, taken inside the '
  'submit transaction. attempt_drafts is readable only by the owning learner '
  'and only before submit, so this is the only place the ticket view and the '
  'trainer panel can read the report from.';

-- ─── 2. Populate it from the same trigger ───────────────────────────────────
-- Identical to 20260724200000's function except that it also carries the whole
-- defect object across. Replaced wholesale rather than patched: this body is
-- forty lines that WS-10 wrote this week, not a 16.8k-character shared command
-- like submit_attempt, so re-declaring it is safe and far clearer to read.
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

  if scenario_code is not null then
    select scenario_record.id into scenario_id_value
    from public.hunt_scenarios scenario_record
    where scenario_record.code = scenario_code
      and scenario_record.state = 'active'
    order by scenario_record.scenario_version desc
    limit 1;
  end if;

  defect_json := app_private.hunt_defect_from_draft(submission_record.attempt_id);

  -- Coerced to an object so the CHECK above can never be the reason a learner
  -- cannot submit. A missing or malformed draft becomes {}, and the ticket view
  -- falls back to answer_text.
  if defect_json is null or jsonb_typeof(defect_json) <> 'object' then
    defect_json := '{}'::jsonb;
  end if;

  summary_value := coalesce(
    nullif(btrim(defect_json ->> 'summary'), ''),
    nullif(btrim(left(new.answer_text, 200)), ''),
    ''
  );

  severity_value := nullif(btrim(lower(coalesce(defect_json ->> 'severity', ''))), '');
  if severity_value is not null
     and severity_value not in ('low', 'medium', 'high', 'critical') then
    severity_value := null;
  end if;

  -- ⚠️ Only refreshes a finding that is still 'pending'. Once a trainer has
  -- ruled on it, both the verdict AND the wording it was ruled on stay put --
  -- otherwise a learner editing their draft could change the text under a
  -- decision that has already been made against it.
  select finding_record.id into existing_id
  from public.hunt_findings finding_record
  where finding_record.attempt_id = submission_record.attempt_id
    and finding_record.verdict = 'pending'
  order by finding_record.created_at asc
  limit 1;

  if existing_id is not null then
    update public.hunt_findings
    set reported_summary = summary_value,
        reported_details = defect_json,
        severity = severity_value,
        submission_id = submission_record.id,
        scenario_id = coalesce(scenario_id_value, scenario_id),
        row_version = row_version + 1,
        updated_at = statement_timestamp()
    where id = existing_id;
  else
    insert into public.hunt_findings (
      organization_id, attempt_id, submission_id, scenario_id,
      reported_summary, reported_details, planted_code, verdict, severity
    )
    values (
      submission_record.organization_id,
      submission_record.attempt_id,
      submission_record.id,
      scenario_id_value,
      summary_value,
      defect_json,
      -- Never guessed. The engine ranks for the trainer; only a human's
      -- confirmation is ever written here.
      null,
      'pending',
      severity_value
    );
  end if;

  return new;
end;
$$;

comment on function app_private.record_hunt_finding_on_submit() is
  'Records one pending hunt_findings row per hunt submission, carrying a copy '
  'of the structured report. Returns immediately for every other task kind. '
  'Total by construction -- it sits on the submission path and must never be '
  'able to stop a learner submitting.';

commit;

-- ─── Verify ─────────────────────────────────────────────────────────────────
do $verify$
declare
  has_column boolean;
begin
  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'hunt_findings'
      and column_name = 'reported_details'
  ) into has_column;

  if not has_column then
    raise exception 'hunt_findings.reported_details was not added'
      using errcode = '55000';
  end if;

  raise notice 'hunt_findings.reported_details present; trigger refreshed';
end
$verify$;
