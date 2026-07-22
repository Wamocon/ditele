# WS-D1 — App shell

**Depends on:** WS-D0 merged to `main`. **Branch:** `design/ws-d1`
**Spec:** `plan/design/DESIGN-SYSTEM.md` · **Target:** `plan/design/design-spec.html`

The chrome every role sees on every page. This workstream carries the bugs the user
actually reported.

---

## Owned paths

`src/shared/layout/**` · `src/app/layout.tsx` · `src/app/[locale]/layout.tsx` ·
`src/app/[locale]/_components/**` · nav + account keys in `src/shared/i18n/messages/{de,en}.json`

Do not edit any route group directory. Do not edit `src/shared/ui/**`.

---

## Task 1 — Account menu (the headline)

`app-header.tsx:99-104` renders the avatar as a `<span>` with a `title` attribute. It is not
focusable, not clickable, and has no menu. `signOutAction` exists only on the student profile
page, so **admin and trainer users cannot sign out at all**. That is the bug to fix.

Build `src/shared/layout/account-menu.tsx`:

- Trigger is a `<button>` — avatar circle with initials, plus a chevron that rotates 180° when
  open. `aria-haspopup="menu"`, `aria-expanded` kept in sync.
- Panel uses the native Popover API (`popover="auto"`), which gives top-layer rendering and
  light-dismiss without a click-outside handler. Glass surface. `scale-in` + `fade-in` from a
  top-right transform origin, 200ms, `--ease-out`.
- Contents, in order: display name + email header · **Profil** (role-aware path) ·
  **Einstellungen** (admin only) · theme toggle · language switch de/en ·
  divider · **Abmelden** in danger tint.
- Keyboard: `Esc` closes and returns focus to the trigger. Up/Down move between items.
  `Home`/`End` jump to first/last. Focus trapped while open.
- Sign-out posts to `signOutAction` from `src/shared/auth/actions.ts` (WS-D0 created it).

Working reference implementation is in `design-spec.html` — click the avatar in its header.

---

## Task 2 — Header

The scroll-state logic in `app-header.tsx:26-31` is sound; keep it and build on it.

- Apply the `.glass` class. Today the header hand-rolls
  `backdrop-blur-[12px]` + `bg-[color-mix(...)]`; replace both with the shared recipe so the
  header, menus, and modals stay identical.
- On scroll: border and shadow fade in over `--duration-base`. Currently only the border does.
- Active nav item keeps the red underline, but animate it between items rather than
  hard-cutting. A shared-element transition or a single absolutely-positioned indicator both
  work; pick one and keep it consistent.
- Mount `<ScrollProgress>` directly under the header.
- Header height must survive: `h-[--header-height]` was one of the dead classes, so the
  header has been collapsing to content height. Confirm it is 64px after WS-D0.

---

## Task 3 — i18n the navigation

`nav-config.ts` hardcodes German labels for every item, so `/en` renders German navigation.
`app-header.tsx` also hardcodes `"Anmelden"` and a German `aria-label`.

Change `NavItem.label` to `NavItem.labelKey`, resolved through the existing i18n layer at
render time. Add the keys under a `nav.*` namespace in both message files.

The file header says "Only WS-0 edits it." That freeze is lifted for this task and this task
only — you are changing the label mechanism, not adding or removing routes. Keep every
`path`, `primary`, and `owner` value exactly as it is; `scripts/smoke.mjs` and the 42-route
map read from this file.

`npm run i18n:check` must pass.

---

## Task 4 — Breadcrumbs

The screenshot shows `administration / Group management / Create group` as plain text with no
links. Deep admin routes need real wayfinding.

Build `src/shared/layout/breadcrumbs.tsx`: every segment except the last is a link, the last
carries `aria-current="page"`, labels come from i18n, and the whole thing sits in a
`<nav aria-label>`. Collapse the middle with an overflow menu when it exceeds the container
rather than wrapping to two lines.

---

## Task 5 — Footer, tab bar, page header

- **`app-footer.tsx`** — hierarchy, not a link dump. Group the links, set the legal line apart.
- **`mobile-tab-bar.tsx`** — apply `.glass`. Confirm every target is ≥44px and that
  `env(safe-area-inset-bottom)` still clears on a notched device. Animate the active
  indicator. The "Mehr" sheet gets the glass treatment and a slide-up transition.
- **`page-header.tsx`** — one shape used by every page: breadcrumb, `h1`, optional muted
  subtitle, right-aligned action slot. Make the title dominate; right now nothing does.
- **`app-shell.tsx`** — wrap `<main>` in `<RouteTransition>`. Replace the blanket
  `animate-fade-in-up` on every navigation with the View Transitions cross-fade, so the
  header does not re-animate when only the content changed.

---

## Done when

- Sign-out works from **every** role: student, trainer, admin. Test all three.
- `Esc`, Up/Down, `Home`/`End` all work in the account menu; focus returns to the trigger.
- `/en/admin` shows English navigation.
- Header is 64px, glass, and gains its shadow smoothly on scroll.
- Breadcrumb segments are links.
- Checked in light and dark at 390 / 768 / 1440.
- Reduced motion: nothing moves, menu still opens and closes.
- `npm run verify` green. Before/after screenshots in the PR.
