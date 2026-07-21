-- ═══════════════════════════════════════════════════════════════════════════
-- WS-8 vertical slice — seed data (06_ARENA_WORKSTREAMS.md §3)
--
--   one locked task → one hunt → one planted bug
--       → student reports → trainer accepts → task unlocks → one badge
--
-- This is SEED DATA, not a migration. It is deliberately crude: its only job is
-- to prove the design round-trips before four other workstreams build on it.
-- WS-9 replaces the scenario with a real one; WS-11 replaces the badge insert
-- with the award engine.
--
-- Apply with:
--   tr -d '\r' < scripts/ws8-slice-seed.sql | ssh Nvidia-1 \
--     'docker exec -i supabase_db_ditele-v2 psql -U postgres -d postgres -v ON_ERROR_STOP=1'
--
-- Idempotent — every insert is `on conflict do nothing` / guarded, so re-running
-- is safe.
--
-- Facts verified against the live database before writing:
--   * courses.organization_id IS NULL for this course (a global course), so
--     every organization_id here must be NULL too — the lock-reason function
--     compares them with `is not distinct from`.
--   * public.prerequisites had ZERO rows. This slice creates the first
--     prerequisite the application has ever had, which is precisely why it is
--     worth proving in a browser rather than assuming.
--   * cohort 01980a30-…0001 is progression_mode='scheduled', so BOTH new tasks
--     need a task_schedules row or they lock with code 'schedule' instead of
--     the 'required_task' this slice is testing.
-- ═══════════════════════════════════════════════════════════════════════════

begin;

-- ─── Lift the published-graph guard, for this transaction only ──────────────
-- app_private.guard_immutable_content_graph raises 'published content graph is
-- immutable' on ANY write touching a published or archived content version.
-- Note this is NOT a gap in the guard: the product path for adding a task is to
-- author a new DRAFT version in the Content Studio and publish it, which the
-- guard permits and this slice is deliberately too crude to bother with. An
-- earlier revision of the function (20260717099200) carried a bootstrap
-- exception for exactly this case; the deployed revision (20260717099600)
-- removed it, so there is no escape hatch left and the trigger must come off.
--
-- Only the four *_guard_published_graph triggers are disabled, by name.
-- session_replication_role='replica' would have been one line, but it also
-- disables foreign-key triggers — and seeding a content graph with FK checking
-- switched off is how you end up with a snapshot that references a task that
-- does not exist. ALTER TABLE is transactional in Postgres, so if anything
-- below fails, the rollback restores every trigger with it.
alter table public.tasks
  disable trigger tasks_guard_published_graph;
alter table public.task_localizations
  disable trigger task_localizations_guard_published_graph;
alter table public.prerequisites
  disable trigger prerequisites_guard_published_graph;
alter table public.task_rubric_assignments
  disable trigger task_rubric_assignments_guard_published_graph;
-- And the version row itself: rebuilding snapshot is an UPDATE on a published
-- content_versions row, which guard_content_version_lifecycle also refuses.
alter table public.content_versions
  disable trigger content_versions_lifecycle_guard;

-- ─── The hunt task H, and the content task T2 it unlocks ────────────────────
-- `tasks_external_pair` requires source_system and external_id to be set or
-- null together, so a hunt names both: the arena registry, and the scenario
-- code inside it that WS-9 will resolve.
insert into public.tasks (
  id, course_id, stage_id, content_version_id, position, task_kind, state,
  target_url, expected_minutes, hint_penalty_basis_points,
  source_system, external_id
)
values
  -- H — the hunt. external_id is the handle WS-9 resolves to a scenario.
  ('019f9100-0000-7000-8000-000000000001',
   '01980a20-0000-7000-8000-000000000001',
   '01980a23-0000-7000-8000-000000000001',
   '01980a22-0000-7000-8000-000000000001',
   1, 'hunt', 'active', null, 20, 0, 'arena', 'checkout-v1'),
  -- T2 — the task that stays locked until H is accepted.
  ('019f9100-0000-7000-8000-000000000002',
   '01980a20-0000-7000-8000-000000000001',
   '01980a23-0000-7000-8000-000000000001',
   '01980a22-0000-7000-8000-000000000001',
   2, 'knowledge', 'active', null, 15, 0, null, null)
on conflict (id) do nothing;

-- ─── Course material — GERMAN ONLY ──────────────────────────────────────────
-- CONTENT_LOCALES === ["de"] (src/features/content/model.ts) since commit
-- 8a507cb. Task text is course material, so it gets one locale, not three.
insert into public.task_localizations (
  id, task_id, locale, title, instructions_html
)
values
  ('019f9100-0000-7000-8000-000000000011',
   '019f9100-0000-7000-8000-000000000001', 'de',
   'Checkout-Jagd: Finde den Rabatt-Fehler',
   '<p>Im Checkout dieses Shops steckt mindestens ein Fehler. '
   'Finde ihn, dokumentiere ihn nachvollziehbar und melde ihn als Fehlerbericht.</p>'
   '<p><strong>Hinweis:</strong> Nicht alles, was seltsam aussieht, ist ein Fehler. '
   'Entscheide begründet, was einen Ticket-Eintrag verdient.</p>'),
  ('019f9100-0000-7000-8000-000000000012',
   '019f9100-0000-7000-8000-000000000002', 'de',
   'Testfallentwurf für den Checkout',
   '<p>Diese Aufgabe wird freigeschaltet, sobald deine Fehlermeldung '
   'aus der Checkout-Jagd angenommen wurde.</p>')
on conflict (id) do nothing;

-- ─── The prerequisite: T2 is gated behind H ─────────────────────────────────
-- organization_id stays NULL to match the global course.
insert into public.prerequisites (
  id, organization_id, target_task_id, required_task_id, rule_version
)
values
  ('019f9100-0000-7000-8000-000000000003', null,
   '019f9100-0000-7000-8000-000000000002',
   '019f9100-0000-7000-8000-000000000001', 1)
on conflict (id) do nothing;

-- ─── A rubric for the hunt ──────────────────────────────────────────────────
-- decide_submission refuses any decision unless the task's content version has
-- an active rubric with at least one criterion (ISSUES.md I-016). Without this
-- row the trainer could never accept the hunt and the loop would not close.
-- Reuses the existing seeded rubric deliberately: grading a hunt is WS-10's
-- design problem, not the slice's.
insert into public.task_rubric_assignments (
  id, organization_id, task_id, content_version_id, rubric_id
)
values
  ('019f9100-0000-7000-8000-000000000004', null,
   '019f9100-0000-7000-8000-000000000001',
   '01980a22-0000-7000-8000-000000000001',
   '01980a2b-0000-7000-8000-000000000001')
on conflict (id) do nothing;

-- ─── Schedules — the cohort is in 'scheduled' progression mode ──────────────
-- Open now, so the only thing that can lock T2 is the prerequisite.
insert into public.task_schedules (
  id, cohort_id, task_id, available_from, due_at, change_reason
)
values
  ('019f9100-0000-7000-8000-000000000021',
   '01980a30-0000-7000-8000-000000000001',
   '019f9100-0000-7000-8000-000000000001',
   now() - interval '1 day', now() + interval '60 days',
   'WS-8 vertical slice'),
  ('019f9100-0000-7000-8000-000000000022',
   '01980a30-0000-7000-8000-000000000001',
   '019f9100-0000-7000-8000-000000000002',
   now() - interval '1 day', now() + interval '60 days',
   'WS-8 vertical slice')
on conflict (id) do nothing;

-- ─── Rebuild the published projection ───────────────────────────────────────
-- Learner RPCs read content_versions.snapshot, never the authoring tables
-- (RPC_CONTRACTS §0.6). Rebuild it with the same builder publish_content_version
-- uses — never hand-assemble this document.
update public.content_versions
set snapshot = app_private.build_content_snapshot(id),
    updated_at = now()
where id = '01980a22-0000-7000-8000-000000000001';

-- ─── Put the guard back ─────────────────────────────────────────────────────
alter table public.tasks
  enable trigger tasks_guard_published_graph;
alter table public.task_localizations
  enable trigger task_localizations_guard_published_graph;
alter table public.prerequisites
  enable trigger prerequisites_guard_published_graph;
alter table public.task_rubric_assignments
  enable trigger task_rubric_assignments_guard_published_graph;
alter table public.content_versions
  enable trigger content_versions_lifecycle_guard;

commit;

-- ─── Report ─────────────────────────────────────────────────────────────────
-- The trigger column is the one that matters: if any of these is not 'O', the
-- database has been left with a disabled integrity guard.
select
  (select count(*) from pg_trigger t
    where not t.tgisinternal
      and (t.tgname like '%_guard_published_graph'
           or t.tgname = 'content_versions_lifecycle_guard')
      and t.tgenabled <> 'O') as guards_still_disabled,
  jsonb_array_length(snapshot -> 'stages' -> 0 -> 'tasks') as tasks_in_snapshot,
  app_private.is_valid_learner_content_snapshot(snapshot) as snapshot_valid
from public.content_versions
where id = '01980a22-0000-7000-8000-000000000001';
