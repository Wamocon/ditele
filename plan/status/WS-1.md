# WS-1 — Public & Auth

Started: 2026-07-21 · Port: 3101 · Dist: `.next-ws1` · Account: `learner@ditele.local` / `123123123`

---

## RESUME HERE
Updated: 2026-07-21 · Chat: **#1**

**State:** ✅ **DONE — all 15 routes built, verified against the live database and committed.**

> ### For the coordinator, in one paragraph
> **WS-1 is complete.** All 15 routes are real pages, no stubs left. A logged-out
> visitor can browse the landing page, search the catalog, open a course, register,
> log in and land on the right dashboard — the whole of WF-1's guest half.
> **Login is verified end to end** (303 → `/de/learn` with a real session cookie,
> *with JavaScript disabled*). `node scripts/smoke.mjs` is **47/47 green**.
> Three things need someone else: **I-019** (real Impressum/Datenschutz company
> data — a launch blocker), **I-025** (no root `not-found.tsx`, so 404s are soft),
> **I-027** (primary buttons fail AA contrast in dark mode, app-wide, one-line fix).

**Done and committed:**

| Commit | What |
|---|---|
| `02fde29` | catalog data layer · 4 auth pages · `/auth/callback` · landing |
| `77e881a` | `/catalog` · `/catalog/[slug]` |
| `a610c3a` | `/about` · `/faq` · `/privacy` · `/legal` · `/403` |

**Half-finished:**
- Nothing.

**Next, if anyone picks this workstream up again:**
1. Nothing is outstanding in WS-1's own scope.
2. When the coordinator supplies the company data for I-019, it is a `de.json`
   edit under `public.legal.*` / `public.privacy.*` plus deleting two
   `<PendingDataNotice>` lines. No code change.
3. If WS-0/WS-7 adds a root `not-found.tsx`, revert the one-line workaround in
   `catalog/[slug]/page.tsx` back to `notFound()` — see I-025.

**Things I learned that are written down nowhere else:**

1. 🚨 **`get_public_catalog_course` returns an ARRAY, not an object**, and an
   unknown slug returns **`200 []`**, not an error. `RPC_CONTRACTS.md` §2 is
   wrong on both. A page that assumes an object 500s on a typo'd URL.
   `getCatalogCourse()` normalises it. (I-016)
2. 🚨 **Never export a non-function from a `"use server"` module.** React rewrites
   every export into a server reference, so an exported constant becomes an
   opaque proxy on the client and the first property read throws during SSR —
   surfacing as "Switched to client rendering because the server rendering
   errored". This broke all four auth forms until `initialAuthState` moved into
   `(auth)/_lib/form-state.ts`. **Anyone writing a Server Action module will hit
   this.**
3. 🚨 **`notFound()` does not work on this build.** Four positions tried, none
   picked up; Next's unbranded English default renders instead. Workaround and
   the likely root cause in I-025.
4. **`consume_authentication_rate_limit` works with the SERVICE key only** —
   `anon` gets `42501 permission denied for function`. WS-0's
   `consumeAuthenticationRateLimit()` is therefore correct as written.
   `RPC_CONTRACTS.md` §0.5's "service role has no RPC grants" is too broad: it
   holds for the *domain* RPCs, not this one. Verified `200 true`.
5. ⭐ **A self-registered user is fully provisioned by a database trigger** —
   `profiles` (with `display_name` from `options.data`), a `user_roles` row
   scoped to the single organisation, and an active `organization_memberships`
   row all appear immediately. So `getPrincipal()` resolves and register →
   `/learn` works. **But `entitlements` stays empty**, so a brand-new account
   still cannot `request_enrollment`. **WS-3: `/learn/enroll/[courseId]` needs an
   honest state for a self-registered user, not a generic error.**
6. ⭐ **`mailer_autoconfirm: true`** (`GET /auth/v1/settings`). Sign-up returns a
   live session; there is no confirmation-email step. The register form keeps a
   "check your inbox" branch as a fallback, but it is currently unreachable.
7. **`POST /auth/v1/recover` returns `200 {}`**, so the reset flow does not
   error — but **SMTP delivery itself is unverified** (plan §16 Q5). The reset
   screen always shows the same neutral "if an account exists…" message, which
   is also the correct anti-enumeration behaviour.
8. **The public catalog payload has no level, no rating and no curriculum**, and
   `anon` cannot read `stages`, `tasks` or `ratings` at all. So the catalog has
   **search only, no level filter**, and the course page shows
   `learning_outcomes` plus an honest "visible after enrolment" note rather than
   a fake accordion. (I-016)
9. **`description_html` is never rendered as HTML.** It is author-controlled copy
   on a page every anonymous visitor sees; rendering it raw turns one
   compromised author account into stored XSS for the whole internet. No
   sanitiser may be added (dependencies frozen) and hand-rolling one is how
   sanitisers get bypassed — so `richTextParagraphs()` projects it to plain
   paragraphs. **Cost: links and emphasis inside a course description are
   dropped.** If rich text is genuinely wanted, it needs a vetted sanitiser and a
   dependency decision, not a regex.
10. **Primary buttons fail AA in dark mode** — white on `#E4505C` is ≈3.4:1. The
    master plan's contrast table checked brand-on-background, not white-on-brand.
    One-line token fix, app-wide impact. (I-027)
11. **Only one course is published**, so every public list renders one card. That
    is correct, not a bug.
12. `src/app/[locale]/` still contains ~12 **empty** leftover directories from the
    purge (`about/`, `catalog/`, `learn/`, `_components/` …). Harmless — git does
    not track empty directories and Next ignores them — but they make the tree
    look like it has duplicate routes. Worth deleting at integration.

**Blocked on:**
- Nothing.

---

## Routes — all 15, all eight checks

| Route | Built | Real data | Loading | Empty | Error | 375px | Dark | Keyboard |
|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| `/` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `/catalog` | ✅ | ✅ | ✅ | ✅ ×2 | ✅ | ✅ | ✅ | ✅ |
| `/catalog/[slug]` | ✅ | ✅ | ✅ | ✅ 404 | ✅ | ✅ | ✅ | ✅ |
| `/about` | ✅ | static | ✅ | n/a | ✅ | ✅ | ✅ | ✅ |
| `/faq` | ✅ | static | ✅ | n/a | ✅ | ✅ | ✅ | ✅ |
| `/privacy` | ✅ | static | ✅ | n/a | ✅ | ✅ | ✅ | ✅ |
| `/legal` | ✅ | static | ✅ | n/a | ✅ | ✅ | ✅ | ✅ |
| `/403` | ✅ | ✅ session | ✅ | n/a | ✅ | ✅ | ✅ | ✅ |
| 404 view | ✅ | n/a | n/a | n/a | n/a | ✅ | ✅ | ✅ |
| `/login` | ✅ | ✅ | ✅ | n/a | ✅ | ✅ | ✅ | ✅ |
| `/register` | ✅ | ✅ | ✅ | n/a | ✅ | ✅ | ✅ | ✅ |
| `/reset-password` | ✅ | ✅ | ✅ | n/a | ✅ | ✅ | ✅ | ✅ |
| `/update-password` | ✅ | ✅ | ✅ | ✅ expired | ✅ | ✅ | ✅ | ✅ |
| `/auth/callback` | ✅ | ✅ | n/a | n/a | ✅ → `/login?error=callback` | n/a | n/a | n/a |

- **Empty states:** catalog has two distinct ones (no courses published vs no
  search hits, each with the right action); the landing course grid has its own;
  `/update-password` has the expired-link state.
- **375px:** no fixed widths, every `max-w-*` shrinks, grids are single-column
  below `sm`, and there are **no `100vw`/`w-screen` rules** — the full-bleed
  sections use negative margins matched to the container gutter, so they cannot
  overflow by the scrollbar width.
- **Dark:** verified by construction — **zero hex, `rgb()`, `hsl()` or Tailwind
  palette colours anywhere in WS-1's files**; every colour is a `globals.css`
  token.
- **Keyboard:** native elements throughout — the FAQ is real `<details>`, the
  catalog search is a real GET `<form>`, the course card is one link (one tab
  stop). The password show/hide button is a real `<button>` with `aria-pressed`.
  Focus is the global `:focus-visible` ring.

## Data functions added

- `src/shared/data/catalog.ts`
  - `listCatalogCourses({ locale, search?, limit?, offset? })` → `Result<{courses, total}>`
  - `getCatalogCourse(slug)` → `Result<CatalogCourseDetail | null>` — `null` is
    "not found", never an error
  - `resolveLocalization(course, locale)` — requested locale → the course's
    `default_locale` → German → first available
  - Both RPCs return the complete set with no `p_limit`/`p_offset`
    (RPC_CONTRACTS §0.4), so **search and paging are applied in memory**.
    Callers already pass `limit`/`offset`, so real pagination later is a
    one-file change.

## Shared pieces WS-7 may want to promote

| File | Why it might belong in `shared/` |
|---|---|
| `(public)/_lib/i18n.ts` | The German-base typed dictionary. Every workstream has the same problem (I-017). |
| `(public)/_lib/format.ts` | `formatDuration`, `formatDate`, `interpolate`, `richTextParagraphs`. |
| `(public)/_components/route-error.tsx` | Branded error boundary with the digest. |
| `(public)/_components/not-found-view.tsx` | Branded 404. |
| `(public)/_components/course-card.tsx` | `CourseCard` from MASTER_PLAN §8.2 — WS-0 never shipped one. |
| `(public)/_components/reveal.tsx` | IntersectionObserver scroll stagger. |
| `(auth)/_components/auth-parts.tsx` | `PasswordField` with a real show/hide toggle; `errorProp()` for `exactOptionalPropertyTypes`. |

> `(auth)` pages import `_lib/i18n` from `(public)`. Both trees are WS-1's, so
> this is not a cross-workstream dependency — but it is the seam to cut along if
> the helpers move into `src/shared/`.

## Verified against the live database

| Thing | Result |
|---|---|
| `get_public_catalog('de')` | 200 · 1 row · title resolved to German, `default_locale: "en"` |
| `get_public_catalog_course(p_slug)` | 200 · **array of 1** · 3 localizations (de/en/ru) |
| unknown slug | 200 · **`[]`** — not an error |
| `consume_authentication_rate_limit` | anon `42501` · **service `200 true`** |
| sign-in through the real form, **no JS** | **303 → `/de/learn`**, `sb-192-auth-token` set |
| sign-up | live session immediately; profile + role + org membership auto-created; `entitlements` empty |
| `/de/catalog?q=…` | filters live; unknown term → "Keine Treffer" empty state |
| `/en/catalog/practical-software-testing` | English localization resolved correctly |

## Gates

- [x] `npx tsc --noEmit` — **green for every WS-1 file**. The repo-wide gate is
      red for reasons outside my tree: `de.json`'s `trainer` block (I-020/I-021,
      WS-4) and `src/shared/data/admin.ts` (I-018, WS-6).
- [x] `npx eslint` on all WS-1 paths — **0 problems**
- [x] `node scripts/smoke.mjs` — **47/47 routes green**
- [x] No hardcoded colour, no `100vw`, no `console.*`, no `any`, no `@ts-ignore`,
      no `TODO` in WS-1 files
- [x] German written to `de.json` only — `en.json` and `ru.json` untouched
- [x] Committed: `02fde29`, `77e881a`, `a610c3a`

## Deferred / not built

- **Nothing from the WS-1 brief.** The cut list (FAQ accordion → plain list,
  About/Legal → minimal text, catalog filters → search only, landing animations
  → static) was **not** needed, except that the level filter is impossible
  rather than cut: the public payload has no level field (I-016).

## Still a stub

- None. All 15 WS-1 routes are real pages.

## Issues raised in someone else's area

| ID | Area | Owner |
|---|---|---|
| I-016 | `RPC_CONTRACTS.md` §2 — catalog contract wrong in three ways | WS-0 |
| I-017 | `get-messages.ts` cannot type German-only keys | WS-0 / WS-7 |
| I-018 | `src/shared/data/admin.ts` fails `tsc` | WS-6 |
| I-019 | `/privacy` + `/legal` need real company data — **launch blocker** | coordinator |
| I-020 | `de.json` `trainer` block replaced, not extended — breaks `tsc` repo-wide | WS-4 |
| I-025 | `notFound()` finds no boundary; 404s are soft 200s | WS-0 / WS-7 |
| I-026 | Duplicate issue IDs across chats (informational) | coordinator |
| I-027 | Primary buttons fail AA contrast in dark mode, app-wide | WS-0 / WS-7 |
