# WS-D3 — Student (app motion tier)

**Depends on:** WS-D0 merged. **Branch:** `design/ws-d3`
**Spec:** `plan/design/DESIGN-SYSTEM.md` · **Target:** `plan/design/design-spec.html`

The learner's daily surface. 198 dead token references live here — the most of any page
workstream — so this is also where the visual payoff is largest.

---

## Owned paths

`src/app/[locale]/(student)/**` · `src/features/learning/**` · `src/features/questions/**` ·
`learn.*` keys in `src/shared/i18n/messages/{de,en}.json`

Routes: `/learn`, `/learn/courses`, `/learn/courses/[courseId]`, `/learn/tasks`,
`/learn/tasks/[taskId]`, `/learn/questions` (+ `/new`, `/[questionId]`), `/learn/enroll`,
`/learn/enroll/[courseId]`, `/learn/history`, `/learn/certificates`, `/learn/notifications`,
`/learn/profile`.

**App tier only.** No parallax, no tilt, no magnetic buttons, no gradient text. Nothing over
320ms. Nothing that moves under the pointer.

---

## Task 1 — `/learn` dashboard

The answer to "what do I do next?" must be readable in three seconds.

- One primary continue-where-you-left-off card that dominates. Everything else is secondary.
- Progress uses the existing `progress-fill` keyframe; percentages in `tabular-nums`.
- `<CountUp>` on any headline number, once on first view.
- `<Reveal>` + `<Stagger>` on the section grid, 8px travel, capped at 240ms total.
- First-time state is a different design from the returning state. A learner with zero
  enrolments should see a path forward, not an empty dashboard.

## Task 2 — Course and task surfaces

- `/learn/courses` — list with real hierarchy and a designed empty state.
- `/learn/courses/[courseId]` — module and stage structure; make current position obvious.
- `/learn/tasks/[taskId]` is the most-used screen in the product. Apply `.prose-measure` to
  the task body. Submission state must be unambiguous: not started, in progress, submitted,
  under review, returned, passed. Six states, six distinct visual treatments — a colour change
  alone is not enough.
- Evidence upload needs progress, retry, and per-file error states.

## Task 3 — Questions

`features/questions/components/` has `checkbox`, `form-status`, `link-button`,
`submit-button` — bring each to the spec page. Q&A threads need clear authorship, timestamps,
and an answered/unanswered distinction that reads at a glance.

## Task 4 — Enrolment, history, certificates, notifications

- `/learn/enroll/[courseId]` — the request form is a conversion point. Show what happens next
  and how long it takes. The existing-request state must be reassuring, not a dead end.
- `/learn/history` — chronological grouping with sticky date headers.
- `/learn/certificates` — a certificate is an achievement. It should feel like one. Empty
  state explains how to earn the first.
- `/learn/notifications` — read/unread must be unmistakable. Bulk mark-as-read. Empty state
  is a good state, so say so warmly.

## Task 5 — Profile

`/learn/profile` keeps its inline sign-out form; WS-D0 moved `signOutAction` to
`src/shared/auth/actions.ts` and re-exported it, so the import path changes but the behaviour
does not. Verify it still works after WS-D1 lands the header menu — both paths must sign out.

---

## Done when

- `rg -n '\-\[--' "src/app/[locale]/(student)" src/features/learning src/features/questions`
  returns nothing.
- Every list route has a designed empty, error, and loading-skeleton state. Skeletons match
  the real content's shape — no layout shift.
- All six task submission states are visually distinct without relying on colour alone.
- Keyboard-only pass across task submission and question posting.
- Reduced motion: nothing moves.
- Checked in light and dark at 390 / 768 / 1440.
- `npm run verify` green. Before/after screenshots per route in the PR.
