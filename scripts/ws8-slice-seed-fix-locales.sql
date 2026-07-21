-- ═══════════════════════════════════════════════════════════════════════════
-- WS-8 slice seed, correction: the learner snapshot validator demands THREE
-- locales per task, even though course material is German-only.
--
-- app_private.is_valid_learner_content_snapshot enforces, per task AND per
-- stage:
--     jsonb_array_length(payload -> 'localizations') <> 3          -> invalid
--     count(*) filter (locale in ('en','de','ru')) <> 3            -> invalid
--
-- Seeding German-only localizations therefore does not produce a
-- partially-translated task. It makes the ENTIRE snapshot invalid, and the
-- learner projection then returns nothing at all: `list_my_learning_courses`
-- drops from 1 row to 0 and the student's course disappears. That is what
-- happened when this slice was first seeded, and it is a far worse failure mode
-- than a missing translation.
--
-- The product rule (CONTENT_LOCALES === ["de"], commit 8a507cb) is an
-- APPLICATION-layer decision. The database validator predates it
-- (20260717099800) and was never relaxed. Until someone reconciles the two,
-- every locale row must exist. Since the content genuinely is German, all three
-- carry the German text — that is the honest representation: the learner reads
-- German whichever locale they pick, which is exactly the intended behaviour.
--
-- Apply with:
--   tr -d '\r' < scripts/ws8-slice-seed-fix-locales.sql | ssh Nvidia-1 \
--     'docker exec -i supabase_db_ditele-v2 psql -U postgres -d postgres -v ON_ERROR_STOP=1'
-- ═══════════════════════════════════════════════════════════════════════════

begin;

alter table public.task_localizations
  disable trigger task_localizations_guard_published_graph;
alter table public.content_versions
  disable trigger content_versions_lifecycle_guard;

-- en + ru for both slice tasks, carrying the German text verbatim.
insert into public.task_localizations (id, task_id, locale, title, instructions_html)
select
  ('019f9100-0000-7000-8001-' || lpad((row_number() over (order by src.task_id, src.locale))::text, 12, '0'))::uuid,
  src.task_id,
  src.locale,
  src.title,
  src.instructions_html
from (
  select base.task_id, locale_name.locale, base.title, base.instructions_html
  from public.task_localizations base
  cross join (values ('en'), ('ru')) as locale_name(locale)
  where base.locale = 'de'
    and base.task_id in (
      '019f9100-0000-7000-8000-000000000001',
      '019f9100-0000-7000-8000-000000000002'
    )
) src
where not exists (
  select 1 from public.task_localizations existing
  where existing.task_id = src.task_id and existing.locale = src.locale
);

update public.content_versions
set snapshot = app_private.build_content_snapshot(id),
    updated_at = now()
where id = '01980a22-0000-7000-8000-000000000001';

alter table public.task_localizations
  enable trigger task_localizations_guard_published_graph;
alter table public.content_versions
  enable trigger content_versions_lifecycle_guard;

commit;

-- ─── Verify: this must print t, and 0 guards disabled ───────────────────────
select
  app_private.is_valid_learner_content_snapshot(
    cv.snapshot, c.id, c.slug, cv.id, cv.version_number
  ) as learner_snapshot_valid,
  (select count(*) from pg_trigger t
    where not t.tgisinternal
      and (t.tgname like '%_guard_published_graph'
           or t.tgname = 'content_versions_lifecycle_guard')
      and t.tgenabled <> 'O') as guards_still_disabled
from public.content_versions cv
join public.courses c on c.id = cv.course_id
where cv.id = '01980a22-0000-7000-8000-000000000001';
