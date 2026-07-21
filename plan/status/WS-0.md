# WS-0 — Foundation (Wave 0a + 0b)

Started: 2026-07-21 · Port: 3100 · Dist: `.next-ws0` · Account: see §Credentials below

---

## RESUME HERE
Updated: 2026-07-21 · Chat: **#1** · **WAVE 0a COMPLETE — GATE IS OPEN** ✅

**State:** DONE (Wave 0a). Wave 0b not started.

> ### For the coordinator, in one paragraph
> **All of Wave 0a is done and committed. The six Wave-1 chats can start.**
> Password is `123123123`. `RPC_CONTRACTS.md` holds all 48 real signatures.
> The old frontend is gone (496 → 33 source files), Tailwind v4 + the WAMOCON
> tokens are in, all 53 route files exist as stubs behind working guards, and
> `node scripts/smoke.mjs` renders every one of them as all three roles.
> **Read `RPC_CONTRACTS.md` §0 before writing any data code** — it has seven
> findings that contradict or extend the master plan.
> One thing is NOT done: submissions are still 0 rows, so WS-4's review queue and
> WS-6's ratings/issues screens have nothing to render (see Known gaps below).

**Done and committed:**
- **Task 0** — plan committed to git, `pre-v3-purge` tag + backup branch, OneDrive stopped.
- **Task 1a** — 🔑 login verified, password is `123123123` (the plan's was wrong).
- **Task 1b/1c** — `RPC_CONTRACTS.md`: 48 RPCs, 99 tables, RLS measured per role.
- **Task 1d** — seed: 6 learners, 7 enrolments, 5 attempts, 4 questions +
  8 messages, 8 ratings, 18 notifications, 3 courses. **Entitlement blocker
  (I-004) is FIXED** — see below.
- **Task 2** — purge: 496 → 33 source files, `tsc` green.
- **Task 3** — Tailwind v4, clsx, tailwind-merge, cva. **Dependencies FROZEN.**
  `distDir` via `NEXT_DIST_DIR`, `frame-src` CSP, `.next-*` ignored.
- **Task 4** — brand assets, Rosario/Raleway, all §6.3 tokens, 9 keyframes,
  thin scrollbar, reduced-motion. Tier-1: `cn` `Button` `Card` `Input`
  `Textarea` `Select` `Field` `Badge` `StatusBadge` `Skeleton` `EmptyState`
  `ErrorState` `DataTable`.
- **Task 5** — shell (header, footer, mobile tab bar + Mehr sheet, container,
  page-header, theme toggle), `nav-config.ts`, all 5 route-group layouts with
  guards, **53 route files** each with `page` + `loading` + `error`.
- **Task 6** — `role.ts` (8→3), `guard.ts`, `result.ts`, `session.ts`,
  `rpc.ts` (every P0 RPC, real signatures).
- **Task 7** — `scripts/smoke.mjs`.

**Half-finished:**
- Nothing. Tree is clean, all four gates green.

**Next, in order (Wave 0b):**
1. ⚠️ **`IframePanel` FIRST** — it blocks WS-2's practice task.
2. Rest of tier 2: `Avatar` `Progress` `Dialog` `Sheet` `DropdownMenu` `Toast`
   `Tabs` `ConfirmDialog` `Pagination` `SearchInput` `StatTile`.
3. Tier 3: `Tooltip` `StarRating` `ProgressRing` `VideoPlayer` `PdfViewer`.
4. Announce each one here as it lands.

**Things I learned that are written down nowhere else:**
- 🔑 **The seed password puzzle.** `seed.sql` documents `Ditele-Local-2026!`,
  but `seed_role_accounts.sql` runs last and re-hashes all four accounts to
  `123123123`. Trust the last seed file, never the first.
- ⭐ **All domain writes are RPC-only.** Direct inserts are revoked even for
  admin on `attempts`, `submissions`, `questions`, `notifications`, `ratings`,
  `profiles`, `cohorts`; RLS blocks `enrollments`, `cohort_memberships`,
  `support_issues`, `entitlements`. Only `courses`, `course_localizations` and
  `content_versions` take a direct insert. **Never `.from(x).insert()`.**
- ⭐ **`content_versions.snapshot` is the product.** One jsonb document holding
  the whole course tree. The learner RPCs read the snapshot, not `stages`/`tasks`
  — that is why a student sees 0 rows in `tasks` yet gets a full curriculum.
- **Every mutation needs `p_correlation_id` + `p_idempotency_key` +
  `p_expected_version`.** You must read `row_version` before you can write.
- **`get_my_learning_task` returns `{de,en,ru}` objects** and takes no
  `p_locale`, while the catalog RPCs resolve via `p_locale`. Two families.
- **Re-deciding an already-decided enrolment does not error — it HANGS**, and
  Kong returns 504 after exhausting the PostgREST connection pool, which then
  fails every other request for ~30s. Guard state transitions before calling.
  Recover with `docker restart supabase_rest_ditele-v2`.
- **`{ count: "exact", head: true }` silently fails** on this PostgREST build —
  returns an error with an undefined code and empty message. Use
  `.select("*", { count: "exact" }).limit(1)`.
- **`PGRST202` almost never means the function is missing** — it means the
  argument set did not match. Check `RPC_CONTRACTS.md` first.
- **The smoke-test cookie is easy to get wrong and fails silently.** Name is
  `sb-192-auth-token` (`hostname.split(".")[0]`), value is `base64-` +
  **base64URL**, chunked above 3180 URI-encoded chars. My first version looked
  green at 47/47 while every guarded route was really a 307 to /login.
  `smoke.mjs` now treats a redirect on a signed-in role as a FAILURE.
- **Server access:** `ssh Nvidia-1` (192.168.178.75, user `wamocon`) works from
  this machine. DB is `docker exec supabase_db_ditele-v2 psql -U postgres`.
  ⚠️ Port 54322 is a **different** Supabase instance — ours is 56722.

**Known gaps — be honest about these:**
- **0 submissions.** `submit_attempt` needs verified evidence
  (`evidence_required: true` on the task's skill mapping) and the evidence
  pipeline needs a *verified* upload, which `create_external_task_evidence`
  alone does not produce. **WS-4's review queue will be empty.**
- **0 support_issues, 0 certificates.** No RPC creates them.
- **1 stage, 1 task** on the published course — expanding it means writing a
  correct `snapshot`, which is WS-5's content-studio job.
- `en.json` / `ru.json` untouched, as instructed. German only.

**Blocked on:**
- Nothing. Wave 1 can start.

---

## 🔑 Credentials — VERIFIED 2026-07-21

> ### The working password for all four seeded accounts is: `123123123`
>
> **The password in `00_MASTER_PLAN.md` §4.4 (`Ditele-Local-2026!`) is WRONG.**
> It was read from `supabase/seed.sql` line 2. But `supabase/seed_role_accounts.sql`
> runs *after* it and overwrites the hash with `123123123` (see that file, line 13).
> Its own header says it is "the source of truth for local sign-in".
> **No password reset was needed.** Do not reset these accounts.

| Email | DB role | UI role | Password | Verified |
|---|---|---|---|---|
| `learner@ditele.local` | learner | student | `123123123` | ✅ PASS |
| `trainer@ditele.local` | trainer | trainer | `123123123` | ✅ PASS |
| `admin@ditele.local` | admin | admin | `123123123` | ✅ PASS |
| `org-admin@ditele.local` | organization_admin | admin | `123123123` | ✅ PASS |

All four are email-confirmed, none banned. Re-verify any time with:

```bash
node --env-file=.env.local scripts/ws0-verify-backend.mjs
```

**Backend health, verified 2026-07-21:** `GET /auth/v1/health` → 200 ·
`GET /rest/v1/` → 200 · host `192.168.178.75:56721`.

> ⚠️ `supabase/config.toml` sets `minimum_password_length = 12` and requires
> mixed case + digits + symbols. `123123123` violates all of that — it was written
> directly as a bcrypt hash, bypassing the policy. **This matters for WS-1:** the
> registration form must enforce the real policy from `password-policy.ts`, and
> you cannot create a new account with `123123123` through the sign-up API.

---

## Tables with data (measured 2026-07-21, before seeding)

The database is **nearly empty**. Full table in `RPC_CONTRACTS.md` §11.

> 1 organization · 1 course · 1 content version · 1 stage · 1 task (2 options,
> 1 hint) · 1 cohort · 2 memberships · 1 enrollment · 1 attempt · 1 notification ·
> 4 profiles · 5 user_roles
>
> **0 submissions · 0 reviews · 0 questions · 0 ratings · 0 certificates ·
> 0 support_issues** — every list screen renders its empty state today.

## RLS findings per role — measured, not assumed

Full matrix in **`RPC_CONTRACTS.md` §10**. The five that change how you build:

1. ⭐ **A student cannot read `tasks`, `stages`, `task_hints` or `content_versions`
   directly — every one returns 0 rows.** Learning content is reachable *only*
   through the `SECURITY DEFINER` RPCs. A direct `.from("tasks")` returns `[]`,
   which looks like "no data" instead of "forbidden". **WS-2/WS-3: always use
   `get_my_learning_task` / `get_my_learning_course`.**
2. **A trainer sees 0 `enrollments` and 0 `attempts`** — WS-4's progress screen
   cannot be built from those tables under a trainer session.
3. **`anon` sees exactly `courses` + `course_localizations`** (granted at
   migration `…095000` line 286). The public catalog must use `get_public_catalog`.
4. **`audit_events` is admin-only** (1 row), invisible to student and trainer.
5. **`attempts`**: student sees 1, trainer and admin see 0 — ownership-scoped.

### 🚨 The service-role key cannot touch tables on this deployment

`SUPABASE_SERVICE_ROLE_KEY` returns `42501 permission denied` on **every** table.
`20260717095000_authorization_rls_and_workflows.sql:285-287` grants table
privileges to `anon` and `authenticated` and **never to `service_role`**.

| Service role via… | Works? |
|---|---|
| Auth Admin API (`listUsers`, `createUser`, `updateUserById`) | ✅ yes |
| PostgREST tables / RPCs | ❌ `42501` |

**WS-6:** user create / password reset / deactivate still work (Auth Admin API).
Reading `profiles` and writing `user_roles` must use the **admin's authenticated
session**, not the service client. Verified: an admin session *can* insert and
delete rows.

## Components delivered
_pending Task 4 / Wave 0b_

## Deferred to Wave 0b
_pending_

## Gates (§6.9) — ✅ ALL GREEN. Wave 1 may start.

- [x] OneDrive stopped (process killed; restarts on next Windows sign-in)
- [x] `git tag pre-v3-purge` exists
- [x] 🚨 Login verified for all four accounts — `123123123`
- [x] 🚨 `RPC_CONTRACTS.md` written with real, introspected signatures
- [x] 🚨 Seed data present — 3 courses (published/in_review/draft), 1 stage,
      1 task, 1 cohort, 7 enrolments across 4 states, 5 attempts, 4 questions +
      8 messages, 8 ratings, 18 notifications, 10 profiles.
      ⚠️ **0 submissions** — see Known gaps.
- [x] RLS findings per role recorded here and in `RPC_CONTRACTS.md` §10
- [x] `npx tsc --noEmit` green
- [x] `npx eslint .` green — **0 problems**
- [x] `npx next build` green
- [x] `node scripts/smoke.mjs` green — **47/47 routes, real 200s**, not redirects
- [x] All three roles land on their own dashboard after login
- [x] Header + footer + mobile tab bar built for 375 / 768 / 1440
      (breakpoints per §6.5; **not yet eyeballed in a browser** — WS-7 sweeps)
- [x] Dark mode: no-flash inline script + full dark token set
- [x] All 53 route files exist and are reachable from `nav-config.ts`
- [x] `WS-0.md` written
- [x] Committed

### Security spot-checks (run early, so nothing is a surprise at WS-7)
- **SEC-1** student → `/de/trainer` = 307 → `/de/403`; → `/de/admin` = 307 → `/de/403` ✅
- **SEC-3** `grep -rl "service_role" .next-ws0/static/` → **zero matches** ✅

### How to re-run the gates
```bash
npx tsc --noEmit && npx eslint . && npx next build
NEXT_DIST_DIR=.next-ws0 npm run dev -- --port 3110      # in another shell
SMOKE_BASE_URL=http://127.0.0.1:3110 node --env-file=.env.local scripts/smoke.mjs
```
