-- ═══════════════════════════════════════════════════════════════════════════
-- Bug Arena ticket — the label taxonomy behind the report's "Labels" field.
-- 05_BUG_ARENA_AND_GAMIFICATION.md §G3+G4.
--
-- Two things are wrong with `public.bug_categories` as deployed, both measured
-- on the live database before this file was written (ISSUES.md I-045):
--
--   1. It holds exactly ONE row -- the global `functional`. The design names
--      five: functional, UI, data, performance, a11y.
--   2. It has NO read policy. Its only policy is `bug_categories_content_write`,
--      gated on has_permission('content.manage'), so a learner -- and in fact a
--      trainer -- reads zero rows. RLS returns an empty set rather than an
--      error, which is the failure mode RPC_CONTRACTS.md §10 calls the most
--      expensive bug available in this codebase: it reads as "no categories
--      exist" instead of "you may not see these".
--
-- This migration fixes both, forward-only and non-destructively. It adds rows
-- and one SELECT policy; it changes nothing that exists and drops nothing.
--
-- ⚠️ Note what this deliberately does NOT do: it does not make the defect form
-- query this table. `DefectForm` is a Client Component rendered by
-- `task-workspace.tsx`, which WS-10 does not own and therefore cannot make pass
-- a server-fetched prop. The canonical list the form renders is
-- `src/features/arena/ticket/labels.ts`; these rows exist so that joins,
-- exports and trainer-side screens have real data to resolve a code against.
-- The two are kept deliberately in step -- adding a sixth label means one entry
-- in that file, one `de.json` key, and one row here.
--
-- Idempotent: `on conflict do nothing` against the existing partial unique
-- index, and `drop policy if exists` before `create policy`. Re-running is a
-- no-op.
-- ═══════════════════════════════════════════════════════════════════════════

begin;

-- ─── 1. The four missing categories ─────────────────────────────────────────
-- Global rows (organization_id is null), matching how `functional` was seeded.
-- `labels` is the {de,en,ru} shape the column already uses. This is INTERFACE
-- vocabulary, not course material -- a category name is chrome a trainer sorts
-- by, so unlike a hunt scenario's title it is translatable.
--
-- The conflict target is `(code) where organization_id is null`, which is the
-- existing partial unique index `bug_categories_global_code_uidx`. Naming the
-- predicate is required for Postgres to infer a partial index.
insert into public.bug_categories (organization_id, code, labels, state)
values
  (null, 'ui',
   '{"de": "Oberfläche", "en": "User interface", "ru": "Интерфейс"}'::jsonb,
   'active'),
  (null, 'data',
   '{"de": "Daten", "en": "Data", "ru": "Данные"}'::jsonb,
   'active'),
  (null, 'performance',
   '{"de": "Performance", "en": "Performance", "ru": "Производительность"}'::jsonb,
   'active'),
  (null, 'accessibility',
   '{"de": "Barrierefreiheit", "en": "Accessibility", "ru": "Доступность"}'::jsonb,
   'active')
on conflict (code) where organization_id is null do nothing;

-- ─── 2. A scoped read policy ────────────────────────────────────────────────
-- Global active categories are readable by any signed-in user: the taxonomy is
-- shared vocabulary, and a learner has to see a label's name in order to pick
-- it. An organization's own categories stay scoped to its active members via
-- the same helper every other tenant-scoped policy uses, so a tenant's private
-- vocabulary does not leak across organizations.
--
-- SELECT only. The existing `bug_categories_content_write` policy keeps sole
-- ownership of writes, so authoring still requires 'content.manage'.
drop policy if exists bug_categories_scoped_read on public.bug_categories;
create policy bug_categories_scoped_read on public.bug_categories
  for select to authenticated
  using (
    state = 'active'
    and (
      organization_id is null
      or (select app_private.is_active_organization_member(organization_id))
    )
  );

comment on policy bug_categories_scoped_read on public.bug_categories is
  'Read the label taxonomy. Global categories are shared vocabulary; a '
  'tenant''s own stay scoped to its active members. Writes remain governed '
  'solely by bug_categories_content_write.';

commit;

-- ─── Verify: the five codes exist and the read policy is really there ───────
-- The table already had RLS enabled, so a policy that failed to create would
-- leave reads denied rather than open -- but "the picker is empty" is precisely
-- the symptom this migration exists to remove, and it is invisible from the
-- application. Assert it here instead of discovering it in a browser.
do $verify$
declare
  missing_codes text;
  policy_count integer;
begin
  select string_agg(expected.code, ', ') into missing_codes
  from (values ('functional'), ('ui'), ('data'), ('performance'), ('accessibility'))
    as expected (code)
  where not exists (
    select 1 from public.bug_categories category_record
    where category_record.code = expected.code
      and category_record.organization_id is null
      and category_record.state = 'active'
  );

  if missing_codes is not null then
    raise exception 'bug_categories is missing active global code(s): %',
      missing_codes using errcode = '55000';
  end if;

  select count(*) into policy_count
  from pg_catalog.pg_policy
  where polrelid = 'public.bug_categories'::regclass
    and polname = 'bug_categories_scoped_read';

  if policy_count <> 1 then
    raise exception 'bug_categories_scoped_read did not get created'
      using errcode = '55000';
  end if;

  raise notice 'bug_categories: 5 global codes active, scoped read policy in place';
end
$verify$;
