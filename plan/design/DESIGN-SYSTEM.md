# DiTeLe — Design System v4

**Status:** authoritative. Supersedes MASTER_PLAN §6 where they disagree.
**Audience:** every chat working a `WS-D*` workstream. Read this before touching a file.
**Visual reference:** `plan/design/design-spec.html` — open it in a browser. It is a live,
self-contained render of everything below. When prose and the spec page disagree, the spec page wins.

---

## 0. Two root-cause bugs — read this first

The design system in this repo was well specified and never rendered. Two independent
bugs killed it. Both are fixed in **WS-D0**. Do not work around them; do not add hardcoded
colours to compensate.

### Bug 1 — Tailwind v4 CSS-variable syntax (761 sites, 104 files)

Tailwind v4 changed the arbitrary-CSS-variable shorthand. The v3 form is now parsed as a
literal, producing invalid declarations that browsers silently discard.

```css
/* what `text-[--color-fg-muted]` compiles to on tailwindcss@4.3.3 */
.text-\[--color-fg-muted\] { color: --color-fg-muted; }      /* invalid — discarded */

/* what `text-(--color-fg-muted)` compiles to */
.text-\(--color-fg-muted\) { color: var(--color-fg-muted); } /* correct */
```

Verified by compiling a probe through this project's own `@tailwindcss/postcss@4.3.3`.

Blast radius: 378 `text-`, 151 `bg-`, 105 `rounded-`, 79 `border-`, 18 motion, 11 `shadow-`.
Net effect: no text hierarchy, no surface fills, no radii, no elevation, no transition
durations. Borders survived only by accident, via the global `* { border-color }` rule.

### Bug 2 — circular font custom properties

`globals.css` `@theme` emits `--font-heading: var(--font-heading)` into `:root`. next/font
emits the real value onto a class on the same `<html>` element. Specificity ties at (0,1,0),
`:root` comes later in the bundle, so `:root` wins — and a self-referential custom property
is invalid at computed-value time.

Result: `h1..h6 { font-family: var(--font-heading), Georgia, serif }` falls through to
**Georgia**, and `body` falls through to **system-ui**. Neither Rosario nor Raleway has ever
rendered in this app.

Fix — use `@theme inline`, which inlines at use sites instead of emitting a `:root` declaration:

```css
@theme inline {
  --font-heading: var(--font-heading);
  --font-body:    var(--font-body);
}
```

Also fix the fallback stacks. Rosario and Raleway are both humanist **sans** faces; the
current `Georgia, serif` heading fallback is a category error.

```css
h1, h2, h3, h4, h5, h6 { font-family: var(--font-heading), Candara, "Segoe UI", ui-sans-serif, sans-serif; }
body                   { font-family: var(--font-body),    ui-sans-serif, system-ui, sans-serif; }
```

### The rule going forward

`-(--token)` for every design token. Never `-[--token]`. Never a raw hex outside `globals.css`.
WS-D0 lands an ESLint rule that fails the build on the old form, so this cannot silently return.

---

## 1. Direction

**Layered glass chrome over flat data.**

Anything that *floats* — the header, dropdowns, modals, sheets, toasts, the command palette —
is frosted translucent glass with a hairline top highlight and a soft shadow.

Anything that *holds data* — tables, forms, cards, editors, KPI tiles — is fully opaque with
crisp hairline borders and high text contrast.

Depth comes from the relationship between the two, not from shadows everywhere. Admins read
numbers all day; blur behind a number is a bug, not a style.

**One-line test:** if a user's eye has to rest on it to read a value, it is opaque.

---

## 2. Colour

Unchanged from the existing token set — it is good and it now works. Full swatches in the
spec page. Additions only:

```css
@theme {
  /* Glass — light */
  --glass-bg:        color-mix(in srgb, var(--color-bg) 72%, transparent);
  --glass-border:    color-mix(in srgb, var(--color-fg) 8%, transparent);
  --glass-highlight: color-mix(in srgb, #FFFFFF 65%, transparent);
  --glass-shadow:    0 8px 32px rgb(36 48 54 / 0.10);
  --glass-blur:      16px;
  --glass-saturate:  180%;

  /* Focus ring, split from brand so it stays visible on brand-coloured surfaces */
  --color-focus:     #175EC8;
}

:root[data-theme="dark"] {
  --glass-bg:        color-mix(in srgb, var(--color-bg) 66%, transparent);
  --glass-border:    color-mix(in srgb, #FFFFFF 10%, transparent);
  --glass-highlight: color-mix(in srgb, #FFFFFF 14%, transparent);
  --glass-shadow:    0 8px 32px rgb(0 0 0 / 0.40);
  --color-focus:     #75A8F5;
}
```

### Light mode is the primary theme

It is currently the more broken of the two and gets reviewed first. Every component must be
checked in light mode before dark. Specific light-mode rules:

- Page ground is `--color-bg` (`#FFFFFF`). Cards are also `--color-bg`, separated from the
  page by a `--color-border` hairline, **not** by a fill. Only nested/inset surfaces use
  `--color-surface`.
- Never stack `--color-surface` on `--color-surface`. Nesting goes
  `bg` → `surface` → `surface-2` and stops.
- Muted text is `--color-fg-muted`. `--color-fg-subtle` is for captions, metadata, and
  placeholders — never for primary content.

### In-flight contrast work — do not overwrite it

A parallel session is fixing **I-027** in `globals.css` right now and has already landed:

| Token | Was | Now | Why |
|---|---|---|---|
| `--color-fg-subtle` (light) | `#A7AEB8` | `#68727F` | 2.24:1 on white was a hard AA fail across 25 usages |
| `--color-fg-subtle` (dark) | `#7D8A95` | `#828F9A` | 4.40:1 on `--color-surface` |
| `--color-brand` (dark) | `#E4505C` | `#E85D68` | 4.15:1 on `--color-surface`, and cards are surfaces |
| `--color-brand-active` (dark) | `#D8434F` | `#DE4F5A` | brand-fg on it measured 4.29:1 |
| `--color-brand-fg` (dark) | `#FFFFFF` | `#1A1013` | a filled button renders brand-fg **on** brand; white on red was 3.75:1 |

It also added `scripts/check-contrast.mjs`, which sweeps all 46 token pairs and exits non-zero
below 4.5:1. Currently: **46 checked, 0 failing.**

These values are already reflected in this document and in `design-spec.html`. WS-D0 must
**rebase onto this work, not replace it**, and must re-run `node scripts/check-contrast.mjs`
after any token edit.

---

## 3. Glass recipe

One class, defined once in `globals.css`. Do not hand-roll blur anywhere else.

```css
.glass {
  background: var(--glass-bg);
  backdrop-filter: blur(var(--glass-blur)) saturate(var(--glass-saturate));
  -webkit-backdrop-filter: blur(var(--glass-blur)) saturate(var(--glass-saturate));
  border: 1px solid var(--glass-border);
  box-shadow: var(--glass-shadow), inset 0 1px 0 0 var(--glass-highlight);
}

/* Firefox < 103 and any browser with backdrop-filter disabled get an opaque panel.
   Translucency is decoration; legibility is not. */
@supports not (backdrop-filter: blur(1px)) {
  .glass { background: var(--color-bg); }
}
```

Permitted on: app header, account menu, any dropdown/popover, modal + its backdrop, mobile
tab bar, toasts, mobile "Mehr" sheet, command palette.

Forbidden on: table rows, cards, form fields, KPI tiles, editors, anything containing a
number or an input.

---

## 4. Motion

### Tokens

```css
@theme {
  --duration-fast:   120ms;   /* hover, press, colour                        */
  --duration-base:   200ms;   /* the default for everything                  */
  --duration-slow:   320ms;   /* enter/exit of panels and menus              */
  --duration-slower: 520ms;   /* public-tier scroll choreography only        */

  --ease-out:      cubic-bezier(0.16, 1, 0.3, 1);
  --ease-in-out:   cubic-bezier(0.65, 0, 0.35, 1);
  --ease-emphasis: cubic-bezier(0.2, 0, 0, 1);      /* material-style entry  */
  --ease-spring:   cubic-bezier(0.34, 1.56, 0.64, 1); /* overshoot, sparingly */
}
```

### Two tiers

Same vocabulary, two budgets. A technique allowed in one tier is a bug in the other.

| Tier | Surfaces | Budget |
|---|---|---|
| **Showcase** | `(public)`, `(auth)` — landing, catalog, about, faq, legal, privacy, login | Expressive. Scroll choreography, parallax, tilt, gradient text, magnetic CTA. |
| **App** | `(student)`, `(trainer)`, `(admin)` | Calm and fast. Nothing over 320ms. Nothing that moves under the pointer. |

### The reference file, adjudicated

Every technique in `web_animation_reference.html`, and where it may ship:

| # | Technique | Showcase | App | Note |
|---|---|---|---|---|
| 1 | Scroll reveal (IO) | yes | yes | App tier: 8px travel, 200ms, once only |
| 2 | Stagger grid | yes | yes | App tier: cap total at 240ms |
| 3 | Scroll progress bar | yes | yes | App tier: only on long scrollable docs |
| 4 | Sticky nav elevation | yes | yes | Already partly built in `app-header.tsx` |
| 5 | Parallax | yes | **no** | Ties scroll cost to paint; wrong on a table |
| 6 | 3D tilt cards | yes | **no** | Moves the target under the cursor |
| 7 | Magnetic button | yes | **no** | Same reason; hero CTA only |
| 8 | Floating hero shapes | yes | **no** | Landing hero only |
| 9 | Gradient text | yes | **no** | Hero headline only, never on data |
| 10 | Line-by-line text reveal | yes | **no** | Hero and section intros |
| 11 | Loader overlay | **no** | **no** | Cut. Streaming SSR + skeletons already cover this; an overlay adds latency for nothing |
| 12 | Glitch text | **no** | **no** | Cut. Reads as data corruption |
| 13 | Scramble text | **no** | **no** | Cut. Same |
| 14 | Custom cursor | **no** | **no** | Cut. Breaks touch, breaks a11y, no upside |
| 15 | Marquee | **no** | **no** | Cut. Known a11y failure (WCAG 2.2.2) |

Added, not in the reference, because they earn their place in an app:

| Technique | Tier | Where |
|---|---|---|
| View Transitions on route change | both | Shell-level, cross-fade + shared header |
| Count-up on KPI numbers | app | `/admin` dashboard tiles, once on first view |
| Optimistic row transitions | app | List add/remove via `useOptimistic` + FLIP |
| Skeleton shimmer | both | Already in `globals.css`, wire it into `loading.tsx` |

### Reduced motion is non-negotiable

`globals.css` already has the guard. Extend it: a `@media (prefers-reduced-motion: reduce)`
block must also disable `animation-timeline`, parallax transforms, and tilt. Every JS-driven
motion primitive checks `matchMedia("(prefers-reduced-motion: reduce)").matches` and returns
a static render. The reference file has no such guard — do not copy its JS verbatim.

### Scroll-driven animation: native first, JS fallback

Use CSS scroll-driven animations where supported, IntersectionObserver everywhere else.
Native runs off the main thread and cannot jank.

```css
@supports (animation-timeline: view()) {
  .reveal-native {
    animation: fade-in-up var(--duration-slow) var(--ease-out) both;
    animation-timeline: view();
    animation-range: entry 0% entry 60%;
  }
}
```

**No animation libraries.** No Framer Motion, no GSAP, no Lenis. Everything is CSS plus small
React primitives. The dependency list in MASTER_PLAN §6.1 is frozen; keep it frozen.

---

## 5. Motion primitives (WS-D0 builds these)

All in `src/shared/motion/`. All respect reduced-motion. All are client components with a
server-safe static first render.

| Component | Tier | API |
|---|---|---|
| `<Reveal>` | both | `variant="up" \| "fade" \| "scale"`, `delay`, `once` |
| `<Stagger>` | both | wraps a list, sets `--stagger-i` per child |
| `<ScrollProgress>` | both | fixed 2px bar under the header |
| `<RouteTransition>` | both | View Transitions API wrapper in the shell |
| `<CountUp>` | app | `value`, `duration`; static number under reduced motion |
| `<Tilt>` | showcase | pointer-driven `rotateX/Y`, max 6deg |
| `<Magnetic>` | showcase | pointer-follow translate, max 8px |
| `<Parallax>` | showcase | `speed`; rAF + `transform` only, never `top` |
| `<TextReveal>` | showcase | splits to lines, staggers |

---

## 6. Component contracts

### Account menu — the missing piece

Today `app-header.tsx:99` renders the avatar as a `<span>` with a `title`. There is no menu,
no profile link, and **no way to sign out from admin or trainer at all**. `signOutAction`
exists only on the student profile page.

Required:

- Trigger is a `<button>` with `aria-haspopup="menu"` and `aria-expanded`, avatar plus chevron.
- Panel uses the native Popover API (`popover="auto"`) for top-layer rendering and
  light-dismiss. Glass surface. `scale-in` + `fade-in` from the top-right origin, 200ms.
- Contents: name + email header, **Profil**, **Einstellungen** (admin only), theme toggle,
  language switch (de/en), divider, **Abmelden** in danger tint.
- Keyboard: `Esc` closes and returns focus to the trigger. Up/Down move between items.
  `Home`/`End` jump. Focus is trapped while open.
- `signOutAction` moves to `src/shared/auth/actions.ts` so every role can reach it.
  The student profile page keeps its inline form and imports from the new location.

### Everything else

`Button`, `Card`, `Badge`, `StatusBadge`, `Input`, `Field`, `DataTable`, `States` — the APIs
are fine. WS-D0 fixes their token syntax and adds the states listed in the spec page:
hover, active, focus-visible, disabled, loading, and (for `DataTable`) empty, error,
loading-skeleton, and a sticky header.

### Empty states are features

`States.tsx` currently renders bare text. Every empty state needs an icon or mark, a heading
that says what is missing in the user's words, one sentence of context, and a primary action.
"Keine Einträge gefunden." is not a design.

---

## 7. Accessibility contract

Non-negotiable, checked per workstream:

- Contrast: 4.5:1 body, 3:1 large text and UI boundaries, **in both themes**. Verify by running
  `node scripts/check-contrast.mjs`, not by reading a table. I-027 slipped through precisely
  because the plan's table checked *brand on background* while a filled button renders
  *brand-fg on brand* — the wrong pair. Any new token pair goes into that script.
- Focus-visible on every interactive element. Use `--color-focus`, not `--color-brand`, so the
  ring stays visible on brand-coloured buttons.
- Touch targets ≥ 44px. `Button` size `sm` (36px) is desktop-only; never put it in the tab bar
  or a mobile row.
- Glass panels must pass contrast against their *worst-case* backdrop, not the average one.
- Every icon-only control has an `aria-label`, and that label is translated.
- Keyboard reachability for menu, modal, sheet, table row actions, and pagination.
- `prefers-reduced-motion` honoured by every animation, CSS and JS alike.

---

## 8. i18n

`nav-config.ts` hardcodes German labels for every nav item, so `/en` renders German
navigation. `app-header.tsx` also hardcodes `"Anmelden"` and a German `aria-label`.

Nav items carry a message **key**, not a label. The header resolves keys through the existing
i18n layer. `npm run i18n:check` must pass. This is WS-D1's job.

---

## 9. Definition of done, per workstream

A workstream is done when all of these hold:

1. `rg -n '\-\[--' <owned paths>` returns nothing.
2. No raw hex, `rgb()`, or `px` radius outside `globals.css`.
3. Every screen checked in **light and dark**, at 390px, 768px, and 1440px.
4. Every list has a designed empty state, error state, and loading skeleton.
5. Keyboard-only pass completed on every interactive element.
6. Reduced-motion pass: enable it in devtools, confirm nothing moves.
7. `npm run verify` green (i18n, secrets, typecheck, lint, test, build).
8. Before/after screenshots for each changed route, light and dark.
