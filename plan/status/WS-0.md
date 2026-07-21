# WS-0 — Foundation (Wave 0a + 0b)

Started: 2026-07-21 · Port: 3100 · Dist: `.next-ws0` · Account: see §Credentials below

---

## RESUME HERE
Updated: 2026-07-21 (Task 0 + Task 1a complete) · Chat: #1 for this workstream

**State:** IN PROGRESS

**Done and committed:**
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
1. **Task 1b** — introspect real RPC signatures → `plan/status/RPC_CONTRACTS.md`.
3. **Task 1c** — count rows in core tables; record what each role can actually
   read through RLS.
4. **Task 1d** — write and run `scripts/seed-mock.mjs` (service-role client).
5. Task 2 purge → Task 3 deps → Task 4 design system → Task 5 shell + 42 stubs
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

## Tables with data
_pending Task 1c_

## RLS findings per role
_pending Task 1c_

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
