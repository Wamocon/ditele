# WS-5 — Admin Content

Started: 2026-07-21 · Port: 3105 · Dist: `.next-ws5` · Account: `admin@ditele.local` / `123123123`

---

## RESUME HERE
Updated: 2026-07-21 · Chat: **#1**

**State:** DONE — all 6 routes built, committed and rendering real data.

> ### For the coordinator, in one paragraph
> **All six WS-5 routes are real.** No stub is left in this workstream.
> `tsc --noEmit`, `eslint` on my paths and `node scripts/smoke.mjs` (47/47) are
> green, and `scripts/ws5-routes.mjs` renders all 12 route instances — every
> course and every content version, so the studio is exercised in **all four**
> lifecycle states. The whole `draft → in_review → approved → published →
> archived` chain is verified end to end against the live database
> (`scripts/ws5-probe2.mjs`). The one thing I could not do is click the buttons
> in a real browser: **no route was eyeballed at 375px or in dark mode** — that
> is WS-7's sweep. See the honest table below.

**Done and committed:**

| Commit | What |
|---|---|
| `ef028e1` | `content.ts` data layer + `features/content/**` + ⭐ **Content Studio** |
| `0ad4ab1` | `/admin/courses` — list, search, state filter, pagination |
| `03d47a5` | `/admin/courses/new` — create course → straight into the studio |
| `bd5aa85` | `/admin/courses/[courseId]` — metadata, 3 locale editors, version list |
| `93d0cd6` | `/admin` — dashboard, 6 KPI tiles, content status, activity feed |
| `b36b313` | `/admin/tasks` — task inventory across all courses |

**Half-finished:**
- Nothing.

**Next, if someone picks this up:**
1. Eyeball all six routes at 375px and in dark mode (WS-7 step 4/5).
2. Click one full authoring cycle in a browser: new course → stage → task →
   fill 3 locales → skills 100 % → submit → approve → publish. Every step is
   proven at the database level, but no human has driven it through the UI.
3. The cut list below, if anyone wants it.

**Blocked on:**
- Nothing.

---

## Routes — honest verification

Legend: ✅ verified · ⬜ built but not personally verified · n/a not applicable

| Route | Built | Real data | Loading | Empty | Error | 375px | Dark | Keyboard |
|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| `/admin` | ✅ | ✅ | ✅ | ✅ | ✅ | ⬜ | ⬜ | ⬜ |
| `/admin/courses` | ✅ | ✅ | ✅ | ✅ | ✅ | ⬜ | ⬜ | ⬜ |
| `/admin/courses/new` | ✅ | n/a | ✅ | n/a | ✅ | ⬜ | ⬜ | ⬜ |
| `/admin/courses/[courseId]` | ✅ | ✅ | ✅ | ✅ | ✅ | ⬜ | ⬜ | ⬜ |
| `/admin/courses/[courseId]/versions/[versionId]` | ✅ | ✅ | ✅ | ✅ | ✅ | ⬜ | ⬜ | ⬜ |
| `/admin/tasks` | ✅ | ✅ | ✅ | ✅ | ✅ | ⬜ | ⬜ | ⬜ |

**What "verified" means here.** *Real data*: fetched the rendered HTML as
`admin@ditele.local` and read the actual course titles, states and counts out of
it (`scripts/ws5-peek.mjs`). *Empty*: the empty branch exists and is reachable —
`/admin/courses/…/versions/019f9000-000d-7000-8000-000000000002` renders
"Noch keine Stufe" today. *Error*: every page renders `ErrorState` on
`result.ok === false`, and every route has `error.tsx`.

**What ⬜ means.** This chat had no browser. Responsive and dark-mode correctness
rest on using only design tokens, `DataTable`'s built-in card fallback below `md`
and `Button`'s `min-h-11`; none of it was *seen*. Do not tick these boxes for me.

Studio verified in all four version states (each is a real row today):

| State | Version id | What the studio shows |
|---|---|---|
| `draft` | `019f9000-000d-…0002` | checklist, "Zur Prüfung geben" disabled until ready |
| `in_review` | `019f9000-000d-…0001` | checklist + comment box, Freigeben / Änderungen anfordern |
| `published` | `01980a22-0000-…0001` | read-only banner, archive flow behind the impact screen |
| `archived` | `be0f9d11-…` | read-only, no actions |

---

## Data functions added

`src/shared/data/content.ts` (server-only, every function returns `Result<T>`):

- **Reads** — `listAdminCourses`, `getAdminCourse`, `getStudioWorkspace`,
  `listAdminTasks`, `getAdminDashboard`
- **Course writes** — `createCourse`, `updateCourseMeta`, `setCourseState`,
  `upsertCourseLocalization`, `createVersion`
- **Stage writes** — `createStage`, `upsertStageLocalization`, `deleteStage`,
  `reorderStages`
- **Task writes** — `createTask`, `updateTask`, `deleteTask`, `reorderTasks`,
  `setTaskHints`, `setTaskSkills`, `setTaskAssessment`
- **Lifecycle** — `submitForReview`, `decideReview`, `publishVersion`,
  `loadArchiveImpact`, `archiveVersion`

`src/features/content/`:
- `model.ts` — types + `buildReadiness()` (mirrors the DB's own assertion) + `isVersionEditable`
- `i18n.ts` — `adminStrings(locale)`, `format`, `formatDate`
- `actions.ts` — every Server Action, each re-checking `requireRole(["admin"])`
- `components/` — `studio`, `lifecycle-bar`, `readiness-list`, `stage-card`,
  `task-editor`, `course-form`, `course-detail`, `list-filters`, `pager`

---

## 🔬 Things I learned that are written down nowhere else

Measured against the live database with `scripts/ws5-probe*.mjs` (mine, re-runnable).
`RPC_CONTRACTS.md` §0.6 said only `courses`, `course_localizations` and
`content_versions` take a direct insert. **That is incomplete and it matters:**
the whole Content Studio depends on the authoring tables, and they *do* work.

### 1. ⭐ The authoring tables DO accept direct admin DML

| Table | insert | update | delete |
|---|:--:|:--:|:--:|
| `courses` | ✅ | ✅ | ✅ unless it owns a published/archived version |
| `course_localizations` | ✅ | ✅ | ✅ |
| `content_versions` | ✅ | ✅ | ✅ while `draft` |
| `stages` · `stage_localizations` | ✅ | ✅ | ✅ |
| `tasks` · `task_localizations` | ✅ | ✅ | ✅ |
| `task_hints` · `task_options` · `task_option_answers` · `task_assessments` · `task_skill_mappings` | ✅ | ✅ | ✅ |
| `audit_events` | ❌ `42501` RLS | — | — |

The policy is `<table>_content_write … has_permission('content.manage', course.organization_id)`
and it joins **through the parent task/stage to the course**. So a child insert
fails `42501 new row violates row-level security policy` whenever the parent row
does not exist yet — which reads as "admin is forbidden" and is not. Insert the
parent first. That single confusion cost the first probe run.

Every `upsert` conflict target `content.ts` uses is confirmed to exist
(`scripts/ws5-probe5.mjs`): `course_id,locale` · `stage_id,locale` ·
`task_id,locale` · `task_id` on `task_assessments`. A wrong one raises `42P10`
at runtime on a save button, so it is worth re-running that probe after any
schema change.

### 2. 🚨 `tasks.task_kind` is a CHECK constraint, not an enum

`check (task_kind in ('practical', 'knowledge', 'placement'))`
(migration `…091000` line 247). It is **not** an enum in `database.types.ts` —
the column is typed `string`, so TypeScript will not catch a wrong value. My
first probe failed on `task_kind: "theory"`, which then cascaded into three
*false* RLS failures on the child tables.

UI mapping used throughout WS-5: `knowledge` → **Theorie**, `practical` →
**Praxis**, `placement` → **Einstufung**. `practical` is the one that carries
`target_url`, and `updateTask` clears the URL when the kind changes away from it.

### 3. ⭐ The lifecycle, measured — and `approved` does NOT change the state

```
draft (row_version 1)
  → submit_content_for_review          → in_review  (row_version 2)
  → decide_content_review('approved')  → in_review  (row_version 3)  ← still in_review!
  → publish_content_version            → published  (row_version 4)
  → archive_content_version            → archived   (row_version 5)
```

- `decide_content_review` only moves the state when the decision is
  **`changes_requested`** (→ back to `draft`). `approved` writes a
  `content_reviews` row and bumps `row_version`, nothing else. **A UI that waits
  for a state change after approval waits forever.** The signal that a version is
  approved is a `content_reviews` row — which is why `getStudioWorkspace` reads
  the latest one and the lifecycle bar keys "Freigegeben" off it.
- `p_decision` is `'approved' | 'changes_requested'`. **Not `rejected`.**
  (`decide_enrollment.p_decision` is a different enum — do not copy one call
  into the other.)
- `publish_content_version` needs state `in_review` **plus** a latest
  `content_reviews` row with `decision = 'approved'` **and** a
  `content_fingerprint` still equal to the version's current fingerprint. Edit
  anything after approval and publish fails `23514` — it must be re-approved.
  ⚠️ You cannot precompute that fingerprint: `app_private.content_fingerprint`
  is private, and the `fingerprint` in `get_content_archive_impact` is a hash of
  the *impact payload*, a different value. So the UI cannot predict this case;
  it surfaces the RPC's error.
- **Every call bumps `row_version`, so the next one needs the new value.**
  `content.ts` re-reads it immediately before each lifecycle call.

### 4. 🚨 `p_idempotency_key` must be 16–200 characters

Every content lifecycle RPC checks `length(p_idempotency_key) not between 16 and 200`
and raises `22023`. A short key like `pub:1` fails with a message that reads like
a CAS problem. `contentKey()` in `content.ts` guarantees the length.

### 5. ⭐ The publish checklist, extracted from the database

`app_private.assert_content_version_ready` (migration `…099200` line 781 +
`…099600` line 592) runs inside **submit**, **approve** and **publish**, raising
a bare `23514` every time. `buildReadiness()` in `features/content/model.ts`
mirrors all ten rules so the studio names the missing thing instead:

1. Course has all three localizations `en`/`de`/`ru`, each with non-empty
   `title`, `summary` and `description_html`. ← by far the most common failure
2. At least one stage owned by this version.
3. Stage `position` contiguous **from 0** (`min = 0`, `max = count - 1`).
4. Every stage has 3 localizations with non-empty `title` + `description_html`.
5. Every stage has ≥ 1 task in this version, positions contiguous from 0.
6. Every task has 3 localizations with non-empty `title` + `instructions_html`.
7. Every hint carries all three locales, positions contiguous from 0.
8. Every task has **exactly one `mapping_version`** of `task_skill_mappings`
   summing to exactly **10000** basis points, and the skill must be `active` and
   either global or the course's own org.
9. If a task has `task_options` it must also have a `task_assessments` row, with
   3-locale `question_translations`, `single` ⇒ min = max = 1, 3-locale option
   `labels`, a `task_option_answers` row per option, and a correct-answer count
   within [min, max].
10. Version-owned `media_assets` must be `active` and not soft-deleted.

> ⚠️ **There is exactly ONE active skill on this deployment** —
> `risk-based-test-design` (`01980a2a-…0001`, global). Rule 8 is satisfiable but
> offers no real choice, and the task editor's skill dropdown will have a single
> entry until someone seeds more. If `skills` were ever empty, no task could be
> published at all; the editor hides the "add" button in that case rather than
> offering an empty dropdown.

### 6. Deleting a course is not always possible

`delete from courses` where the course owns a **published or archived** content
version raises `55000 published content versions are immutable`. So the course
detail screen offers **archive** (`courses.state = 'archived'`), never a hard
delete. An archived course leaves the public catalog — verified: the catalog
still returns only `practical-software-testing`.

### 7. Smaller things

- `audit_events` cannot be written by the app (RLS, → I-015). The lifecycle RPCs
  write their own rows, so publish/archive/submit/decide **are** audited; plain
  DML from the studio (delete a stage, edit a localization) is not.
- `content_versions.snapshot` is `{}` until publish. `publish_content_version`
  calls `app_private.build_content_snapshot` and writes the whole tree, and
  flips every `draft` stage and task to `active` on the way. **Never
  hand-assemble a snapshot.**
- `get_content_archive_impact` needs `content.publish` scope and returns
  `fingerprint`, `task_count`, `attempt_count`, `open_attempt_count`,
  `submission_count`, `pinned_*_cohort_count`, `task_schedule_count`,
  `snapshot_sha256`, `row_version`. Pass `fingerprint` straight back as
  `p_impact_fingerprint` — that is the "you have seen the impact" interlock, and
  it is a feature, not an obstacle.
- ⚠️ **A stale `p_expected_version` HANGS instead of erroring** (I-007 / I-009)
  and poisons the PostgREST pool for ~30s. Every lifecycle call in `content.ts`
  goes through `guardedLifecycle()`, which re-reads state + `row_version` and
  refuses to fire when the state is already wrong. Do not remove that guard.
- One leftover course, `ws5-probe-lifecycle`, cannot be deleted (its version is
  published-then-archived). It is `state = 'archived'`, out of the catalog, and
  relabelled "WS-5 Testlauf (archiviert)" so the task inventory does not show a
  blank course cell. `scripts/ws5-cleanup-probe.mjs` re-runs the cleanup.
- `submissions` returns **3+ rows to admin** now; WS-0's note recording 0 predates
  WS-2/WS-4's seeding.

---

## Gates

- [x] `npx tsc --noEmit` green (whole tree)
- [x] `npx eslint` green on all WS-5 paths
- [x] `node scripts/smoke.mjs` green — **47/47**
- [x] `node scripts/ws5-routes.mjs` green — **12/12**, no route still a stub
- [x] committed — paths: `src/shared/data/content.ts`, `src/features/content/**`,
      `src/app/[locale]/(admin)/admin/{page,courses,tasks}`, `scripts/ws5-*.mjs`,
      `src/shared/i18n/messages/de.json` (my `admin.*` block only)

Re-run everything:
```bash
NEXT_DIST_DIR=.next-ws5 DITELE_APP_ORIGIN=http://127.0.0.1:3105 npm run dev -- --port 3105
npx tsc --noEmit && npx eslint src/features/content src/shared/data/content.ts
node --env-file=.env.local scripts/ws5-routes.mjs
SMOKE_BASE_URL=http://127.0.0.1:3105 node --env-file=.env.local scripts/smoke.mjs
node --env-file=.env.local scripts/ws5-probe2.mjs   # full lifecycle, self-cleaning
node --env-file=.env.local scripts/ws5-probe5.mjs   # upsert conflict targets
```

---

## Deferred / not yet built

From my own cut list in `02_WORKSTREAMS.md` §8 (all of these were explicitly
last, and everything above them is built):

- **Drag reorder** → shipped as up/down buttons, as the cut list prescribes.
- **Inline preview** of a task as the learner sees it — dropped.
- **Autosave + unsaved-changes guard in the task editor** — dropped. The editor
  saves explicitly with one button; nothing is lost silently, but a browser
  close mid-edit loses the form. This is the biggest remaining gap in the studio.
- **Bulk actions** on stages/tasks — dropped.
- **Media / video / PDF authoring** — dropped, and it is blocked anyway:
  `get_my_learning_task` exposes no `video_url` or `pdf_url` (WS-2's I-010), so
  authoring one would write data nothing can render.
- **`update_task_schedule`** (F43) — the RPC is wrapped nowhere; per-cohort task
  scheduling has no screen. It belongs with cohort management (WS-6) more than
  with content authoring.
- **Pagination is client-side.** `listAdminCourses` and `listAdminTasks` read the
  full table and slice. Correct for 4 courses and 2 tasks; at a few thousand rows
  it needs `.range()` pushed into the query. The `limit`/`offset` arguments are
  already in the signature, so it is a one-function change.

## Still a stub
- None. All six WS-5 routes are real.

## Issues found in someone else's area
- **I-014** — `RPC_CONTRACTS.md` §0.6 is incomplete: the authoring tables *do*
  accept admin DML. Plus `task_kind` is a CHECK constraint and the idempotency
  key has a 16–200 length rule.
- **I-015** — `audit_events` is not insertable by an admin session, so §5.5
  rule 3 cannot be implemented for plain DML.
- **I-021** — `tsc` was red for every workstream because the `trainer` block in
  `de.json` was replaced rather than extended. Reported, not fixed by me; it is
  green again now.
