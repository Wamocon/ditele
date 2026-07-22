# WS-D4 — Trainer (app motion tier)

**Depends on:** WS-D0 merged. **Branch:** `design/ws-d4`
**Spec:** `plan/design/DESIGN-SYSTEM.md` · **Target:** `plan/design/design-spec.html`

A trainer works a queue. Everything here is judged on throughput: how many submissions can
someone review well, in an hour, without losing their place.

---

## Owned paths

`src/app/[locale]/(trainer)/**` · `src/features/review/**` ·
`trainer.*` keys in `src/shared/i18n/messages/{de,en}.json`

Routes: `/trainer`, `/trainer/submissions`, `/trainer/submissions/[submissionId]`,
`/trainer/questions` (+ `/[questionId]`, `/archive`), `/trainer/groups`,
`/trainer/groups/[cohortId]`, `/trainer/progress`, `/trainer/history`, `/trainer/profile`.

**App tier only.** No parallax, no tilt, no magnetic buttons. Nothing over 320ms.

---

## Task 1 — `/trainer` overview

Queue-first. The single most useful fact is "how many submissions are waiting and how long has
the oldest been sitting there". Lead with it.

- KPI tiles use `<CountUp>`, once on first view, `tabular-nums`.
- Age of the oldest pending item gets a severity treatment — a pill or a stripe, not just a
  number — so an overdue queue reads at a glance.
- `<Reveal>` + `<Stagger>` on the tile row, 8px, capped at 240ms.

## Task 2 — Submission review (the core screen)

`/trainer/submissions/[submissionId]` is where trainers spend their day. Design it for a
person doing this forty times in a row.

- Two-pane on desktop: the learner's work on one side, the review form on the other, both
  independently scrollable. Single column on mobile with the form reachable without scrolling
  past the whole submission.
- Keyboard shortcuts for the common verdicts, with a discoverable hint. Do not hide them.
- Draft feedback must survive an accidental navigation. Warn on unsaved changes.
- Submit uses the `Button` `loading` prop and cannot double-fire.
- After a verdict, go straight to the next item in the queue. Do not dump the trainer back to
  a list they have to re-scan.
- Row transitions on the queue use `useOptimistic` so a reviewed item leaves immediately.

## Task 3 — Queues and lists

`/trainer/submissions`, `/trainer/questions`, `/trainer/questions/archive` are all queues.
Give them one shared treatment:

- Sticky table header. `tabular-nums` on every date and count.
- Filters that show their active state clearly, plus a visible reset.
- Empty state for a cleared queue should feel like a win, not like an error.
- Bulk selection with a count and an undo path if it maps to a real bulk action.

`features/review/components/` holds 10 files with 48 dead token references — bring each to the
spec page as you go.

## Task 4 — Groups and progress

- `/trainer/groups/[cohortId]` — roster with per-learner progress. Make a struggling learner
  findable in one scan: sort by risk, not just alphabetically.
- `/trainer/progress` — this is data visualisation. Encode state in form as well as number.
  Use the semantic colours, keep them separate from the brand accent, and never rely on colour
  alone to carry meaning.
- `/trainer/history` — chronological with sticky date headers.

## Task 5 — Profile

`/trainer/profile` currently has no sign-out. After WS-D1 lands, the header menu covers it;
verify sign-out works for the trainer role specifically.

---

## Done when

- `rg -n '\-\[--' "src/app/[locale]/(trainer)" src/features/review` returns nothing.
- A trainer can review a submission and land on the next one without touching the mouse.
- Draft feedback survives an accidental back navigation.
- Every queue has a designed empty, error, and loading-skeleton state.
- Progress views do not rely on colour alone.
- Reduced motion: nothing moves.
- Checked in light and dark at 390 / 768 / 1440.
- `npm run verify` green. Before/after screenshots per route in the PR.
