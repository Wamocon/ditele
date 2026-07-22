# WS-D2 — Public + Auth (showcase motion tier)

**Depends on:** WS-D0 merged. **Branch:** `design/ws-d2`
**Spec:** `plan/design/DESIGN-SYSTEM.md` · **Target:** `plan/design/design-spec.html`

You own the only surfaces on the showcase motion tier. This is where the app is allowed to
be expressive. It is also the first thing a prospective customer sees.

---

## Owned paths

`src/app/[locale]/(public)/**` · `src/app/[locale]/(auth)/**` ·
`src/shared/motion/showcase/**` (you create it) ·
`public.*` and `auth.*` keys in `src/shared/i18n/messages/{de,en}.json`

Routes: landing, `/catalog`, `/catalog/[slug]`, `/about`, `/faq`, `/legal`, `/privacy`,
`/403`, `/login`, `/register`, `/reset-password`, `/update-password`.

---

## Task 1 — Showcase motion primitives

Create `src/shared/motion/showcase/`. These are yours because you are their only consumer.

| Component | Contract |
|---|---|
| `<Tilt>` | Pointer-driven `rotateX/rotateY`, **max 6°**, `perspective` on the parent, `transform` only. Disabled on touch and under reduced motion. |
| `<Magnetic>` | Pointer-follow translate, **max 8px**, rAF-throttled. Hero CTA only. |
| `<Parallax>` | `speed` prop. `transform: translate3d` only — never `top`, never `background-position`. Prefer a native `animation-timeline: scroll()` path with a rAF fallback. |
| `<TextReveal>` | Splits a heading into lines and staggers them. Must keep the full text in the accessibility tree as one string — do not ship per-character spans to a screen reader. |

`~/Downloads/web_animation_reference.html` is your technique reference, but **do not copy its
JS verbatim**: it has no `prefers-reduced-motion` guard anywhere, and it drives layout
properties on scroll in places. Every primitive here calls `useReducedMotion()` (WS-D0 built
it) and returns a static render when it is true.

The cut list is not negotiable: no glitch text, no scramble text, no custom cursor, no
marquee, no loader overlay. Reasons are in `DESIGN-SYSTEM.md` §4.

---

## Task 2 — Landing page

The one page allowed a real hero. It is currently full-bleed via `AppShell bleed`, so the
mechanism already exists.

- Hero: `<TextReveal>` headline, gradient text on the key phrase only, floating background
  shapes on a slow `float` keyframe, `<Magnetic>` primary CTA. One composition that fills the
  first viewport — not a stack of cards.
- Below the fold: `<Reveal>` per section with a `<Stagger>` on any grid. Course cards get
  `<Tilt>`.
- One `<Parallax>` band. One. It is a punctuation mark, not a texture.
- Commit to a single visual anchor. If every section shouts, none is heard.

Guard rail: the hero must be legible and actionable with JavaScript disabled and with reduced
motion on. Test both.

---

## Task 3 — Catalog

`/catalog` is the highest-intent public page — it is where someone decides to enrol.

- `course-card.tsx` gets a real hierarchy: title dominant, then outcome, then metadata.
  `<Tilt>` on hover, desktop only.
- Filter and sort controls that look interactive without needing hover to discover them.
- A designed empty state for "no courses match" with a one-click filter reset.
- `/catalog/[slug]`: the detail page carries the enrolment decision. Lead with what the
  learner will be able to do, not with a metadata table. Sticky enrol CTA on mobile.

---

## Task 4 — Static pages

`/about`, `/faq`, `/legal`, `/privacy`, `/403` all run through `static-page.tsx`.

- Set a reading measure — `.prose-measure` (68ch) already exists in `globals.css` and is
  unused. Use it.
- `/faq` becomes a real disclosure list using `<details>`/`<summary>` with an animated
  chevron, not a wall of text.
- `/403` needs warmth and a way out, not just a status code.

---

## Task 5 — Auth

Four forms: login, register, reset-password, update-password. These are the highest-anxiety
screens in the product — someone is either trying to get in or has already failed once.

- One centred glass card on a quiet ground. Restrained motion: a single `scale-in` on mount.
- Errors sit next to the field they belong to, say what went wrong and how to fix it, and are
  wired with `aria-describedby` + `aria-invalid`. No bare "Invalid credentials".
- Loading state on submit uses the `Button` `loading` prop; the form must not be
  double-submittable.
- Password rules are visible before typing, not revealed by failing.
- `auth-skeleton.tsx` must match the real form's shape so nothing shifts on load.

---

## Done when

- `rg -n '\-\[--' "src/app/[locale]/(public)" "src/app/[locale]/(auth)"` returns nothing.
- The old `(public)/_components/reveal.tsx` is deleted and its imports point at
  `src/shared/motion/reveal.tsx`.
- Landing works with JS disabled and with reduced motion on.
- Every showcase primitive returns a static render under reduced motion — verify each one.
- Lighthouse on the landing page: no CLS regression, no long task over 200ms from motion JS.
- Checked in light and dark at 390 / 768 / 1440.
- `npm run verify` green. Before/after screenshots per route in the PR.
