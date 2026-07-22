-- ═══════════════════════════════════════════════════════════════════════════
-- The two write-time constraints the German-only pass left behind.
--
-- `20260804200000_content_german_only_locales.sql` relaxed the locale rules in
-- the validators and on `task_gate_questions`. Two table constraints were not
-- in its scope, and they are the ones that refuse the write before any
-- validator is reached:
--
--   task_hints_content_translations_check          CHECK (… ? 'en')
--   task_assessments_question_translations_check   CHECK (… ? 'en')
--
-- Measured: adding a hint to a task in the running studio failed to save, and
--   insert into public.task_hints (…) values (…, '{"de":"Nur Deutsch"}')
-- reproduces it directly with
--   new row for relation "task_hints" violates check constraint
--   "task_hints_content_translations_check"
-- The studio writes `{"de": "…"}` — `CONTENT_LOCALES` is `["de"]` — so hints
-- and quiz questions were unauthorable through the UI. Every such row that
-- exists today came from SQL seeds, which is why the gap went unnoticed.
--
-- Both also gain something they never had. `? 'en'` tests for a KEY, not a
-- value, so `{"en": ""}` satisfied the old constraint: a hint could be stored
-- completely empty and only fail much later, at publish. The replacements ask
-- for the content locale to be present AND non-blank, which is what the
-- validators have always meant by "complete".
-- ═══════════════════════════════════════════════════════════════════════════

begin;

alter table public.task_hints
  drop constraint if exists task_hints_content_translations_check;
alter table public.task_hints
  add constraint task_hints_content_translations_check check (
    jsonb_typeof(content_translations) = 'object'
    and nullif(btrim(content_translations ->> 'de'), '') is not null
  );

alter table public.task_assessments
  drop constraint if exists task_assessments_question_translations_check;
alter table public.task_assessments
  add constraint task_assessments_question_translations_check check (
    jsonb_typeof(question_translations) = 'object'
    and nullif(btrim(question_translations ->> 'de'), '') is not null
  );

-- `task_options.labels` is deliberately NOT tightened here. It has only ever
-- been checked for `jsonb_typeof = 'object'` at write time and its locale rule
-- lives in the validators, so adding one now would be this migration quietly
-- changing a third table's contract rather than repairing two.

commit;

-- ─── Verification, by behaviour ────────────────────────────────────────────
do $verify$
declare
  sample_task uuid;
  refused boolean;
begin
  -- A DRAFT version: a published content graph is immutable by a separate
  -- guard, so any task at all would have tested that guard instead of this
  -- constraint.
  select task_record.id into sample_task
  from public.tasks task_record
  join public.content_versions version_record
    on version_record.id = task_record.content_version_id
  where version_record.state = 'draft'
  limit 1;

  if sample_task is null then
    raise notice 'no draft task to verify against; skipping';
    return;
  end if;

  -- German-only must now be accepted. This is the case that was broken.
  begin
    insert into public.task_hints (task_id, position, content_translations)
    values (sample_task, 9999, '{"de": "Nur Deutsch"}'::jsonb);
    delete from public.task_hints where task_id = sample_task and position = 9999;
  exception when check_violation then
    raise exception 'a German-only hint is still refused';
  end;

  -- Blank must still be refused, which the old `? ''en''` constraint never did.
  refused := false;
  begin
    insert into public.task_hints (task_id, position, content_translations)
    values (sample_task, 9999, '{"de": "   "}'::jsonb);
    delete from public.task_hints where task_id = sample_task and position = 9999;
  exception when check_violation then
    refused := true;
  end;
  if not refused then
    raise exception 'a blank hint was accepted; the non-blank rule is not doing its job';
  end if;
end;
$verify$;
