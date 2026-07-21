# WS-0 — Foundation (Wave 0a + 0b)

Started: 2026-07-21 · Port: 3100 · Dist: `.next-ws0` · Account: see §Credentials below

---

## RESUME HERE
Updated: 2026-07-21 (Tasks 0, 1a, 1b, 1c complete) · Chat: #1 for this workstream

**State:** IN PROGRESS

**Done and committed:**
- **Task 1b + 1c — `plan/status/RPC_CONTRACTS.md` written** ✅ 🚨
  48 RPCs + 99 tables introspected from the live DB. Argument names from the
  PostgREST OpenAPI document; return shapes from really calling each RPC as each
  role. RLS measured per role. **Read that file before writing any data code.**
  Probe scripts kept at `scripts/ws0-introspect-rpc.mjs`, `ws0-probe{,2,3}.mjs`.
- **Task 1a — Backend + login VERIFIED** ✅ 🔑
  - Health 200/200. All 4 accounts log in. **Password is `123123123`, not the
    `Ditele-Local-2026!` in the master plan.** Full detail in §Credentials below.
  - No service-role password reset was necessary.
- **Task 0 — Protect the work** ✅
  - `plan/` was **untracked** — the entire build plan existed only on disk, inside
    OneDrive. Committed it (`d6f67bf`) before anything else.
  - `git tag pre-v3-purge` created.
  - `git branch backup/pre-v3-purge` created.
  - OneDrive.exe (PID 25048) **killed**. Sync is stopped.
    ⚠️ Chosen over moving the repo, so **OneDrive will restart on next Windows
    sign-in.** Any future WS-0 chat, and the coordinator, must re-check:
    `Get-Process OneDrive` → if running, `Stop-Process -Name OneDrive -Force`.

**Half-finished:**
- Nothing.

**Next, in order:**
1. **Task 1d** — write and run `scripts/seed-mock.mjs`. ⚠️ **It must authenticate
   as `admin@ditele.local`, NOT use the service-role client** — the service role
   has zero table grants on this deployment (see below). Target the MASTER_PLAN
   §4.5 table: 3 courses, 4 stages each, 8–10 tasks, 2 cohorts, 6–8 learners,
   mixed enrolments, 10–15 submissions, 5–6 questions, notifications, ratings.
2. Task 2 purge → Task 3 deps → Task 4 design system → Task 5 shell + 42 stubs
   → Task 6 auth/data layer → Task 7 smoke test → GATE §6.9.

**Things I learned that are written down nowhere else:**
- `plan/` was never committed by whoever authored it. If a future chat cannot
  find a plan document, check `git log -- plan/` before assuming it never existed.
- **The seed password puzzle is solved.** `supabase/seed.sql` line 2 documents
  `Ditele-Local-2026!` and that is what the master plan copied. But the seed
  files run in the order listed in `package.json`'s `db:reset` script, and
  `seed_role_accounts.sql` is **last** — it re-hashes all four accounts to
  `123123123`. Trust the last seed file, never the first.
- All four accounts show a `last_sign_in_at` of 2026-07-20, so somebody *had*
  logged in before — the credentials were never actually broken, only mis-documented.
- **`supabase.from(t).select("*", { count: "exact", head: true })` silently fails
  against this PostgREST build** — it returns an error object with an `undefined`
  code and an empty message, which is indistinguishable from a network fault.
  Use `.select("*", { count: "exact" }).limit(1)` instead. Cost me one debug cycle.
- **`PGRST202` ("could not find the function in the schema cache") almost never
  means the function is missing.** It means the argument set did not match an
  overload. Check `RPC_CONTRACTS.md` before concluding an RPC does not exist.
- The master plan's claim that "service role sees 99 tables + 48 RPCs" came from
  reading the OpenAPI document, which lists what is *exposed*, not what the
  caller is *permitted* to touch. Those are different questions.

**Blocked on:**
- Nothing.

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

## Gates (§6.9)
- [x] OneDrive paused (process killed — see caveat above)
- [x] `git tag pre-v3-purge` exists
- [ ] 🚨 Login verified for all three accounts — working password recorded here
- [ ] 🚨 `RPC_CONTRACTS.md` written with real, introspected signatures
- [ ] 🚨 Seed data confirmed present
- [ ] RLS findings per role recorded here
- [ ] `npx tsc --noEmit` green
- [ ] `npx next lint` green
- [ ] `npm run build` green
- [ ] `node scripts/smoke.mjs` green — all 42 routes respond
- [ ] All three roles land on their own dashboard after login
- [ ] Header + footer + mobile tab bar correct at 375 / 768 / 1440
- [ ] Dark mode toggles with no flash and no invisible text
- [ ] All 42 stubs exist and are reachable from the nav
- [ ] `WS-0.md` written
- [ ] Committed
