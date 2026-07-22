# WS-D0 — Foundation

**Blocking.** Merge to `main` before any other design workstream starts.
**Branch:** `design/ws-d0`
**Spec:** `plan/design/DESIGN-SYSTEM.md` · **Target:** `plan/design/design-spec.html`

You are not redesigning any page. You are making the existing design system render, then
extending it with glass, motion, and the primitives the page workstreams will consume.

---

## Owned paths

- `src/app/globals.css`
- `src/shared/ui/**`
- `src/shared/motion/**` (new)
- `src/shared/auth/actions.ts` (new)
- `eslint.config.mjs`
- **Plus the repo-wide codemod in task 1**, which is the only time any workstream touches
  files outside its own paths. Land it as its own commit so the diff stays reviewable.

---

## Task 1 — The codemod (761 sites, 104 files)

Tailwind v4 parses `-[--x]` as a literal, emitting `color: --color-fg-muted` instead of
`color: var(--color-fg-muted)`. The browser discards it. Replace every occurrence.

```powershell
Get-ChildItem -Path src -Include *.tsx,*.ts -Recurse | ForEach-Object {
  $p = $_.FullName
  $c = [System.IO.File]::ReadAllText($p)
  $n = [regex]::Replace($c, '-\[(--[A-Za-z0-9-]+)\]', '-($1)')
  if ($n -ne $c) { [System.IO.File]::WriteAllText($p, $n) }
}
```

The pattern is deliberately narrow. It requires `-[--` followed by a token name and `]`, so
it cannot touch `pb-[calc(var(--tabbar-height)+env(safe-area-inset-bottom))]` or any other
arbitrary value that merely contains a variable.

**Verify, do not assume:**

```bash
rg -n '\-\[--' src          # must return nothing
rg -c '\-\(--' src | wc -l  # should be ~104 files
```

Then confirm the emitted CSS is valid — build and grep the bundle for
`color: var(--color-fg-muted)`. If you still see `color: --color-fg-muted`, the codemod
missed a form; find it before continuing.

Commit as: `WS-D0: codemod Tailwind v4 CSS-variable syntax across 761 call sites`

---

## Task 2 — Fix the fonts

`@theme` emits `--font-heading: var(--font-heading)` into `:root`, which beats next/font's
class declaration on the same element and is self-referential, so it resolves to nothing.
Neither Rosario nor Raleway has ever rendered.

In `globals.css`, remove both font lines from the `@theme` block and add a separate
`@theme inline` block. `inline` resolves at use sites instead of emitting a `:root` declaration.

```css
@theme inline {
  --font-heading: var(--font-heading);
  --font-body:    var(--font-body);
}
```

Fix the fallback stacks too. Both faces are humanist **sans**; the current `Georgia, serif`
heading fallback is a category error and is what you are seeing in the app today.

```css
h1, h2, h3, h4, h5, h6 { font-family: var(--font-heading), Candara, "Segoe UI", ui-sans-serif, sans-serif; }
body                   { font-family: var(--font-body),    ui-sans-serif, system-ui, sans-serif; }
```

**Verify:** load any page, inspect an `h1`, and confirm the computed `font-family` resolves
to Rosario. Check that `ä ö ü ß` render — `latin-ext` is already subset in `fonts.ts`.

---

## Task 2b — Rebase onto the in-flight contrast work (do this before Task 3)

`globals.css` has **uncommitted changes from a parallel session** fixing I-027. Check
`git status` before you start. If those changes are still uncommitted, commit or stash them
first — do not overwrite them.

What landed: `--color-fg-subtle` raised in both themes, dark `--color-brand` and
`--color-brand-active` lightened, and dark `--color-brand-fg` set to `#1A1013` because a
filled button renders brand-fg *on* brand, a pair nobody had checked. Full table in
`DESIGN-SYSTEM.md` §2.

It also added `scripts/check-contrast.mjs` — 46 token pairs, exits non-zero below AA.
Currently 0 failing.

Your jobs here:

1. Preserve every one of those values. `design-spec.html` already reflects them.
2. Add the new tokens you introduce (`--color-focus`, and the glass pairs where text sits on
   glass) to `check-contrast.mjs` so they are covered too.
3. Wire it into the gate: add `node scripts/check-contrast.mjs` to the `verify` script in
   `package.json`, before `typecheck`.

Note that dark-mode primary buttons are now **dark ink on red**, not white on red. That is
correct and deliberate. Do not "fix" it back.

---

## Task 3 — Extend the tokens

Add to `globals.css`, per `DESIGN-SYSTEM.md` §2 and §4: the glass token group (light and
dark), `--color-focus`, `--duration-slower`, `--ease-emphasis`, `--ease-spring`.

Add the `.glass` class with its `@supports not (backdrop-filter: ...)` opaque fallback.

Extend the `prefers-reduced-motion` block to also neutralise `animation-timeline`, so native
scroll-driven animations are covered along with the keyframe ones.

Change the focus ring to `--color-focus`. The current ring is `--color-brand`, which is
nearly invisible on a brand-coloured button.

---

## Task 4 — ESLint guard

The old syntax must not silently return. Add a rule to `eslint.config.mjs` that fails on
`-[--` inside a JSX `className` or a `cva`/`cn` string literal.

`no-restricted-syntax` with a `Literal` selector and a regex check is sufficient. Message:

> Tailwind v4 uses `-(--token)`, not `-[--token]`. The square-bracket form compiles to an
> invalid declaration that the browser silently discards. See plan/design/DESIGN-SYSTEM.md §0.

**Verify:** temporarily reintroduce one `text-[--color-fg]` and confirm `npm run lint` fails.

---

## Task 5 — App-tier motion primitives

New directory `src/shared/motion/`. No animation libraries — CSS plus small React components.
The dependency list in MASTER_PLAN §6.1 stays frozen.

Every primitive must render a sensible static version on the server and under reduced motion.

| File | Export | Notes |
|---|---|---|
| `use-reduced-motion.ts` | `useReducedMotion()` | `matchMedia` + `useSyncExternalStore`, mirroring the pattern already used in `theme-toggle.tsx` |
| `reveal.tsx` | `<Reveal>` | `variant="up" \| "fade" \| "scale"`, `delay`, `once`. Native `animation-timeline: view()` behind `@supports`, IntersectionObserver fallback |
| `stagger.tsx` | `<Stagger>` | sets `--stagger-i` per child; total capped at 240ms |
| `scroll-progress.tsx` | `<ScrollProgress>` | 2px bar under the header. Native `scroll()` timeline, rAF fallback |
| `route-transition.tsx` | `<RouteTransition>` | View Transitions API. Verify whether Next 16 needs `experimental.viewTransition` in `next.config.ts`; if it does, enable it and say so in the PR |
| `count-up.tsx` | `<CountUp>` | `value`, `duration`. Runs once on first view. Static number under reduced motion. `toLocaleString(locale)` |

Promote the existing `src/app/[locale]/(public)/_components/reveal.tsx` into
`src/shared/motion/reveal.tsx`. Leave the old file in place — WS-D2 deletes it and repoints
its imports, so you do not touch `(public)`.

Showcase-tier primitives (`Tilt`, `Magnetic`, `Parallax`, `TextReveal`) are **not** yours.
WS-D2 builds them in `src/shared/motion/showcase/`, since it is their only consumer.

---

## Task 6 — Shared sign-out action

`signOutAction` currently lives in `src/app/[locale]/(student)/learn/profile/actions.ts`, so
admin and trainer have no way to sign out at all.

Create `src/shared/auth/actions.ts` exporting `signOutAction`, wrapping the existing
`signOut()` from `src/shared/data/session.ts`. Re-export from the student profile actions file
so that page keeps working unchanged. WS-D1 wires it into the header.

Keep the `"use server"` placement correct — the export bug fixed in commit `d753ce5` is a
reminder that this file layout matters.

---

## Task 7 — UI primitives

For each of `button`, `card`, `badge`, `status-badge`, `input`, `field`, `data-table`,
`states`: the APIs are fine, keep them. Bring each to the spec page.

- **Button** — verify all six variants and four sizes against the spec page. Confirm `sm` is
  documented as desktop-only (36px, under the 44px touch minimum).
- **Card** — light mode uses `bg` with a hairline border, never a `surface` fill. Keep the
  `interactive` hover lift; make sure it is desktop-only.
- **Input / Field** — hover, focus, disabled, invalid, and a hint slot. Focus ring uses
  `--color-focus` with a 3px `color-mix` halo.
- **DataTable** — sticky header, hover row tint, `tabular-nums` on every numeric column, and
  built-in empty / error / loading-skeleton states.
- **States** — this is the real work. Empty states currently render bare text. Give the
  component a mark, a heading, one line of context, and a primary action slot. See the
  spec page §08 for the before and after.

---

## Task 8 — Housekeeping

Delete the empty leftover route directories that shadow the real route groups:
`src/app/[locale]/admin`, `/learn`, `/trainer`, `/catalog`, `/auth`, `/about`, `/faq`,
`/legal`, `/privacy`, `/organization`. Confirm each is empty first, then confirm
`npm run build` still resolves every route.

---

## Done when

- `rg -n '\-\[--' src` returns nothing, and `npm run lint` fails if you reintroduce one.
- An `h1` computes to Rosario; body computes to Raleway.
- `/de/admin/courses` renders with real surfaces, radii, shadows, muted text, and working
  transitions — in light and dark.
- The glass header shows blur and a top highlight, and falls back to opaque with
  `backdrop-filter` disabled.
- Reduced motion enabled: nothing moves anywhere.
- `npm run verify` green.
- Before/after screenshots of `/de/admin/courses`, light and dark, in the PR.
