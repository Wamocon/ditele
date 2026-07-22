-- ═══════════════════════════════════════════════════════════════════════════
-- No rubric, no decision — the Praxiskurs could not be reviewed at all.
--
-- With the reads repaired (20260805300000) the trainer's screen still refused:
-- "Für diese Aufgabe ist kein aktiver Bewertungsbogen hinterlegt." That message
-- is not a UI guess. `app_private.decide_submission_effects_unowned` reads the
-- rubric out of the FROZEN SNAPSHOT —
--
--     select (task_payload.value #>> '{rubric,rubric_id}')::uuid ...
--     if assigned_rubric_id is null then
--       raise exception 'no active rubric is assigned to this task content version'
--
-- — and refuses every decision without one, accept or reject alike. So a course
-- published without rubrics is a course whose submissions can never leave the
-- queue, and every task behind the first one stays locked forever.
--
-- ⚠️ Publishing does not catch this. `assert_competency_graph_ready` requires a
-- rubric only for `practical` tasks; the Praxiskurs is `knowledge` and `hunt`,
-- so it published cleanly and the gap only appeared at the first review. That
-- asymmetry is worth fixing in the readiness check, but not here — this
-- migration unblocks the course that is already live.
--
-- Three steps, and the third is the one with teeth: the rubric must reach the
-- SNAPSHOT, because that is where the decision path reads it from. Assigning it
-- to the tasks alone would change nothing a trainer could see — the same trap
-- as I-048, where `tasks.target_url` was set and the snapshot kept its null.
-- ═══════════════════════════════════════════════════════════════════════════

begin;

-- ─── 1. The rubric ─────────────────────────────────────────────────────────
-- Two criteria, deliberately generic: this one rubric covers all 47 tasks, and
-- a per-task rubric is an authoring decision nobody has made yet. Points are
-- what the trainer actually weighs — did the work produce the right result, and
-- is it written down well enough for someone else to follow.

insert into public.rubrics (id, organization_id, code, labels, version, state)
select '01991020-0000-7000-8000-000000000001',
       organization_record.id, 'praxiskurs-review',
       '{"de": "Bewertung Praxiskurs"}'::jsonb, 1, 'active'
from public.organizations organization_record
where organization_record.is_default
  and organization_record.state = 'active'
  and organization_record.archived_at is null
on conflict (id) do update set
  labels = excluded.labels,
  state = excluded.state,
  updated_at = statement_timestamp();

-- `required_for_acceptance` on the first: a decision that does not score the
-- result is not a review. The second is optional so a trainer can accept work
-- that is right but thinly documented, and say so in the comment.
insert into public.rubric_criteria (
  id, rubric_id, skill_id, code, labels, position, max_points,
  required_for_acceptance
)
values
  ('01991021-0000-7000-8000-000000000001',
   '01991020-0000-7000-8000-000000000001', null, 'ergebnis',
   '{"de": "Ergebnis der Aufgabe"}'::jsonb, 0, 10, true),
  ('01991021-0000-7000-8000-000000000002',
   '01991020-0000-7000-8000-000000000001', null, 'dokumentation',
   '{"de": "Dokumentation und Nachvollziehbarkeit"}'::jsonb, 1, 10, false)
on conflict (id) do update set
  labels = excluded.labels,
  max_points = excluded.max_points,
  required_for_acceptance = excluded.required_for_acceptance;

-- ─── 2. Assign it to every task in the published version ───────────────────
-- `task_rubric_assignments_guard_published_graph` refuses writes against a
-- published content version — correctly; the product path is a new draft. This
-- is a repair to a course that is already live and already has a submission
-- waiting, so the guard is dropped BY NAME for these two statements and put
-- back immediately, with an assertion that it really came back.
--
-- NOT `session_replication_role`: that would disable every trigger on every
-- table at once, including foreign-key enforcement, while writing to a content
-- graph. 20260727100000 and 20260727110000 make the same choice for the same
-- reason.

alter table public.task_rubric_assignments
  disable trigger task_rubric_assignments_guard_published_graph;

insert into public.task_rubric_assignments (
  organization_id, task_id, content_version_id, rubric_id
)
select course_record.organization_id, task_record.id,
       task_record.content_version_id,
       '01991020-0000-7000-8000-000000000001'
from public.tasks task_record
join public.courses course_record on course_record.id = task_record.course_id
where task_record.content_version_id = '01991000-0000-7000-8000-000000000002'
-- `task_rubric_assignments_task_version_unique (task_id, content_version_id)`,
-- not the `_scope_unique` of the CREATE TABLE in 20260717098500 — a later
-- migration replaced it, and the deployed name is the one that exists.
on conflict on constraint task_rubric_assignments_task_version_unique do update set
  rubric_id = excluded.rubric_id;

alter table public.task_rubric_assignments
  enable trigger task_rubric_assignments_guard_published_graph;

do $guard$
begin
  if exists (
    select 1 from pg_catalog.pg_trigger
    where tgrelid = 'public.task_rubric_assignments'::regclass
      and tgname = 'task_rubric_assignments_guard_published_graph'
      and tgenabled = 'D'
  ) then
    raise exception
      'task_rubric_assignments_guard_published_graph left DISABLED — refusing to commit';
  end if;
end
$guard$;

-- ─── 3. Get it into the snapshot ───────────────────────────────────────────
-- The half that actually reaches a trainer. `build_content_snapshot_without_
-- competencies` emits `task.rubric` from `task_rubric_assignments`, so the
-- snapshot is rebuilt from the repaired graph — which is what publishing would
-- have done.

do $snapshot$
declare
  version_id constant uuid := '01991000-0000-7000-8000-000000000002';
  rebuilt jsonb;
  course_ref uuid;
  course_slug text;
  version_no integer;
  without_rubric integer;
begin
  rebuilt := app_private.build_content_snapshot(version_id);
  if rebuilt is null or rebuilt -> 'stages' is null then
    raise exception 'build_content_snapshot returned nothing usable';
  end if;

  alter table public.content_versions disable trigger content_versions_lifecycle_guard;

  update public.content_versions set snapshot = rebuilt where id = version_id;

  alter table public.content_versions enable trigger content_versions_lifecycle_guard;

  if exists (
    select 1 from pg_catalog.pg_trigger
    where tgrelid = 'public.content_versions'::regclass
      and tgname = 'content_versions_lifecycle_guard'
      and tgenabled = 'D'
  ) then
    raise exception
      'content_versions_lifecycle_guard left DISABLED — refusing to commit';
  end if;

  -- ⚠️ A direct snapshot UPDATE bypasses `publish_content_version`, which is
  -- where this check normally runs. I-041 is what happens when it is skipped:
  -- an invalid snapshot does not degrade a page, it makes
  -- `list_my_learning_courses` return zero rows and the course silently
  -- disappears for every enrolled learner.
  select course_id, version_number into course_ref, version_no
  from public.content_versions where id = version_id;
  select slug into course_slug from public.courses where id = course_ref;

  if not app_private.is_valid_learner_content_snapshot(
       (select snapshot from public.content_versions where id = version_id),
       course_ref, course_slug, version_id, version_no) then
    raise exception
      'the rebuilt snapshot is INVALID — refusing to commit. An invalid '
      'snapshot empties the course for every enrolled learner (I-041).';
  end if;
  if not app_private.is_valid_public_catalog_snapshot(
       (select snapshot from public.content_versions where id = version_id),
       course_ref, course_slug, version_id, version_no) then
    raise exception 'the rebuilt snapshot is not a valid catalogue snapshot';
  end if;

  -- The point of the whole file: every task carries a rubric the decision path
  -- can find. Asserted on the SNAPSHOT, not on task_rubric_assignments — the
  -- table was already right before step 3 and the trainer still could not act.
  select count(*) into without_rubric
  from public.content_versions version_record,
       jsonb_array_elements(version_record.snapshot -> 'stages') stage_record,
       jsonb_array_elements(stage_record -> 'tasks') task_record
  where version_record.id = version_id
    and nullif(task_record #>> '{rubric,rubric_id}', '') is null;

  if without_rubric > 0 then
    raise exception '% tasks still have no rubric in the snapshot', without_rubric;
  end if;

  raise notice 'every task in the published snapshot now carries a rubric';
end
$snapshot$;

commit;
