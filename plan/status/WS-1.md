# WS-1 — Public & Auth

Started: 2026-07-21 · Port: 3101 · Dist: `.next-ws1` · Account: `learner@ditele.local` / `123123123`

---

## RESUME HERE
Updated: 2026-07-21 · Chat: **#1**

**State:** IN PROGRESS

**Done and committed:**
- `src/shared/data/catalog.ts` — `listCatalogCourses`, `getCatalogCourse`, `resolveLocalization`, zod-validated
- `(public)/_lib/i18n.ts` — typed German-base dictionary (see "Things I learned")
- `(public)/_lib/format.ts` — duration / date / plain-text helpers
- `(public)/_components/route-error.tsx` — the shared error boundary
- **`/de/login`** — real, verified end to end (303 → `/de/learn`, session cookie set)
- **`/de/register`** — real
- **`/de/reset-password`** — real
- **`/de/update-password`** — real, incl. the "link expired" state
- **`/auth/callback`** — route handler, code exchange + open-redirect guard

**Half-finished:**
- Nothing.

**Next, in order:**
1. ⭐ Landing `/` — Signature tier
2. `/catalog`
3. `/catalog/[slug]`
4. `/about`, `/faq`, `/privacy`, `/legal`
5. `/403`, `not-found`, `(public)/error.tsx`

**Things I learned that are written down nowhere else:**

1. 🚨 **`get_public_catalog_course` returns an ARRAY, not an object.**
   `RPC_CONTRACTS.md` §2 says "Returns a **single object**". It does not — it
   returns `[{ … }]`, and an unknown slug returns **`200 []`**, not an error.
   Filed as I-008. `getCatalogCourse()` normalises both.
2. 🚨 **Never export a non-function from a `"use server"` module.** React rewrites
   every export into a server reference, so an exported constant becomes an
   opaque proxy on the client and the first property read throws during SSR
   ("Switched to client rendering because the server rendering errored"). This
   broke all four auth forms until `initialAuthState` moved to
   `(auth)/_lib/form-state.ts`. Cost one debugging round.
3. **`consume_authentication_rate_limit` works with the SERVICE key only** —
   `anon` gets `42501 permission denied for function`. So WS-0's
   `consumeAuthenticationRateLimit()` is fine as-is, despite
   `RPC_CONTRACTS.md` §0.5 saying the service role has no RPC grants. That
   statement is too broad: it holds for the *domain* RPCs, not this one.
   Verified 200 `true`.
4. ⭐ **A self-registered user is fully provisioned by a database trigger.**
   Signing up creates the `profiles` row (with `display_name` from
   `options.data`), a `user_roles` row scoped to the single organisation, and an
   active `organization_memberships` row. So `getPrincipal()` resolves
   immediately and register → `/learn` works. **But `entitlements` stays empty**,
   so the new account still cannot `request_enrollment` (I-004/I-005 territory) —
   **WS-3's enrol screen needs an honest state for this.**
5. ⭐ **`mailer_autoconfirm: true`** on this deployment (`GET /auth/v1/settings`).
   Sign-up returns a live session immediately; there is no confirmation email
   step. The "check your inbox" branch in the register form is kept as a
   fallback but is currently unreachable.
6. **`POST /auth/v1/recover` returns `200 {}`** — so the reset flow does not
   error, but **actual SMTP delivery is unverified** (plan §16 Q5). The reset
   screen therefore always shows the same neutral "if an account exists…"
   message, which is also the correct anti-enumeration behaviour.
7. **The public catalog payload has no level, no rating and no curriculum.**
   `get_public_catalog` gives title, summary, `estimated_minutes`,
   `task_count`, `version_number`, `published_at`. `anon` cannot read `stages`,
   `tasks` or `ratings` at all (RPC_CONTRACTS §10). So the catalog has **search
   only, no level filter**, and the course page shows learning outcomes instead
   of a curriculum accordion. Recorded in I-008; not a bug in my code.
8. **Only one course is published**, so every public list renders one card.
   That is correct, not a bug.

**Blocked on:**
- Nothing. `src/shared/data/admin.ts` (WS-6, in flight) currently fails `tsc`
  with 2 errors — logged as I-010. It does not touch my tree.

---

## Routes

| Route | Built | Real data | Loading | Empty | Error | 375px | Dark | Keyboard |
|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| `/login` | ✅ | ✅ | ✅ | n/a | ✅ | ✅ | ✅ | ✅ |
| `/register` | ✅ | ✅ | ✅ | n/a | ✅ | ✅ | ✅ | ✅ |
| `/reset-password` | ✅ | ✅ | ✅ | n/a | ✅ | ✅ | ✅ | ✅ |
| `/update-password` | ✅ | ✅ | ✅ | ✅ expired-link | ✅ | ✅ | ✅ | ✅ |
| `/auth/callback` | ✅ | ✅ | n/a | n/a | ✅ → `/login?error=callback` | n/a | n/a | n/a |
| `/` | ⏳ stub | | | | | | | |
| `/catalog` | ⏳ stub | | | | | | | |
| `/catalog/[slug]` | ⏳ stub | | | | | | | |
| `/about` | ⏳ stub | | | | | | | |
| `/faq` | ⏳ stub | | | | | | | |
| `/privacy` | ⏳ stub | | | | | | | |
| `/legal` | ⏳ stub | | | | | | | |
| `/403` | ⏳ stub | | | | | | | |
| `not-found` | ⏳ missing | | | | | | | |

## Data functions added

- `src/shared/data/catalog.ts` → `listCatalogCourses({locale, search, limit, offset})`,
  `getCatalogCourse(slug)`, `resolveLocalization(course, locale)`
  - Both RPCs return the complete set with no `p_limit`/`p_offset`
    (RPC_CONTRACTS §0.4), so **search and paging are applied in memory** inside
    `listCatalogCourses`. Callers already pass `limit`/`offset`, so real
    pagination later is a one-file change.

## Verified against the live database

| Thing | Result |
|---|---|
| `get_public_catalog('de')` | 200 · 1 row · title resolved to German, `default_locale: "en"` |
| `get_public_catalog_course(p_slug)` | 200 · **array of 1** · 3 localizations (de/en/ru) |
| unknown slug | 200 · **`[]`** — not an error |
| `consume_authentication_rate_limit` | anon `42501` · **service 200 `true`** |
| sign-in through the real form (no JS) | **303 → `/de/learn`**, `sb-192-auth-token` set |
| sign-up | session returned immediately, profile + role + org membership created |

## Gates
- [x] `tsc --noEmit` green **for WS-1 files** (2 pre-existing errors in WS-6's `admin.ts`, see I-010)
- [x] `eslint` green
- [x] `node scripts/smoke.mjs` green
- [x] committed — auth batch

## Deferred / not yet built
- Landing, catalog, course detail, static pages, 403/404 — next up.

## Issues found in someone else's area
- **I-008** `RPC_CONTRACTS.md` §2 — `get_public_catalog_course` returns an array; unknown slug is `200 []`; the payload has no level/rating/curriculum.
- **I-009** `src/shared/i18n/get-messages.ts` types messages from `en.json`, which cannot type German-only keys. WS-1 uses a local German-base dictionary; WS-7 should promote it.
- **I-010** `src/shared/data/admin.ts` (WS-6) fails `tsc` with 2 errors.
- **I-011** `/privacy` and `/legal` need real company data before launch.
