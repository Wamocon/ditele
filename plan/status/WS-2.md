# WS-2 — Student Core ⭐ the critical path

Started: 2026-07-21 · Port: 3102 · Dist: `.next-ws2` · Account: `learner@ditele.local` / `123123123`

---

## RESUME HERE
Updated: 2026-07-21 · Chat: **#1**

**State:** ALL FIVE ROUTES BUILT AND COMMITTED

> ### For the coordinator, in one paragraph
> **WS-2 is functionally complete.** All five routes render real data, all five
> are committed, and `node scripts/smoke.mjs` shows every student route green.
> The task workspace — the product — is verified end to end: a learner starts an
> attempt, drafts, reloads, and the answer text, the defect report and the
> revealed hint all come back. **The big finding is ISSUES.md I-008: submissions
> were never actually blocked**, which unblocked WS-4's review queue; they have
> already used it to seed five submissions. Nothing is blocking me.

**Done and committed:**

| Commit | What |
|---|---|
| `e146a9c` | `learning.ts` data layer + the `learn` German block |
| `b9e248f` | `/learn/tasks/[taskId]` — the task workspace |
| `fecfaff` | `/learn` — dashboard with the "Weiter lernen" card |
| `9749b53` | `/learn/courses` + `/learn/courses/[courseId]` |
| `978cd9f` | `/learn/tasks` — all tasks, open work first |

**Half-finished:**
- Nothing. Working tree contains only other workstreams' files.

**Next, in order (all optional polish — nothing here is required for P0):**
1. Re-check the workspace at 375/768/1440 in a real browser. Every route was
   verified by fetching rendered HTML as the seeded accounts, and the layout is
   written mobile-first, but **no human has eyeballed it in a viewport.**
   WS-7's responsive sweep is the backstop.
2. Rate-a-task entry point (`rate_task`) from the submitted state — P1, and the
   RPC is in `rpc.ts` already.
3. If WS-5's content studio ever authors a second hint, re-check `HintCascade`
   with more than one — the code already handles it, it has just never run
   against real multi-hint content.

**Things I learned that are written down nowhere else:**

- 🎉 **Submissions work. I-006 was wrong** — ISSUES.md **I-008**.
  `create_external_task_evidence` → take the returned `.id` → pass it as
  `submit_attempt.p_evidence_refs` → the `evidence_required` check passes. No
  upload pipeline, no `finalize_task_evidence_upload_service`.
- ⚠️ **A stale `p_expected_draft_version` HANGS** (I-009) rather than returning a
  conflict; Kong 504s and the PostgREST pool is unusable for ~30s. `useAutosave`
  chains every save and carries the returned `draft_version` forward, so two are
  never in flight. **Treat every `p_expected_*_version` RPC this way.**
- ⭐ **`save_attempt_draft` also bumps the *attempt's* `row_version`**, returning
  it as `attempt_version`. So the value `submit_attempt` needs is the one the
  last save returned, not the one the page was rendered with. Missing this is a
  guaranteed hang on submit.
- ⭐ **`attempts`, `attempt_drafts` and `attempt_hint_usage` ARE directly readable
  by the owning student**, even though `tasks`, `stages` and `task_hints` all
  return 0 rows under the same session. This is the *only* way to get attempt
  state: `get_my_learning_task` does not return it.
- ⭐ **Hint usage is recorded by `save_attempt_draft` via `p_used_hint_ids`** —
  there is no "reveal hint" RPC. That is how WF-2's "recorded before it is
  shown" is satisfied: save first, reveal only on success.
- **`start_attempt` does NOT create the `attempt_drafts` row.** Verified: the row
  is null right after starting, and the first save legitimately sends
  `p_expected_draft_version: 0` and comes back with `draft_version: 1`. Sending
  0 does **not** trigger the I-009 hang.
- **`start_attempt` never creates attempt N+1.** Called on a submitted attempt it
  returns that same attempt with `attempt_state: "submitted"`. A retry only
  becomes possible once a trainer sets `revision_required`.
- **`start_attempt` returns an array** — `[{attempt_id, attempt_state,
  attempt_row_version, replayed, …}]`, not a bare id.
- **No video / PDF / model answer exists in `get_my_learning_task`** (I-010), so
  `VideoPlayer` and `PdfViewer` cannot be wired here at all. The theory path
  renders instructions + the assessment question instead.
- **`hint` is a single object, not an array** (one hint seeded).
  `getMyLearningTask` normalises both shapes to `hints[]`.
- **`lock_reasons` vocabulary is unconfirmed** — the seeded course returns `[]`.
  `stage-list.tsx` matches on a substring so an unseen reason still produces a
  German sentence rather than showing a raw enum to a learner.
- The seeded course has **1 stage / 1 task**, so every list here is short. That
  is content, not a bug.
- **Test accounts that matter for this workstream:**
  `learner5@ditele.local` had no attempt (the not-started branch) and now has a
  draft; `learner6@ditele.local` is enrolled in nothing, which is the only
  genuine empty state available. Both are worth keeping in that condition.

**Blocked on:**
- Nothing.

---

## Routes

All eight per-route checks (MASTER_PLAN §14.2) verified by fetching the rendered
HTML as the seeded accounts. "375px" and "Dark" are marked **▲**: the markup is
mobile-first and uses only `globals.css` tokens with no hardcoded colour, but no
browser viewport has been eyeballed — that is WS-7's sweep.

| Route | Built | Real data | Loading | Empty | Error | 375px | Dark | Keyboard |
|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| `/learn` | ✅ | ✅ | ✅ | ✅ | ✅ | ▲ | ▲ | ✅ |
| `/learn/courses` | ✅ | ✅ | ✅ | ✅ | ✅ | ▲ | ▲ | ✅ |
| `/learn/courses/[courseId]` | ✅ | ✅ | ✅ | ✅ | ✅ | ▲ | ▲ | ✅ |
| `/learn/tasks` | ✅ | ✅ | ✅ | ✅ | ✅ | ▲ | ▲ | ✅ |
| `/learn/tasks/[taskId]` | ✅ | ✅ | ✅ | ✅ | ✅ | ▲ | ▲ | ✅ |

**How each was verified**
- *Real data* — fetched as `learner5@ditele.local` and `learner@ditele.local`,
  asserting the seeded course, stage, task, hint, options and cohort appear.
- *Empty* — `learner6@ditele.local` is enrolled in nothing, so `/learn`,
  `/learn/courses` and `/learn/tasks` render their real empty states, not a
  simulated one.
- *Error* — a well-formed but unknown uuid on both dynamic routes renders
  `ErrorState` ("Etwas ist schiefgelaufen"), not a crash.
- *Keyboard* — every control is a real `<button>`, `<a>`, `<input>`, `<label>`,
  `<summary>` or native `<dialog>`; the confirm dialog uses `showModal()`, so
  focus trapping and ESC are the platform's. The iframe resize handle is a
  focusable `role="separator"` with arrow-key sizing.
- *Preview roles* — trainer and admin can open all five routes without a crash
  (they see empty states, which is what RLS gives them).

### WF-2 acceptance criteria (MASTER_PLAN §12)

| Criterion | Status |
|---|---|
| Draft survives a page reload | ✅ **measured** — started an attempt as `learner5`, saved answer text + defect fields + a hint id, re-fetched the page, all three came back |
| Double-submit blocked | ✅ button disables on submit **and** `p_idempotency_key` is `submit:<attemptId>:<version>` server-side |
| Hint usage recorded before the hint is shown | ✅ the id goes into the save; the text renders only if that save succeeded |
| Locked submission is read-only | ✅ `learner@ditele.local` renders "Abgabe eingereicht" with every control disabled |
| Works on a 375px screen | ▲ built mobile-first (tabs + sticky submit bar), not yet eyeballed in a viewport |

## Data functions added

`src/shared/data/learning.ts` (server-only) — types and pure helpers live in
`src/features/learning/model.ts` and are re-exported, because the workspace is a
Client Component and importing a `server-only` module from it 500s the route.

- `listMyLearningCourses(locale)` → `LearningCourseSummary[]`
- `getMyLearningCourse(courseId, locale)` → stages → activities, position-sorted
- `getMyLearningTask(taskId, locale)` → resolves `{de,en,ru}`, normalises hints
- `getAttemptForTask(taskId)` → newest attempt + draft + used hint ids
- `getTaskWorkspace(taskId, locale)` → the whole route in one call
- `startAttempt`, `saveAttemptDraft`, `submitAttempt` (registers evidence first)
- `isAttemptLocked`, `DefectReportSchema`, `EMPTY_DEFECT`

## Components built in `src/features/learning/`

| File | Note |
|---|---|
| `task-workspace.tsx` | the signature screen |
| `iframe-panel.tsx` | ⭐ **built locally because WS-0's Wave 0b copy had not landed.** 02_WORKSTREAMS §7 says WS-7 promotes it to `shared/ui`. **Do not build a second one.** |
| `confirm-dialog.tsx` | native `<dialog>` fallback for WS-0's unshipped `ConfirmDialog` |
| `defect-form.tsx` | the bug-tracker form + `formatDefectReport` |
| `hint-cascade.tsx` | record-then-reveal |
| `use-autosave.ts` | serialised autosave, the I-009 guard |
| `course-ui.tsx` | `ContinueCard`, `CourseCard`, `ProgressBar`, `ProgressRing`, `StatTile` |
| `stage-list.tsx` | `<details>` accordion + `TaskListItem` |
| `model.ts` · `i18n.ts` · `format.ts` | client-safe model, typed strings, `Intl` helpers |

## Gates
- [x] `npx tsc --noEmit` green **for every WS-2 file**
- [x] `npx eslint` green for every WS-2 path — 0 errors, 0 warnings
- [x] `node scripts/smoke.mjs` — **all 12 student routes 200**
- [x] committed (5 commits, explicit paths only)

> ⚠️ **The repo-wide `tsc` and smoke run are not green, and none of it is WS-2.**
> At the time of writing, `src/app/[locale]/(auth)/_components/login-form.tsx`
> (WS-1) and `src/features/content/model.ts` (WS-5) have type errors, and
> `/de/admin/issues` (WS-6) 500s. All three are mid-flight in other chats. Per
> 02_WORKSTREAMS §11 I did not touch them. Re-check before blaming WS-2.

## Deferred / not yet built
- Theory media (`VideoPlayer`, `PdfViewer`) — **impossible**, no URLs exist in
  the payload (I-010). Not a cut, a missing data source.
- `rate_task` from the submitted state — P1.
- Nothing from the brief's cut list was needed: hint cascade, progress rings,
  the sticky course header and the dashboard stat tiles all shipped.

## Still a stub
- None of WS-2's routes. All five are real pages.

## Issues found in someone else's area
- **I-008** — submissions are not blocked (supersedes I-006). Unblocks WS-4.
- **I-009** — a stale `p_expected_draft_version` hangs rather than erroring.
- **I-010** — no video/PDF/model answer in `get_my_learning_task`; `hint` is singular.

## Notes for WS-7
- Promote `features/learning/iframe-panel.tsx` to `shared/ui` and delete any
  duplicate. Same for `confirm-dialog.tsx` once WS-0's `ConfirmDialog` lands.
- `next dev` rewrote `tsconfig.json` to add `.next-ws2/types/**` — an automatic
  edit, not a WS-2 one, and harmless because WS-0's `.next-*` wildcard already
  covers it. It is deliberately **not** committed here.
