# WS-4 — Trainer

Started: 2026-07-21 · Port: 3104 · Dist: `.next-ws4` · Account: `trainer@ditele.local` / `123123123`

---

## RESUME HERE
Updated: 2026-07-21 · Chat: **#1**

**State:** IN PROGRESS

**Done and committed:**
- Backend reconnaissance (below). `scripts/ws4-probe.mjs`, `ws4-probe2.mjs`,
  `ws4-seed-submissions.mjs`.
- **4 real submissions seeded** — I-006 was a false blocker (see I-008/I-016…I-020).

**Half-finished:**
- Nothing yet.

**Next, in order:**
1. `src/shared/data/review.ts`
2. `/trainer/submissions/[submissionId]` — Signature tier
3. `/trainer/submissions` — queue
4. `/trainer` — dashboard
5. `/trainer/questions`, `[questionId]`, `archive`
6. `/trainer/groups`, `[cohortId]`
7. `/trainer/progress`
8. `/trainer/history`
9. `/trainer/profile`

**Things I learned that are written down nowhere else:** see §"Backend reality"
below — read it before touching any review code. The four that matter most:
`decide_submission` needs a **non-empty rubric score array**, not `{}`;
`get_submission_review_context` returns **almost nothing** the review screen
needs; a trainer reads **0 enrollments**; and every `p_idempotency_key` in this
database must be **16–200 characters**.

**Blocked on:**
- Nothing.

---

## Backend reality — measured 2026-07-21, not assumed

### What a trainer session can actually read

`trainer@ditele.local` is an **active trainer member of the one cohort**, which is
what `app_private.is_active_cohort_review_trainer` keys off. Row counts from a
real session:

| Table | trainer | admin | Note |
|---|--:|--:|---|
| `submissions` | 5 | 5 | via `can_access_submission` — cohort trainer OR `cohort.manage` |
| `submission_versions` | 5 | 5 | the learner's answer lives here, not in the RPC |
| `attempts` | 5 | 5 | only reachable *because* a submission points at them |
| `reviews` | 0 | 0 | nothing decided yet — history empty state is correct |
| `questions` | 4 | 4 | ✅ fully buildable |
| `question_messages` | 8 | 8 | ✅ |
| `cohorts` | 1 | 1 | ✅ |
| `cohort_memberships` | 6 | 6 | ✅ — 5 learners + 1 trainer |
| `profiles` | 6 | 10 | ✅ learner names resolve |
| `evidence` | ✅ | ✅ | readable for accessible submissions |
| `attempt_hint_usage` | 1 | 1 | ✅ "hints used" is real |
| `task_hints` `tasks` `stages` `task_localizations` | ✅ | ✅ | trainers *can* read content tables — students cannot |
| `notifications` | 4 | 0 | recipient-scoped |
| **`enrollments`** | **0** | 7 | ⛔ **I-018** — progress must come from `cohort_memberships` |
| **`submission_transfers`** | **PGRST205** | — | ⛔ **I-019** — not exposed by PostgREST at all |

### `get_submission_review_context` — the REAL shape (I-017)

`RPC_CONTRACTS.md` §5 marked this UNVERIFIED. It is now verified, and it returns
far less than the master plan implies — **no answer, no evidence, no hints, no
timing, no attempt number, no `row_version`**:

```jsonc
{
  "content_version_id": "01980a22-…",
  "submission_version_id": "019f8408-…",   // ← p_submission_version_id for decide_submission
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

A **non-existent or forbidden submission id returns `null` with no error.** Treat
`null` as not-found and render `ErrorState`; never crash.

Everything else the screen needs comes from tables:

| Screen element | Source |
|---|---|
| learner answer, chosen options, evidence ids, time taken, hint flag | `submission_versions` (row with `version_number = submissions.latest_version_number`) |
| task kind, `target_url`, skill mappings, assessment question | `submission_versions.task_snapshot` — **a frozen copy, no title and no instructions in it** |
| task instructions | `task_localizations` (trainer-readable) |
| evidence title + link | `evidence` by the ids in `submission_versions.evidence_refs` |
| which hints were opened | `attempt_hint_usage` → `task_hints.content_translations` |
| learner name | `profiles.display_name` |
| attempt number | `attempts.sequence_number` |
| previous decisions | `reviews` |
| **`p_expected_version`** | **`submissions.row_version`** — not from the RPC |

### `decide_submission` — five rules the contracts file does not have (I-016)

Read from `app_private.decide_submission_effects_unowned`:

1. **`p_criterion_scores` must be a NON-EMPTY ARRAY** of
   `{ criterion_id: "<uuid>", points: <number> }`. `{}` always fails with
   `22023`. Every criterion with `required_for_acceptance` must be present,
   `points ≤ max_points`, no duplicate ids.
   → **Rubric scoring is P0, not P1. The database decides that, not the plan.**
2. **`p_decision` accepts only `accepted` | `revision_required`.** `transferred`
   is rejected — transfers go through `transfer_submission`.
3. **`p_comment` is always mandatory.** Blank/whitespace → `22023`.
4. **`p_idempotency_key` must be 16–200 characters** on *every* mutation in this
   database. A 14-char key is what made WS-0 believe submissions were unseedable
   (I-006 → I-008). This is the single most expensive gotcha in the schema.
5. The content version must have an **active rubric** or the decision is refused
   outright: `22023 no active rubric is assigned to this task content version`.

Plus: the cohort must be `active`, the submission must be `submitted` or
`resubmitted` and target the **latest** version, and a stale `row_version` raises
**`40001`** — which `mapPostgrestError` does not map, so `review.ts` maps it.

`transfer_submission` mirrors this: reason mandatory, key 16–200, target trainer
must be active in the same cohort, `40001` when stale.

### How the submissions got there

`scripts/ws4-seed-submissions.mjs` — logs in as `learner1..4@ditele.local`, calls
`create_external_task_evidence` then `submit_attempt` with the returned evidence
id. Re-runnable (idempotency keys are fixed). All 5 submissions are `submitted`
on the same task, created within seconds of each other, so **the queue's amber
(>24 h) and red (>72 h) age badges cannot be seen with current data** — I could
not backdate `created_at` (no write permission from this session).

---

## Routes

| Route | Built | Real data | Loading | Empty | Error | 375px | Dark | Keyboard |
|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| /trainer | | | | | | | | |
| /trainer/submissions | | | | | | | | |
| /trainer/submissions/[submissionId] | | | | | | | | |
| /trainer/questions | | | | | | | | |
| /trainer/questions/[questionId] | | | | | | | | |
| /trainer/questions/archive | | | | | | | | |
| /trainer/groups | | | | | | | | |
| /trainer/groups/[cohortId] | | | | | | | | |
| /trainer/progress | | | | | | | | |
| /trainer/history | | | | | | | | |
| /trainer/profile | | | | | | | | |

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
- all 11 routes

## Issues found in someone else's area
- I-016, I-017, I-018, I-019, I-020 (and I-013 re-appended) — see `ISSUES.md`.
