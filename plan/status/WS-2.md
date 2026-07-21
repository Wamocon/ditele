# WS-2 — Student Core ⭐ the critical path

Started: 2026-07-21 · Port: 3102 · Dist: `.next-ws2` · Account: `learner@ditele.local` / `123123123`

---

## RESUME HERE
Updated: 2026-07-21 · Chat: **#1**

**State:** IN PROGRESS

**Done and committed:**
- `src/shared/data/learning.ts` — the whole WS-2 data layer, zod-validated,
  every shape measured against the live database (not guessed).
- `src/features/learning/i18n.ts` — typed access to the `learn.*` strings.
- `messages/de.json` — the complete `learn` German block.

**Half-finished:**
- Nothing.

**Next, in order:**
1. `/learn/tasks/[taskId]` — the task workspace. Mobile first, then widen.
2. `/learn` dashboard — the "Weiter lernen" card is the priority.
3. `/learn/courses`
4. `/learn/courses/[courseId]`
5. `/learn/tasks` (the "Aufgaben" tab in `nav-config.ts` — a 5th route beyond
   the brief's four, and it is in my tree, so I own it).

**Things I learned that are written down nowhere else:**

- 🎉 **Submissions work. I-006 was wrong** — see ISSUES.md **I-008**.
  `create_external_task_evidence` → take the returned `.id` → pass it as
  `submit_attempt.p_evidence_refs` → the `evidence_required` check passes and a
  real submission row is created. No upload pipeline needed. **WS-4's review
  queue now has a real row in it.**
- ⚠️ **A stale `p_expected_draft_version` HANGS** (ISSUES.md I-009) — it does not
  return a conflict. Kong 504s and the PostgREST pool is unusable for ~30s. The
  autosave hook serialises saves and always carries forward the `draft_version`
  the previous save returned.
- ⭐ **`attempts`, `attempt_drafts` and `attempt_hint_usage` ARE directly
  readable by the owning student** — even though `tasks`, `stages` and
  `task_hints` all return 0 rows under the same session. This is the only way to
  get attempt state: `get_my_learning_task` does **not** return it.
- ⭐ **Hint usage is recorded by `save_attempt_draft`**, via `p_used_hint_ids` —
  there is no separate "reveal hint" RPC. Passing the id writes the
  `attempt_hint_usage` row, which is how WF-2's "recorded *before* it is shown"
  is satisfied: save first, reveal on success.
- **`start_attempt` never creates attempt N+1.** Called on a submitted attempt it
  returns that same attempt with `attempt_state: "submitted"`. A retry only
  becomes possible once a trainer sets `revision_required`.
- **`start_attempt` returns an array**, `[{attempt_id, attempt_state,
  attempt_row_version, replayed, …}]` — not a bare id.
- **`save_attempt_draft` returns** `{draft_version, attempt_version,
  elapsed_seconds, hint_used, hint_first_used_at, updated_at}`, so autosave never
  needs a follow-up read.
- **No video/PDF/model answer exists in `get_my_learning_task`** (ISSUES.md
  I-010), so `VideoPlayer`/`PdfViewer` cannot be wired on this route. The
  theory path renders instructions + the assessment question instead.
- **`hint` is a single object, not an array** (one hint seeded). `getMyLearningTask`
  normalises both shapes to `hints[]`, so no code change is needed if content
  ever grows a second hint.
- The seeded course has **1 stage / 1 task**, so every list on these screens is
  short. That is content, not a bug.

**Blocked on:**
- Nothing.

---

## Routes

| Route | Built | Real data | Loading | Empty | Error | 375px | Dark | Keyboard |
|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| `/learn` | ⬜ | | | | | | | |
| `/learn/courses` | ⬜ | | | | | | | |
| `/learn/courses/[courseId]` | ⬜ | | | | | | | |
| `/learn/tasks` | ⬜ | | | | | | | |
| `/learn/tasks/[taskId]` | ⬜ | | | | | | | |

## Data functions added

`src/shared/data/learning.ts`
- `listMyLearningCourses(locale)` → `LearningCourseSummary[]`
- `getMyLearningCourse(courseId, locale)` → `LearningCourseDetail` (stages → activities)
- `getMyLearningTask(taskId, locale)` → `LearningTask` (resolves `{de,en,ru}`, normalises hints)
- `getAttemptForTask(taskId)` → newest attempt + its draft + used hint ids
- `getTaskWorkspace(taskId, locale)` → the whole route in one call
- `startAttempt({taskId, enrollmentId})`
- `saveAttemptDraft({…, expectedDraftVersion})` — the autosave call
- `submitAttempt({…, evidence})` — registers external evidence, then submits
- `isAttemptLocked(state)`, `DefectReportSchema`, `EMPTY_DEFECT`

## Gates
- [x] `npx tsc --noEmit` green
- [ ] `npx eslint .` green
- [ ] `node scripts/smoke.mjs` green
- [ ] committed

## Deferred / not yet built
- Theory media (`VideoPlayer`, `PdfViewer`) — no URLs exist in the payload (I-010).

## Still a stub
- All five routes, until the list above fills in.

## Issues found in someone else's area
- I-008, I-009, I-010 — appended to `ISSUES.md`.
