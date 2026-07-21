-- ═══════════════════════════════════════════════════════════════════════════
-- WS-10 — a filed ticket on WS-8's slice hunt, so the trainer panel has
-- something real to render.
--
-- Reproducible on purpose. WS-8's slice submitted its hunt BEFORE WS-10's
-- trigger existed, so `hunt_findings` was empty and the ground-truth panel had
-- nothing to show — which is indistinguishable from a panel that does not work.
--
-- ⚠️ This drives the finding through the REAL path. It does not insert into
-- hunt_findings directly: it stages a draft and then inserts a
-- submission_version, exactly as `submit_attempt` does, and lets
-- `submission_versions_record_hunt_finding` create the row. A fixture that
-- wrote the row by hand would prove the panel renders and prove nothing about
-- the trigger.
--
-- Idempotent. Safe to re-run: the draft upserts, and the trigger upserts the
-- pending finding rather than accumulating rows.
--
-- Run:
--   tr -d '\r' < scripts/ws10-ticket-fixture.sql | ssh Nvidia-1 \
--     'docker exec -i supabase_db_ditele-v2 psql -U postgres -d postgres -v ON_ERROR_STOP=1'
-- ═══════════════════════════════════════════════════════════════════════════

begin;

-- WS-8's slice attempt is 'accepted', and `guard_editable_attempt_draft`
-- refuses a draft write for any state outside in_progress/revision_required.
-- Disabled for this transaction only: we are staging a fixture, not relaxing a
-- rule. Re-enabled below, and asserted after commit.
alter table public.attempt_drafts disable trigger user;

insert into public.attempt_drafts
  (attempt_id, answer_text, selected_option_ids, evidence_draft)
values (
  '019f8565-8304-7a9e-81e1-13cf631c4fd5',
  '',
  '{}',
  -- The DefectReport shape from src/features/learning/model.ts, with all four
  -- fields WS-10 added. Written the way a student would: German prose that
  -- echoes the scenario's `reproduction` without ever naming the defect code.
  jsonb_build_array(jsonb_build_object(
    'summary',     'Gutschein wird nicht von der Gesamtsumme abgezogen',
    'severity',    'high',
    'sourceUri',   'http://127.0.0.1:3110/de/arena/sandbox/checkout-v1',
    'steps',       E'1. Gutscheincode WMC10 in der Bestellübersicht eingeben\n2. Auf „Einlösen" klicken\n3. Gesamtsumme mit der Rabattzeile vergleichen',
    'expected',    'Die Rabattzeile wird angezeigt und die Gesamtsumme sinkt um den Rabatt.',
    'actual',      'Die Rabattzeile erscheint, die Gesamtsumme bleibt aber unverändert.',
    'description', 'Tritt bei jedem Betrag auf, nicht nur bei diesem Warenkorb.',
    'labels',      jsonb_build_array('functional', 'data'),
    'environment', 'Chrome 131 · Windows · 1440×900 · light',
    'screenshotIds', '[]'::jsonb
  ))
)
on conflict (attempt_id) do update
  set evidence_draft = excluded.evidence_draft;

alter table public.attempt_drafts enable trigger user;

-- The real submit event. The trigger does the rest.
insert into public.submission_versions
  (submission_id, version_number, idempotency_key, answer_text,
   selected_option_ids, evidence_refs, elapsed_seconds, hint_used,
   task_snapshot, submitted_by, submitted_at)
select submission_id,
       version_number + 1,
       'ws10-ticket-fixture',
       'Gutschein wird nicht von der Gesamtsumme abgezogen',
       selected_option_ids, evidence_refs, elapsed_seconds, hint_used,
       task_snapshot, submitted_by, statement_timestamp()
from public.submission_versions
where submission_id = '019f8566-6e34-7ecf-b7cf-b3e68bf7374d'
  and not exists (
    select 1 from public.submission_versions existing
    where existing.idempotency_key = 'ws10-ticket-fixture'
  )
order by version_number desc
limit 1;

commit;

do $verify$
declare
  finding_count integer;
  disabled_triggers text;
begin
  select count(*) into finding_count
  from public.hunt_findings
  where attempt_id = '019f8565-8304-7a9e-81e1-13cf631c4fd5';

  if finding_count <> 1 then
    raise exception 'expected exactly 1 finding, found %', finding_count
      using errcode = '55000';
  end if;

  -- Leaving a guard disabled on a live database would be far worse than the
  -- fixture is worth. Assert it came back.
  select string_agg(trigger_record.tgname, ', ') into disabled_triggers
  from pg_catalog.pg_trigger trigger_record
  where trigger_record.tgrelid = 'public.attempt_drafts'::regclass
    and not trigger_record.tgisinternal
    and trigger_record.tgenabled = 'D';

  if disabled_triggers is not null then
    raise exception 'left disabled on attempt_drafts: %', disabled_triggers
      using errcode = '55000';
  end if;

  raise notice 'ws10 fixture: 1 finding recorded, no trigger left disabled';
end
$verify$;
