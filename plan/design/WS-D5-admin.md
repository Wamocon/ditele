# WS-D5 — Admin (app motion tier)

**Depends on:** WS-D0 merged. **Branch:** `design/ws-d5`
**Spec:** `plan/design/DESIGN-SYSTEM.md` · **Target:** `plan/design/design-spec.html`

The largest surface: 52 route files, 221 dead token references, 17 routes. The screenshot that
started this review was `/de/admin/groups/new`.

---

## Owned paths

`src/app/[locale]/(admin)/**` · `src/features/content/**` · `src/features/admin/**` ·
`admin.*` keys in `src/shared/i18n/messages/{de,en}.json`

Routes: `/admin`, `/admin/courses` (+ `/new`, `/[courseId]`, `/[courseId]/versions/[versionId]`),
`/admin/users` (+ `/new`, `/[userId]`), `/admin/groups` (+ `/new`, `/[cohortId]`),
`/admin/tasks`, `/admin/applications`, `/admin/issues`, `/admin/ratings`, `/admin/settings`,
`/admin/profile`.

**App tier only.** No parallax, no tilt, no gradient text. Nothing over 320ms. This is the
densest data in the product — glass never goes behind a number or an input.

---

## Task 1 — `/admin` dashboard

Six KPI tiles already exist. Give them a hierarchy: right now they compete and nothing wins.

- Decide which two matter most and make them visually dominant.
- `<CountUp>` on each figure, once on first view, `tabular-nums`.
- Content status and the activity feed need distinct treatments — one is state, one is
  chronology. They should not look like the same component.
- `<Reveal>` + `<Stagger>`, 8px, capped at 240ms.

## Task 2 — The list pattern (courses, users, groups, tasks, applications, issues, ratings)

Seven list routes. Design the pattern once, apply it seven times. `features/content/components/`
already has `list-filters.tsx` and `pager.tsx` — make those the shared implementation.

- `DataTable` with a sticky header, hover row tint, `tabular-nums` on all dates and counts.
- Status as soft-tinted pill badges, never colour-only.
- Filter bar: search with a leading icon, selects, and a visible reset. Active filters must be
  obvious — the current state does not read as filtered.
- Row actions in a glass dropdown, keyboard reachable, with destructive items in danger tint
  and a confirmation step.
- Pagination: `1–20 von 42` on the left, compact prev/next on the right.
- Empty, filtered-to-empty, error, and loading-skeleton states — four distinct designs. A
  filtered-to-empty state offers a filter reset; a truly empty one offers creation.

## Task 3 — Content Studio

`features/content/` holds 116 dead token references across `studio.tsx`, `stage-card.tsx`,
`task-editor.tsx`, `lifecycle-bar.tsx`, `readiness-list.tsx`, `course-form.tsx`,
`course-detail.tsx`. This is the most complex UI in the app and currently the most broken.

- `lifecycle-bar.tsx` is a state machine made visible. Current stage, completed stages, and
  what unlocks the next one must all be legible without a legend.
- `task-editor.tsx` — autosave with a visible saved/saving/failed indicator. Unsaved-changes
  warning on navigate. Never lose an admin's typing.
- Three locale editors on `/admin/courses/[courseId]` need an obvious per-locale completeness
  signal, so a half-translated course cannot ship by accident.
- `readiness-list.tsx` — each unmet item links directly to the thing that fixes it.

## Task 4 — Blocked-state screens

`/admin/groups/new` currently renders a wall of prose explaining a database permission gap,
including an internal issue ID and a file path. That is a developer's note shown to an admin.

Design a proper blocked state: a mark, one plain-English sentence about what is unavailable,
one sentence on what still works, and a way back. Keep the diagnostic detail — issue ID, file
path — behind a collapsed "Details" disclosure for whoever needs it.

The underlying cause (I-011) is a database migration and is **out of scope for this
workstream**. Design the state; do not fix the permission.

## Task 5 — Forms and settings

`/admin/courses/new`, `/admin/users/new`, `/admin/groups/new`, `/admin/settings`,
`/admin/profile`.

- Group fields into labelled sections; do not present one long undifferentiated column.
- Inline validation on blur, not only on submit. Errors wired with `aria-describedby` and
  `aria-invalid`, saying what to do rather than what failed.
- Destructive actions need a confirmation that names the thing being destroyed.
- `/admin/settings` — group by concern, with each setting's effect stated in one line.

---

## Done when

- `rg -n '\-\[--' "src/app/[locale]/(admin)" src/features/content src/features/admin`
  returns nothing.
- All seven list routes share one visual pattern.
- Every list has four distinct states: empty, filtered-to-empty, error, loading.
- `/admin/groups/new` reads as a product state, not a stack trace.
- The task editor never loses typed content.
- No glass behind any table, form field, or KPI figure.
- Reduced motion: nothing moves.
- Checked in light and dark at 390 / 768 / 1440.
- `npm run verify` green. Before/after screenshots per route in the PR.
