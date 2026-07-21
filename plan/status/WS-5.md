# WS-5 — Admin Content

Started: 2026-07-21 · Port: 3105 · Dist: `.next-ws5` · Account: `admin@ditele.local` / `123123123`

---

## RESUME HERE
Updated: 2026-07-21 · Chat: **#1**

**State:** IN PROGRESS

**Done and committed:**
- Nothing yet. Research phase complete — see "Things I learned" below, it is the
  whole reason this workstream is buildable.

**Half-finished:**
- Nothing.

**Next, in order:**
1. `src/shared/data/content.ts` — reads + writes + lifecycle
2. `/admin/courses/[courseId]/versions/[versionId]` — Content Studio
3. `/admin/courses` — course list
4. `/admin/courses/new`
5. `/admin/courses/[courseId]`
6. `/admin` — dashboard
7. `/admin/tasks` — task inventory

**Blocked on:**
- Nothing.

---

## 🔬 Things I learned that are written down nowhere else

Everything below was measured against the live database with
`scripts/ws5-probe.mjs`, `ws5-probe2.mjs` and `ws5-probe3.mjs` (mine, re-runnable).
`RPC_CONTRACTS.md` §0.6 said only `courses`, `course_localizations` and
`content_versions` take a direct insert. **That is incomplete and it matters:**
the whole Content Studio depends on the authoring tables, and they *do* work.

### 1. ⭐ The authoring tables DO accept direct admin DML

| Table | insert | update | delete |
|---|:--:|:--:|:--:|
| `courses` | ✅ | ✅ | ✅ (unless it owns a published/archived version) |
| `course_localizations` | ✅ | ✅ | ✅ |
| `content_versions` | ✅ | ✅ | ✅ while `draft` |
| `stages` · `stage_localizations` | ✅ | ✅ | ✅ |
| `tasks` · `task_localizations` | ✅ | ✅ | ✅ |
| `task_hints` · `task_options` · `task_assessments` · `task_skill_mappings` | ✅ | ✅ | ✅ |
| `audit_events` | ❌ `42501` RLS | — | — |

The policy is `<table>_content_write … has_permission('content.manage', course.organization_id)`
and it is joined **through the task/stage to the course**. So a write to a child
row fails with `42501 new row violates row-level security policy` when the parent
task does not exist yet — which looks exactly like "admin is not allowed" and is
not. **Insert the parent first, in the same request, and re-check before
concluding you are blocked.** That single confusion cost the first probe run.

### 2. 🚨 `tasks.task_kind` is a CHECK constraint, not an enum

`check (task_kind in ('practical', 'knowledge', 'placement'))`
(migration `…091000` line 247). It is **not** in `database.types.ts` as an enum —
the column is typed `string`, so TypeScript will not save you.

UI mapping used throughout WS-5: `knowledge` → **Theorie**, `practical` → **Praxis**,
`placement` → **Einstufung**. `practical` is the one that carries `target_url`.

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
  `content_reviews` row and bumps `row_version`, nothing else. A UI that waits
  for a state change after approval hangs forever. **The signal that a version is
  approved is a `content_reviews` row whose `content_fingerprint` still matches.**
- `p_decision` is `'approved' | 'changes_requested'`. **Not `rejected`.**
  (`decide_enrollment` uses different values — do not copy one call into the other.)
- `publish_content_version` requires state `in_review` **plus** a latest
  `content_reviews` row with `decision = 'approved'` **and** a fingerprint equal to
  the version's current fingerprint. Change any content after approval and the
  fingerprint moves → publish fails with 23514 and you must get it re-approved.
- **Every `row_version` bump means the next call needs the new value.** Always
  re-read `content_versions.row_version` immediately before each lifecycle call.

### 4. 🚨 `p_idempotency_key` must be 16–200 characters

Every content lifecycle RPC validates `length(p_idempotency_key) not between 16 and 200`
and raises `22023` otherwise. A short key like `pub:1` fails with a message that
sounds like a CAS problem. `contentKey()` in `content.ts` guarantees the length.

### 5. ⭐ The publish checklist, extracted from the database

`app_private.assert_content_version_ready` (migration `…099200` line 781 +
`…099600` line 592) is run by **submit**, by **approve**, and again by **publish**.
Every rule below raises `23514`. `content.ts` mirrors them as
`buildReadiness()` so the studio can show what is missing *before* the click:

1. The **course** has all three localizations `en`, `de`, `ru`, each with a
   non-empty `title`, `summary` and `description_html`. ← the most common failure
2. At least one stage owned by this version.
3. Stage `position` values contiguous **from 0** (`min = 0`, `max = count - 1`).
4. Every stage has all three localizations with non-empty `title` + `description_html`.
5. Every stage has ≥ 1 task in this version, with `position` contiguous from 0.
6. Every task has all three localizations with non-empty `title` + `instructions_html`.
7. Every hint carries all three locales in `content_translations`, positions contiguous from 0.
8. Every task has **exactly one `mapping_version`** of `task_skill_mappings`
   whose `weight_basis_points` **sum to exactly 10000**, and the skill must be
   `active` and either global (`organization_id is null`) or the course's own org.
9. If a task has `task_options` it must also have a `task_assessments` row, with
   3-locale `question_translations`, `selection_mode = 'single'` ⇒ min = max = 1,
   3-locale option `labels`, a `task_option_answers` row per option, and a correct-answer
   count within [min, max].
10. Version-owned `media_assets` must be `active` and not soft-deleted.

There is exactly **one** active skill on this deployment
(`risk-based-test-design`, `01980a2a-…-000000000001`, global), so rule 8 is
satisfiable but offers no real choice yet.

### 6. Deleting a course is not always possible

`delete from courses` where the course owns a **published or archived** content
version raises `55000 published content versions are immutable`. The studio never
offers a hard delete for those — it sets `courses.state = 'archived'` instead.

### 7. Small things

- `audit_events` cannot be written from the app (RLS). The lifecycle RPCs write
  their own audit rows, so §5.5 rule 3 is satisfied for every *lifecycle* action;
  plain DML (delete a stage/task) is **not** auditable today → `ISSUES.md` I-008.
- `content_versions.snapshot` is `{}` until publish. `publish_content_version`
  calls `app_private.build_content_snapshot` and writes the whole tree. Never
  hand-assemble a snapshot.
- `get_content_archive_impact` returns `fingerprint`, `task_count`, `attempt_count`,
  `submission_count`, `open_attempt_count`, `pinned_*_cohort_count`,
  `task_schedule_count`, `snapshot_sha256`, `row_version`. Pass `fingerprint`
  straight back as `p_impact_fingerprint`.
- `roles` has 8 rows; `submissions` now returns **3 rows to admin** (WS-0 recorded 0 —
  it changed after WS-0's notes were written).
- One leftover archived probe course (`ws5-probe-lifecycle`) exists because its
  published version cannot be deleted. It is `state = 'archived'`, so it is out of
  the public catalog. Remove-attempt: `node --env-file=.env.local scripts/ws5-cleanup-probe.mjs`.

---

## Routes

| Route | Built | Real data | Loading | Empty | Error | 375px | Dark | Keyboard |
|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| /admin | | | | | | | | |
| /admin/courses | | | | | | | | |
| /admin/courses/new | | | | | | | | |
| /admin/courses/[courseId] | | | | | | | | |
| /admin/courses/[courseId]/versions/[versionId] | | | | | | | | |
| /admin/tasks | | | | | | | | |

## Data functions added
- _pending_

## Gates
- [ ] tsc --noEmit green
- [ ] next lint green
- [ ] node scripts/smoke.mjs green
- [ ] committed

## Deferred / not yet built
- _pending_

## Still a stub
- all six routes

## Issues found in someone else's area
- I-008 — `audit_events` is not insertable by an admin session (also in ISSUES.md)
