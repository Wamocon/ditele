# WS-4 — Trainer

Started: 2026-07-21 · Port: 3104 · Dist: `.next-ws4` · Account: `trainer@ditele.local` / `123123123`

---

## RESUME HERE
Updated: 2026-07-21 · Chat: **#1**

**State:** DONE — all 11 routes built, committed, and rendering real data.

> ### For the coordinator, in one paragraph
> **All 11 WS-4 routes are real pages, not stubs.** Every one renders against the
> live database as `trainer@ditele.local`, and `decide_submission`,
> `claim_question` and `answer_question` were each executed end to end against
> the real backend — a submission actually moved to `accepted` and a question
> went `open → assigned → answered`. Gates: `tsc` green, `eslint` green,
> `smoke.mjs` 47/47. SEC-1 verified.
> **Two findings change other people's work:** rubric scoring is P0, not P1,
> because `decide_submission` refuses `{}` (I-016), and **I-006 was never a
> blocker** — it was a 16-character minimum on `p_idempotency_key` (I-008).

**Done and committed:**
- `src/shared/data/review.ts` — the whole trainer data layer.
- `/trainer` · `/trainer/submissions` · `/trainer/submissions/[submissionId]` ·
  `/trainer/questions` · `/trainer/questions/[questionId]` ·
  `/trainer/questions/archive` · `/trainer/groups` ·
  `/trainer/groups/[cohortId]` · `/trainer/progress` · `/trainer/history` ·
  `/trainer/profile`
- `src/features/review/**` — 13 components, all local fallbacks for Wave 0b
  parts that never landed.
- German into `messages/de.json` under `trainer.*` only. `en.json` / `ru.json`
  untouched.
- **4 real submissions seeded** via `scripts/ws4-seed-submissions.mjs`.

**Half-finished:**
- Nothing. Tree is clean, all gates green.

**Next, in order (for whoever picks this up):**
1. **Nothing is required for P0.** The list below is the honest gap list.
2. Eyeball 375 / 768 / 1440 and dark mode in a real browser — every screen was
   built to the breakpoint rules and verified by rendered HTML, but **nobody has
   looked at it in a browser**. That is WS-7's sweep.
3. If more test data appears: re-check the queue's amber/red age badges (see
   "Known gaps"), and the "question assigned to another trainer" branch, which
   cannot be reached with one trainer in the database.
4. P1 when it comes: rubric *comments* per criterion (`review_rubric_scores.comment`
   exists and is written as `null` today).

**Things I learned that are written down nowhere else:** the whole
"Backend reality" section below. If you touch review code, read it first. The
four that cost the most time to find:
1. `decide_submission` needs a **non-empty array** of rubric scores, not `{}`.
2. `get_submission_review_context` returns **almost nothing** the screen needs.
3. **Every `p_idempotency_key` in this database must be 16–200 characters.**
4. A trainer session reads **0 `enrollments`**.

**Blocked on:**
- Nothing.

---

## Backend reality — measured 2026-07-21, not assumed

### What a trainer session can actually read

`trainer@ditele.local` is an active **trainer** member of the one cohort, which
is what `app_private.is_active_cohort_review_trainer` keys off. Measured row
counts from real sessions:

| Table | trainer | admin | Note |
|---|--:|--:|---|
| `submissions` | 5 | 5 | via `can_access_submission`: cohort trainer **or** `cohort.manage` |
| `submission_versions` | 5 | 5 | the learner's answer lives here, not in the RPC |
| `attempts` | 5 | 5 | only reachable *because* a submission points at them |
| `reviews` | 1 | 1 | one real decision, made through the RPC |
| `questions` | 4 | 4 | ✅ fully buildable |
| `question_messages` | 8+ | 8+ | ✅ |
| `cohorts` | 1 | 1 | ✅ |
| `cohort_memberships` | 6 | 6 | 5 learners + 1 trainer |
| `profiles` | 6 | 10 | learner names resolve |
| `evidence` | ✅ | ✅ | readable for accessible submissions |
| `attempt_hint_usage` · `task_hints` | ✅ | ✅ | "hints used" is real |
| `tasks` `stages` `task_localizations` `content_versions` | ✅ | ✅ | trainers **can** read content tables — students cannot |
| `notifications` | 4 | 0 | recipient-scoped |
| **`enrollments`** | **0** | 7 | ⛔ **I-018** |
| **`submission_transfers`** | **PGRST205** | — | ⛔ **I-019** — not exposed by PostgREST at all |

### `get_submission_review_context` — the REAL shape (closes `RPC_CONTRACTS.md` §12)

§5 marked this UNVERIFIED. It is now verified, and it returns far less than the
master plan implies — **no answer, no evidence, no hints, no timing, no attempt
number, no `row_version`**:

```jsonc
{
  "content_version_id": "01980a22-…",
  "submission_version_id": "019f8408-…",    // ← p_submission_version_id for decide_submission
  "task_title": "Login-Ablauf analysieren", // resolved to p_locale
  "options": [ { "id": "uuid", "labels": { "de": "…", "en": "…", "ru": "…" } } ],
  "rubric": {
    "id": "uuid", "labels": {…}, "version": 1,
    "criteria": [ { "id": "uuid", "code": "risk-coverage", "labels": {…},
                    "position": 0, "max_points": 10,
                    "required_for_acceptance": true, "skill_id": "uuid|null" } ]
  }
}
```

A **non-existent or forbidden id returns `null` with no error.** `getReviewDetail`
turns that into a not-found `Result`, and the page renders `ErrorState` with a
link back to the queue. Verified with an all-zero uuid.

Everything else on the screen comes from tables:

| Screen element | Source |
|---|---|
| answer, chosen options, evidence ids, time taken, hint flag | `submission_versions`, row where `version_number = submissions.latest_version_number` |
| task kind, `target_url`, skill mappings, assessment question | `submission_versions.task_snapshot` — a frozen copy, **no title and no instructions in it** |
| task instructions | `task_localizations.instructions_html` (trainer-readable) |
| evidence title + link | `evidence`, by the ids in `submission_versions.evidence_refs` |
| which hints were opened | `attempt_hint_usage` → `task_hints.content_translations` |
| learner name | `profiles.display_name` |
| attempt number | `attempts.sequence_number` |
| previous decisions | `reviews` (+ `review_rubric_scores` for points) |
| **`p_expected_version`** | **`submissions.row_version`** — not from the RPC |

### `decide_submission` — five rules the contracts file does not have (I-016)

Read from `app_private.decide_submission_effects_unowned`, then confirmed by a
real call:

1. **`p_criterion_scores` must be a NON-EMPTY ARRAY** of
   `{ criterion_id: "<uuid>", points: <number> }`. `{}` always raises `22023`.
   Every criterion with `required_for_acceptance` must be present,
   `points ≤ max_points`, no duplicate ids.
   → **Rubric scoring is P0. The database decides that, not the plan.**
   → `src/shared/data/rpc.ts`'s `decideSubmission` defaults it to `{}` and is
     therefore unusable; `review.ts` calls the RPC directly.
2. **`p_decision` accepts only `accepted` | `revision_required`.** `transferred`
   is rejected outright — transfers go through `transfer_submission`.
3. **`p_comment` is always mandatory.** Blank or whitespace → `22023`.
4. **`p_idempotency_key` must be 16–200 characters** on *every* mutation in this
   database. This is the single most expensive gotcha in the schema (see below).
5. The content version must have an **active rubric**, else
   `22023 no active rubric is assigned to this task content version`.

Plus: the cohort must be `active`, the submission must be `submitted` or
`resubmitted` and target the **latest** version, and a stale `row_version` raises
**`40001`** — which `mapPostgrestError` does not map, so `mapReviewError` in
`review.ts` does. That is how WF-3's "a concurrent decision by two trainers is
detected and reported" is actually satisfied.

`transfer_submission` mirrors it: reason mandatory, key 16–200, target trainer
must be active in the same cohort, `40001` when stale.

### 🔑 I-006 was never real — it was the idempotency key (I-008)

WS-0 concluded submissions could not be seeded because the task has
`evidence_required: true`. Reading `submit_attempt`'s source shows the check is
only *"an `evidence` row owned by this actor for this task exists"* — which
`create_external_task_evidence` produces on its own. **No upload pipeline, no
`finalize_task_evidence_upload_service`.** What actually failed was
`length(p_idempotency_key) between 16 and 200`; a 14-character key raises
`22023 invalid external evidence payload`, which reads like the evidence
pipeline refused. `scripts/ws4-seed-submissions.mjs` seeds four submissions
through the real RPCs and is safe to re-run.

### Verified end to end against the live database

| Command | Result |
|---|---|
| `create_external_task_evidence` → `submit_attempt` ×4 | 4 submissions created |
| `decide_submission(accepted, 8/10 points)` | submission → `accepted`, `row_version` 1→2, a `reviews` row + a `review_rubric_scores` row written |
| `claim_question` | question → `assigned`, `row_version` 1→2 |
| `answer_question` | question → `answered`, `row_version` 2→3 |

---

## Routes

All eleven. "Real data" means the page was rendered through a real trainer
session and the expected strings were asserted in the HTML
(`scripts/ws4-check.mjs`).

| Route | Built | Real data | Loading | Empty | Error | 375px | Dark | Keyboard |
|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| `/trainer` | ✅ | ✅ | ✅ | ✅ | ✅ | ⚠️ | ⚠️ | ✅ |
| `/trainer/submissions` | ✅ | ✅ | ✅ | ✅ | ✅ | ⚠️ | ⚠️ | ✅ |
| `/trainer/submissions/[submissionId]` | ✅ | ✅ | ✅ | n/a | ✅ | ⚠️ | ⚠️ | ✅ |
| `/trainer/questions` | ✅ | ✅ | ✅ | ✅ | ✅ | ⚠️ | ⚠️ | ✅ |
| `/trainer/questions/[questionId]` | ✅ | ✅ | ✅ | n/a | ✅ | ⚠️ | ⚠️ | ✅ |
| `/trainer/questions/archive` | ✅ | ✅ (empty) | ✅ | ✅ | ✅ | ⚠️ | ⚠️ | ✅ |
| `/trainer/groups` | ✅ | ✅ | ✅ | ✅ | ✅ | ⚠️ | ⚠️ | ✅ |
| `/trainer/groups/[cohortId]` | ✅ | ✅ | ✅ | ✅ | ✅ | ⚠️ | ⚠️ | ✅ |
| `/trainer/progress` | ✅ | ✅ | ✅ | ✅ | ✅ | ⚠️ | ⚠️ | ✅ |
| `/trainer/history` | ✅ | ✅ | ✅ | ✅ | ✅ | ⚠️ | ⚠️ | ✅ |
| `/trainer/profile` | ✅ | ✅ | ✅ | n/a | ✅ | ⚠️ | ⚠️ | ✅ |

> ⚠️ **Honest about the last three columns.** Every screen was *built to* the
> rules — only design tokens (no hex anywhere in this tree, verified by grep),
> `DataTable` for every table so it becomes a card list below `md`, `min-h-11`
> on every interactive target, tabs instead of side-by-side below `lg`, focus
> left to the shared components. **But nobody has opened a browser at 375px or
> switched the theme.** Recording that as ⚠️ rather than ✅ is the point of the
> checklist. WS-7's responsive and dark sweeps are the real gate.
>
> Keyboard is ✅ because it is structural and checkable in the markup: the mobile
> tabs implement `role="tablist"` with roving arrow keys / Home / End, the
> confirm dialogs are native `<dialog>` + `showModal()` (focus trap and ESC come
> from the platform), and everything else is native `<a>` / `<button>` / labelled
> form controls.

**Empty states, all real, all reachable:** the queue with a filter that matches
nothing, the questions list, the archive (genuinely empty today), the member
table, the progress table, the history table.

**Error states:** `ErrorState` on every failed `Result`, plus a dedicated
not-found page body for a review, a question and a cohort that the database
refuses — each with a link back to its list.

---

## Data functions added

`src/shared/data/review.ts`:

| Function | Notes |
|---|---|
| `listReviewQueue` | filters (state, cohort, sort) + `limit`/`offset`; returns the cohort list for the filter too |
| `getReviewDetail` | the RPC **plus** five table reads, assembled into one `ReviewDetail` |
| `decideSubmission` | rubric scores as an array; guards blank comment and empty scores before the round trip |
| `transferSubmission` · `listCohortTrainers` | picker excludes the current trainer server-side |
| `listQuestions` · `getQuestionDetail` | unanswered first, then oldest; `canClaim` / `canAnswer` computed server-side |
| `claimQuestion` · `answerQuestion` · `transferQuestion` · `archiveQuestion` | `archiveQuestion` has **no** idempotency key — the one command that does not |
| `listQuestionTrainers` | `list_active_question_trainers` |
| `listCohorts` · `getCohortDetail` · `listMemberProgress` | progress from `cohort_memberships` (I-018) |
| `listReviewHistory` | `reviews` + `review_rubric_scores` points, paginated |
| `getTrainerDashboard` | one call, four numbers, a 5-row preview and the cohorts |
| `getTrainerProfile` · `updateTrainerProfile` | needs `row_version`, so a save refreshes |
| `mapReviewError` | `40001` and the domain texts → readable German |
| `asSubmissionState` · `asQuestionState` | narrow a URL string to the enum, or drop it |

Server Actions in `src/features/review/actions.ts`. **Every one re-checks the
role** — a layout guard does not protect a POST.

## Components built locally (Wave 0b never landed them)

`src/features/review/` — all documented fallbacks per 02_WORKSTREAMS §5.5, and
all candidates for WS-7 to promote or delete:

| File | Replaces | Note for WS-7 |
|---|---|---|
| `confirm-dialog.tsx` | `Dialog` / `ConfirmDialog` | native `<dialog>` + `showModal()` — focus trap, ESC and top layer come free |
| `panel-tabs.tsx` | `Tabs` | tabs below `lg`, plain layout above |
| `stat-tile.tsx` | `StatTile` | links to the work it counts |
| `notice.tsx` | `Toast` | a redirect-and-banner survives a page load; a toast does not |
| `meta-strip.tsx` · `age-badge.tsx` · `queue-filters.tsx` · `question-list.tsx` · `member-table.tsx` · `list-skeleton.tsx` · `decision-panel.tsx` · `question-actions.tsx` · `profile-form.tsx` | — | feature-specific, not shared-UI candidates |
| `i18n.ts` | a shared `t()` | **WS-7: three or four workstreams almost certainly each wrote one of these. Keep one.** |
| `format.ts` | — | dates via `Intl`, German plurals, the 24 h/72 h age rule |

`queue-filters.tsx` is a **plain GET form** — filters live in the URL with no
client JavaScript at all, and it still works with JS off.

## Gates

- [x] `npx tsc --noEmit` green *(for my tree; `src/features/content/model.ts` — WS-5's — had unrelated errors at times)*
- [x] `npx eslint src/features/review "src/app/[locale]/(trainer)" src/shared/data/review.ts` green
- [x] `node scripts/smoke.mjs` green — **47/47**
- [x] SEC-1 — a student on `/trainer/submissions` and on a review detail is 307'd to `/de/403`, both times
- [x] No hardcoded colour anywhere in this tree (grep for hex/rgb/hsl: zero hits)
- [x] No hardcoded UI string — including `<title>`, which goes through `generateMetadata`
- [x] committed — paths: `src/app/[locale]/(trainer)/**`, `src/shared/data/review.ts`, `src/features/review/**`, `src/shared/i18n/messages/de.json` (`trainer.*` only), `scripts/ws4-*.mjs`, `plan/status/WS-4.md`, `plan/status/ISSUES.md`

## Known gaps — be honest about these

- **The age badges cannot be seen in amber or red.** All five submissions were
  created within seconds of each other and I could not backdate `created_at`
  (no write permission from this session). The thresholds are 24 h and 72 h in
  `format.ts:ageTone`; the logic is exercised, the colours are not.
- **"Question assigned to another trainer" is unreachable.** There is exactly one
  trainer in the database, so `canAnswer === false && canClaim === false` — and
  both transfer pickers — render their honest "there is nobody else" state.
  Correct today, untested against a second trainer.
- **Rubric comments are not written.** `review_rubric_scores.comment` exists; the
  panel scores points only. P1.
- **Transfer history is invisible** (I-019) — a transferred submission simply
  leaves the queue.
- **`/trainer/progress` shows cohort members, not enrolments** (I-018), so a
  learner who is approved but not yet assigned to a cohort does not appear.
- **The review detail renders its panels twice in the HTML** — once for the
  mobile tabs, once for the desktop grid, with CSS hiding one. That is the cost
  of doing the responsive switch in CSS from a Server Component. Fine at this
  page size; worth revisiting only if the payload grows.
- `en.json` / `ru.json` untouched, as instructed.

## Issues found in someone else's area

Appended to `ISSUES.md`: **I-016** (`decide_submission` scores must be an array —
`rpc.ts` and `RPC_CONTRACTS.md` §5 are both wrong), **I-017** (real review-context
shape, closes the §12 checkbox), **I-018** (trainer reads 0 enrollments),
**I-019** (`submission_transfers` not exposed), **I-020** (a row was lost from
`ISSUES.md` by a concurrent write; WS-3's I-013 re-appended verbatim).

## How to re-verify any of this

```bash
NEXT_DIST_DIR=.next-ws4 DITELE_APP_ORIGIN=http://127.0.0.1:3104 npm run dev -- --port 3104

# does a route render the data it should? (add expected strings as arguments)
MSYS_NO_PATHCONV=1 node --env-file=.env.local scripts/ws4-check.mjs \
  "/trainer/submissions" "Review-Queue" "Mara Keller"

# what can this role actually read?
node --env-file=.env.local scripts/ws4-probe.mjs
node --env-file=.env.local scripts/ws4-probe2.mjs

# more submissions to review (idempotent, safe to re-run)
node --env-file=.env.local scripts/ws4-seed-submissions.mjs

SMOKE_BASE_URL=http://127.0.0.1:3104 node --env-file=.env.local scripts/smoke.mjs
```

`MSYS_NO_PATHCONV=1` matters in Git Bash on Windows — without it the leading `/`
of the path argument is rewritten to `C:/Program Files/...` and you get a 404
that looks like a routing bug.
