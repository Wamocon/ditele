# WS-0 — Foundation (Wave 0a + 0b)

Started: 2026-07-21 · Port: 3100 · Dist: `.next-ws0` · Account: see §Credentials below

---

## RESUME HERE
Updated: 2026-07-21 (Task 0 complete) · Chat: #1 for this workstream

**State:** IN PROGRESS

**Done and committed:**
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
1. **Task 1a** — verify Supabase health, then 🚨 **VERIFY THE LOGIN PASSWORD**
   for `learner@ditele.local` / `trainer@ditele.local` / `admin@ditele.local` /
   `org-admin@ditele.local`. Plan says `Ditele-Local-2026!` but it is UNVERIFIED
   and `seed_role_accounts.sql` claims to replace it. If it fails → reset all
   four via the service-role Admin API and record the working password below.
2. **Task 1b** — introspect real RPC signatures → `plan/status/RPC_CONTRACTS.md`.
3. **Task 1c** — count rows in core tables; record what each role can actually
   read through RLS.
4. **Task 1d** — write and run `scripts/seed-mock.mjs` (service-role client).
5. Task 2 purge → Task 3 deps → Task 4 design system → Task 5 shell + 42 stubs
   → Task 6 auth/data layer → Task 7 smoke test → GATE §6.9.

**Things I learned that are written down nowhere else:**
- `plan/` was never committed by whoever authored it. If a future chat cannot
  find a plan document, check `git log -- plan/` before assuming it never existed.

**Blocked on:**
- Nothing.

---

## Credentials (filled in by Task 1)

| Email | Role | Password | Verified? |
|---|---|---|---|
| `admin@ditele.local` | admin | _pending Task 1_ | ⏳ |
| `trainer@ditele.local` | trainer | _pending Task 1_ | ⏳ |
| `learner@ditele.local` | learner → student | _pending Task 1_ | ⏳ |
| `org-admin@ditele.local` | organization_admin → admin | _pending Task 1_ | ⏳ |

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
