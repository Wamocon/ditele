# DiTeLe — UI Modernisation Plan

Six workstreams. One blocks; five run in parallel after it.

**Read first:** [`DESIGN-SYSTEM.md`](./DESIGN-SYSTEM.md) — the spec.
**Look first:** [`design-spec.html`](./design-spec.html) — open it in a browser. It is the target, live.

---

## Why the app looks the way it does

Two bugs, neither of which produced a warning:

1. **Tailwind v4 changed the CSS-variable shorthand** from `[--x]` to `(--x)`. This codebase
   is on `tailwindcss@4.3.3` and writes the v3 form in **761 places across 104 files**. Every
   one compiles to an invalid declaration the browser discards. No colours, no radii, no
   shadows, no transition durations.
2. **`@theme` declares `--font-heading: var(--font-heading)`**, which wins the cascade over
   next/font's real value and is self-referential, so it resolves to nothing. **Rosario and
   Raleway have never rendered.** Headings fall back to Georgia serif; body to system-ui.

Both are verified by compiling this project's own Tailwind and reading the emitted CSS. Both
are fixed in WS-D0. Details and evidence are in `DESIGN-SYSTEM.md` §0.

Separately: the header avatar is a `<span>`, so **there is no way to sign out from admin or
trainer at all**, and `nav-config.ts` hardcodes German labels so `/en` shows German nav.

---

## ⚠ Another session is editing `globals.css` right now

At the time this plan was written, `git status` showed **uncommitted changes to
`src/app/globals.css`** from a parallel chat fixing I-027 (WCAG AA contrast), plus a new
`scripts/check-contrast.mjs`. That work is good and this plan has already absorbed it — the
new token values are in `DESIGN-SYSTEM.md` §2 and in `design-spec.html`.

**Before starting WS-D0:** commit or stash that work. WS-D0 also owns `globals.css`, so
starting on top of an uncommitted tree will either lose those fixes or produce a confusing
diff. See `WS-D0-foundation.md` Task 2b.

---

## Order

```
        ┌──────────────────────────────────────────┐
        │  WS-D0 — Foundation        BLOCKING      │
        │  codemod · fonts · tokens · glass ·      │
        │  motion primitives · UI primitives       │
        └──────────────────────┬───────────────────┘
                               │ must be merged first
   ┌───────────┬───────────┬───┴───────┬───────────┬───────────┐
   │  WS-D1    │  WS-D2    │  WS-D3    │  WS-D4    │  WS-D5    │
   │  Shell    │ Public+   │ Student   │ Trainer   │  Admin    │
   │           │  Auth     │           │           │           │
   └───────────┴───────────┴───────────┴───────────┴───────────┘
              all five run in parallel, no shared files
```

**WS-D0 must be merged to `main` before any other chat starts.** It rewrites 761 call sites
across every directory. Starting a page workstream first guarantees a conflict on every file
it touches, and worse, that chat will be designing against a renderer that ignores its CSS.

---

## Ownership map

Each workstream owns its paths exclusively. Do not edit outside them.

| WS | Owns | Files | Broken tokens |
|---|---|---|---|
| **D0** | `src/app/globals.css`, `src/shared/ui/**`, `src/shared/motion/**` (new), `src/shared/auth/actions.ts` (new), `eslint.config.mjs`, **plus the repo-wide codemod** | 104 touched | all 761 |
| **D1** | `src/shared/layout/**`, `src/app/layout.tsx`, `src/app/[locale]/layout.tsx`, `src/app/[locale]/_components/**` | 9 | 121 (shared) |
| **D2** | `src/app/[locale]/(public)/**`, `src/app/[locale]/(auth)/**`, `src/shared/motion/showcase/**` (new) | 51 tsx | 103 |
| **D3** | `src/app/[locale]/(student)/**`, `src/features/learning/**`, `src/features/questions/**` | 44 tsx | 198 |
| **D4** | `src/app/[locale]/(trainer)/**`, `src/features/review/**` | 34 tsx | 118 |
| **D5** | `src/app/[locale]/(admin)/**`, `src/features/content/**`, `src/features/admin/**` | 52 tsx | 221 |

**The one shared file:** `src/shared/i18n/messages/{de,en}.json`. Every workstream adds keys.
Each writes only under its own top-level namespace, so conflicts stay trivial. Run
`npm run i18n:check` before pushing.

---

## Branch and merge

```bash
git checkout -b design/ws-d0        # then ws-d1 … ws-d5, each off main after d0 merges
```

Do not rebase a page workstream onto another page workstream. They are independent by design.

---

## Chat prompts

One chat per workstream. Paste the block verbatim as the first message.

### WS-D0 — Foundation (run this one alone, first)

> Read `plan/design/DESIGN-SYSTEM.md` and `plan/design/WS-D0-foundation.md`, then open
> `plan/design/design-spec.html` to see the target. Execute WS-D0 exactly as written.
> You own `src/app/globals.css`, `src/shared/ui/**`, `src/shared/motion/**`,
> `src/shared/auth/actions.ts`, and `eslint.config.mjs`, plus the repo-wide token codemod.
> Do not redesign any page — WS-D1 through WS-D5 do that after you land.
> Finish with `npm run verify` green and before/after screenshots of `/de/admin/courses`
> in light and dark.

### WS-D1 — App shell

> WS-D0 is merged. Read `plan/design/DESIGN-SYSTEM.md` and `plan/design/WS-D1-shell.md`, then
> open `plan/design/design-spec.html`. Execute WS-D1. You own `src/shared/layout/**`,
> `src/app/layout.tsx`, `src/app/[locale]/layout.tsx`, and `src/app/[locale]/_components/**`.
> The headline item is the account menu with a working sign-out for every role — today there
> is no way to log out from admin or trainer. Do not edit any route group directory.

### WS-D2 — Public + auth (showcase motion tier)

> WS-D0 is merged. Read `plan/design/DESIGN-SYSTEM.md` and `plan/design/WS-D2-public-auth.md`,
> then open `plan/design/design-spec.html`. Execute WS-D2. You own
> `src/app/[locale]/(public)/**`, `src/app/[locale]/(auth)/**`, and you create
> `src/shared/motion/showcase/**`. You are the only workstream on the showcase motion tier.
> Use `~/Downloads/web_animation_reference.html` for technique reference, but only the
> techniques the spec marks `showcase` — the cut list is not negotiable, and every effect
> needs a `prefers-reduced-motion` path the reference file does not have.

### WS-D3 — Student

> WS-D0 is merged. Read `plan/design/DESIGN-SYSTEM.md` and `plan/design/WS-D3-student.md`,
> then open `plan/design/design-spec.html`. Execute WS-D3. You own
> `src/app/[locale]/(student)/**`, `src/features/learning/**`, `src/features/questions/**`.
> App motion tier only. Do not edit shared layout or UI primitives.

### WS-D4 — Trainer

> WS-D0 is merged. Read `plan/design/DESIGN-SYSTEM.md` and `plan/design/WS-D4-trainer.md`,
> then open `plan/design/design-spec.html`. Execute WS-D4. You own
> `src/app/[locale]/(trainer)/**` and `src/features/review/**`.
> App motion tier only. Do not edit shared layout or UI primitives.

### WS-D5 — Admin

> WS-D0 is merged. Read `plan/design/DESIGN-SYSTEM.md` and `plan/design/WS-D5-admin.md`,
> then open `plan/design/design-spec.html`. Execute WS-D5. You own
> `src/app/[locale]/(admin)/**`, `src/features/content/**`, `src/features/admin/**`.
> App motion tier only. Do not edit shared layout or UI primitives.

---

## Definition of done, every workstream

1. `rg -n '\-\[--' <owned paths>` returns nothing.
2. No raw hex, `rgb()`, or px radius outside `globals.css`.
3. Every screen checked in **light and dark**, at 390 / 768 / 1440.
4. Every list has a designed empty state, error state, and loading skeleton.
5. Keyboard-only pass on every interactive element.
6. Reduced-motion pass — enable it in devtools, confirm nothing moves.
7. `npm run verify` green.
8. Before/after screenshots per changed route, light and dark.

---

## Out of scope

Tracked, not part of this plan:

- **I-011 — cohorts cannot be created.** The "Groups cannot currently be created" screen is a
  database permission gap, not a UI bug. An untracked migration exists at
  `supabase/migrations/20260721120000_cohort_create_and_audit_write.sql`. Handle it separately.
- The empty leftover route directories under `src/app/[locale]/admin`, `/learn`, `/trainer`,
  `/catalog` and friends. WS-D0 deletes them as housekeeping.

---

## GSTACK REVIEW REPORT

| Run | Status | Findings |
|---|---|---|
| Pre-review system audit | complete | Duplicate admin route trees ruled out (empty leftover dirs). No DESIGN.md; MASTER_PLAN §6 serves that role. Tailwind v4.3.3 / Next 16.2.10 / React 19.2.7. |
| Root-cause verification (compiled probe) | complete | **CONFIRMED** — `-[--x]` emits invalid declarations on tailwindcss@4.3.3. 761 sites, 104 files. Verified by compiling a fixture through the project's own `@tailwindcss/postcss`. |
| Root-cause verification (cascade order) | complete | **CONFIRMED** — `:root{--font-heading:var(--font-heading)}` at byte 15897 beats next/font's class at byte 4717. Rosario and Raleway never render. |
| Design system definition | 8/10 | Tokens, scales, motion vocabulary, reduced-motion guard all present and well judged. |
| Design system delivery | 1/10 | None of it reaches the browser. Fixed by WS-D0. |
| Interaction state coverage | 3/10 | No account menu; no sign-out from admin or trainer; no page transitions; scroll reveal unwired. Fixed by WS-D0 + WS-D1. |
| Glass / depth layer | 0/10 | No glass tokens existed. Added to the spec, built in WS-D0. |
| Empty / error / loading states | 3/10 | `states.tsx` renders bare text. Redesigned in WS-D0, applied per workstream. |
| Information architecture | 6/10 | Nav config is a real single source of truth; breadcrumbs are unlinked text; nav labels bypass i18n. Fixed in WS-D1. |
| AI slop risk | low | Reference-file techniques adjudicated per surface; 5 of 15 cut with stated reasons. Two motion tiers prevent showcase effects leaking into data screens. |
| Accessibility | at risk | Focus ring was brand-coloured (invisible on brand buttons), `fg-subtle` used for content, icon-only controls with hardcoded German labels. Contract written, gated per workstream. |
| Mockup generation | skipped | `design` binary present but no OpenAI key configured. Fell back to a hand-built living HTML spec, which better suits parallel chats since they can copy real CSS from it. |
| Outside voices (Codex) | unavailable | `codex` not on PATH. Single-model review. |
| Concurrent-work check | **flagged** | A parallel session is editing `globals.css` (I-027 contrast) with uncommitted changes. Absorbed into the spec; WS-D0 Task 2b handles the rebase. `node scripts/check-contrast.mjs` → 46 pairs, 0 failing. |

**VERDICT:** Plan written and ready to execute. Six workstream files, one design system spec,
one live visual reference. Two root causes confirmed by compiled evidence rather than
inspection, both fixed in the blocking workstream. Ownership boundaries verified disjoint, so
the five page workstreams can run fully in parallel. `[single-model]` — no cross-model
confirmation was available.

**UNRESOLVED DECISIONS:**

- **I-011 cohort creation.** An untracked migration sits at
  `supabase/migrations/20260721120000_cohort_create_and_audit_write.sql`. It is a database
  permission fix, deliberately out of design scope. Decide separately whether to apply it;
  WS-D5 only redesigns the blocked-state screen it produces.
- **AI mockups.** No OpenAI key is configured, so `design variants` could not run. Add one to
  `~/.gstack/openai.json` if you want generated visual directions alongside the HTML spec.
- **`nav-config.ts` freeze.** Its header reads "Only WS-0 edits it." WS-D1 needs to change
  `label` to `labelKey` to fix i18n. Confirm that lift, or route it through the WS-0 owner.
- **The in-flight contrast session.** Uncommitted changes to `globals.css` were present while
  this plan was written. Commit or stash them before WS-D0 starts, and decide whether that
  session finishes I-027 itself or hands the remainder to WS-D0.

