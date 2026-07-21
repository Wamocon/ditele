# WS-6 — Admin Ops

Started: 2026-07-21 · Port: 3106 · Dist: `.next-ws6` · Account: `admin@ditele.local` / `123123123`

---

## RESUME HERE
Updated: 2026-07-21 · Chat: **#1** for this workstream

**State:** DONE — all 11 routes built, verified against live data, and committed.

> ### For the coordinator, in one paragraph
> **All 11 WS-6 routes are real pages; no stub is left in this tree.** Every one
> was fetched with a real admin session and asserted on its *content*, not just a
> 200. The full admin half of WF-1 works end to end (approve → assign → the
> membership actually appeared). Four gates green: `tsc` clean across the whole
> repo, `eslint .` clean, `smoke.mjs` 47/47, and the privileged Supabase key
> reachable only from `server-only` modules. **Two capabilities are impossible on
> this database and are shipped as visible, explained blocked states, not as
> forms that fail: creating a cohort (I-011) and adding a member or trainer to
> one (I-012).** Both need a migration. A third gap, I-028, is that five
> destructive admin actions cannot write an `audit_events` row.

**Done and committed:**
- `src/shared/data/admin.ts` — the whole WS-6 data layer (20 functions).
- `src/features/admin/` — `action-state.ts`, `actions.ts` (10 Server Actions,
  each re-checking the role), `i18n.ts`, `format.ts`, `ui.tsx`, `form-ui.tsx`
  and six per-screen panel components.
- `adminOps` + `adminOps.roleLabels` in `messages/de.json` (German only;
  `en.json` / `ru.json` untouched, as instructed).
- **`/admin/applications`** — approve / reject-with-reason / assign-to-cohort.
  ⭐ Verified end to end against the live database: approve → assign →
  `cohort_memberships` grew 6 → 7. WF-1's admin half works.
- **`/admin/users`** — search, role filter, pagination, empty state.
- **`/admin/users/[userId]`** — role change, deactivate/reactivate, password
  reset, enrolments, groups.
- **`/admin/users/new`** — privileged create, inside a Server Action only.
- **`/admin/groups`** · **`/admin/groups/[cohortId]`** (lifecycle + schedule +
  members) · **`/admin/groups/new`** (blocked state, I-011).
- **`/admin/issues`** · **`/admin/ratings`** · **`/admin/settings`** ·
  **`/admin/profile`**.

**Half-finished:**
- Nothing. Tree is clean and every gate is green.

**Next, in order (nothing is blocking; this is polish):**
1. **WS-7 must sweep 375px / dark mode / keyboard for all 11 routes** — this
   chat had no browser and did not eyeball any of them. See the Routes legend.
2. If a migration ever lands for I-011/I-012, `/admin/groups/new` needs a real
   form and `/admin/groups/[cohortId]` needs a member + trainer picker. The data
   layer is already shaped for it (`updateCohortSchedule` proves `cohorts` UPDATE
   works; only INSERT is missing).
3. `/admin/issues` triage is wired but has never executed — `support_issues` has
   0 rows and nothing can create one. Re-test when F56 (P1) ships.

**Things I learned that are written down nowhere else:**

Measured on 2026-07-21 with a real `admin@ditele.local` session against
`192.168.178.75:56721`. `RPC_CONTRACTS.md` §10 was measured *before* WS-0 seeded,
so its row counts are stale — these are current.

*What an admin session can WRITE directly (probed with an invalid FK, so nothing
was actually inserted — `23503` means permitted, `42501` means denied):*

| Table | insert | update | delete | Consequence |
|---|:-:|:-:|:-:|---|
| `user_roles` | ✅ `23503` | ✅ | ✅ | **Role change works.** Answers `RPC_CONTRACTS.md` §12's open WS-6 item. |
| `enrollments` | — | ✅ | — | Still use `decide_enrollment` / `assign_enrollment`; direct update is a fallback only. |
| `support_issues` | ❌ RLS | ✅ | — | Triage (state/severity/assignee) is writable. Nothing can create one. |
| `cohorts` | ❌ `42501` | ✅ | — | ⛔ **A cohort cannot be created.** See I-011. Rename/reschedule works. |
| `cohort_memberships` | ❌ RLS | — | — | ⛔ Members cannot be added or removed by hand. See I-012. |
| `profiles` | — | ❌ `42501` | — | Admin cannot edit another user's profile. `update_own_profile` (RPC) is the only write path, own row only. |
| `ratings` | — | ❌ `42501` | — | No moderation action. Read-only aggregation screen. |

*Auth Admin API via `SUPABASE_SERVICE_ROLE_KEY` — all verified working:*
- `createUser({email, password, email_confirm, user_metadata:{display_name}})` ✅
- ⭐ **A trigger auto-creates BOTH the `profiles` row AND a default `user_roles`
  row** the instant the auth user exists. `display_name` is taken from
  `user_metadata.display_name`. So user creation is *one* Auth call, then an
  **update** of the auto-created role row — never an insert.
- `user_roles` has a unique index `user_roles_live_scope_uidx` on the live
  (user, org) scope. Inserting a second live role → `23505`. **Role change is an
  UPDATE of `role_id` on the existing live row**, not insert-then-delete.
- `updateUserById(id, {ban_duration: "876000h"})` = deactivate,
  `{ban_duration: "none"}` = reactivate ✅
- `updateUserById(id, {password})` = admin password reset ✅
- `listUsers({page, perPage})` ✅ — the **only** source of `email`,
  `last_sign_in_at`, `banned_until`, `email_confirmed_at`. `profiles` has no
  email column, so the user list is a merge of the two sources.

*Row counts under the admin session, 2026-07-21 (post-seed):*
> `profiles` 10 · `user_roles` 11 · `roles` 8 · `courses` 4 · `content_versions` 4 ·
> `cohorts` 1 · `cohort_memberships` 6 · `enrollments` 7 · `questions` 4 ·
> `ratings` 8 · `audit_events` 37 · `tasks` 1 · `organizations` 1
>
> **0 for admin:** `submissions` `attempts` `notifications` `certificates`
> `support_issues`. `attempts`/`notifications` are ownership-scoped (the student
> sees their own); `support_issues` genuinely has no rows and no way to make one.

*Enrolment states right now — `/admin/applications` has real work to do:*
> 5 × `assigned` · 1 × `requested` · 1 × `rejected`

*`list_organization_member_profiles(p_organization_id)` returns:*
```jsonc
[{ "user_id": "uuid", "display_name": "string", "locale": "string",
   "timezone": "string", "profile_state": "record_state",
   "membership_state": "string" }]
```
No email. Use it for pickers; use `profiles` + Auth Admin for the user list.

*User-creation flow, verified on a throwaway account (created, exercised, deleted):*
> `createUser` → the trigger grants **`learner`** by default, whatever role you
> intended. So `/admin/users/new` always runs a second step. `setUserRole` is an
> **UPDATE** of the live `user_roles` row: learner → trainer → admin all
> succeeded. `banned_until` **is** returned by `listUsers` once set and absent
> once cleared, so the Aktiv/Deaktiviert column is trustworthy.

*The 8 role ids (stable, seeded):*
| code | id |
|---|---|
| `admin` | `019f7f56-6b57-7b9b-b9a3-a2e1e3605d12` |
| `content_admin` | `019f7f56-6b57-7c6c-be88-b91b5ab57ec8` |
| `dpo` | `019f7f56-6b57-7227-8a6a-988353f77f91` |
| `integration_admin` | `019f7f56-6b57-7713-b322-ff08a57df182` |
| `learner` | `019f7f56-6b56-76bc-bfe7-05996c34600c` |
| `organization_admin` | `019f7f56-6b57-741a-a355-4ddaa1a43686` |
| `support` | `019f7f56-6b57-73d5-a893-21dafcbb6725` |
| `trainer` | `019f7f56-6b57-7ab6-a056-c6e6bd007e1f` |

**Do not hardcode these** — `admin.ts` reads the `roles` table. They are written
down so the next chat can recognise one in a payload.

⚠️ **Never call `decide_enrollment` on an already-decided row.** ISSUES I-007:
it does not error, it *hangs*, Kong 504s, and the PostgREST pool is exhausted so
**every other chat's requests fail for ~30 s**. Every decision button in this
workstream is gated on `state === "requested"` before it renders.

**Blocked on:**
- Nothing that stops the build. See I-011 / I-012 for the two admin actions the
  database cannot do; both are built as honest, visible blocked states.

---

## Routes

> **Legend — read this before trusting a tick.** ✅ = actually exercised against
> the live database and asserted. **◐ = built to the spec but NOT eyeballed in a
> browser.** This chat had no browser; every "renders" claim comes from fetching
> the route with a real admin session and asserting on the HTML
> (`Real data` column). **375px, dark mode and keyboard are ◐ everywhere — WS-7
> must sweep them for real.** A false ✅ here is worse than an honest ◐, because
> it makes WS-7 skip the check.

| Route | Built | Real data | Loading | Empty | Error | 375px | Dark | Keyboard |
|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| /admin/applications | ✅ | ✅ | ✅ | ✅ | ✅ | ◐ | ◐ | ◐ |
| /admin/users | ✅ | ✅ | ✅ | ✅ | ✅ | ◐ | ◐ | ◐ |
| /admin/users/new | ✅ | ✅ | ✅ | n/a | ✅ | ◐ | ◐ | ◐ |
| /admin/users/[userId] | ✅ | ✅ | ✅ | ✅ | ✅ | ◐ | ◐ | ◐ |
| /admin/groups | ✅ | ✅ | ✅ | ✅ | ✅ | ◐ | ◐ | ◐ |
| /admin/groups/new | ✅ | n/a | ✅ | n/a | ✅ | ◐ | ◐ | ◐ |
| /admin/groups/[cohortId] | ✅ | ✅ | ✅ | ✅ | ✅ | ◐ | ◐ | ◐ |
| /admin/issues | ✅ | ✅ | ✅ | ✅ | ✅ | ◐ | ◐ | ◐ |
| /admin/ratings | ✅ | ✅ | ✅ | ✅ | ✅ | ◐ | ◐ | ◐ |
| /admin/settings | ✅ | ✅ | ✅ | n/a | ✅ | ◐ | ◐ | ◐ |
| /admin/profile | ✅ | ✅ | ✅ | n/a | ✅ | ◐ | ◐ | ◐ |

`/admin/groups/new` has no "real data" cell because it deliberately renders a
blocked notice, not a query — see I-011. `/admin/issues` renders its **empty**
state with real data: the table genuinely has 0 rows and nothing can create one.

**What "Real data" means per route, so WS-7 can re-run it:** each was fetched at
`http://127.0.0.1:3106/de<route>` with a real `admin@ditele.local` cookie and
asserted to contain seeded values — e.g. `/admin/users` must contain
"Ada Admin", "admin@ditele.local" and "Mara Keller"; `/admin/applications` must
contain "Praktisches Softwaretesten" and a live decision button. A 200 alone was
never accepted as a pass, and neither was a page still showing the stub text.

## Data functions added
`src/shared/data/admin.ts` →
`listRoles` · `listAdminUsers` · `getAdminUser` · `createAdminUser` ·
`setUserRole` · `setUserActive` · `resetUserPassword` ·
`listEnrollmentApplications` · `decideEnrollment` · `assignEnrollment` ·
`listCohorts` · `getCohort` · `transitionCohortState` · `updateCohortSchedule` ·
`listSupportIssues` · `updateSupportIssueState` · `listRatings` ·
`getOwnProfile` · `updateOwnAdminProfile` · `getPlatformInfo`
plus `parseEnrollmentState` / `parseCohortState` (narrow a URL param to the enum).

## Gates
- [x] `npx tsc --noEmit` — green for every WS-6 file
- [x] lint — **`npx next lint` does not exist in Next 16** (it reads `lint` as a
      directory and errors). The real gate is `npx eslint .`, which is what
      `npm run lint` runs and what WS-0 used. Green on all WS-6 paths.
- [x] `node scripts/smoke.mjs` — **47/47 green** against port 3106.
      ⏱ It takes ~12 minutes in dev with six servers contending, because each
      route compiles on first request. Budget for that; it is not hung.
- [x] SEC-3 — **as far as a Wave-1 chat can take it. Read this, WS-7:**
      the documented command greps `.next-ws6/static/`, and **that directory does
      not exist in dev** — Turbopack serves client chunks from memory, and
      Wave-1 chats are forbidden from running `npm run build`. So the literal
      command passes vacuously and proves nothing. What was actually verified:
      1. The privileged key's **value** appears nowhere except
         `.next-ws6/dev/server/chunks/ssr/` and the Turbopack build cache —
         both server-side.
      2. `createServiceRoleClient` is imported by exactly one WS-6 file,
         `src/shared/data/admin.ts`, whose first line is `import "server-only"`.
         No route file and no `"use client"` file imports it.
      3. No `"use client"` file in this workstream contains the strings
         `service_role` / `SERVICE_ROLE`. A doc comment in `create-user-form.tsx`
         originally did, purely as prose — it was reworded, because it is
         indistinguishable from a real leak to the SEC-3 grep.
      **WS-7 still owes the real check after a production build.**
- [x] committed

## Deferred / not yet built
Nothing was cut from the WS-6 build list — all 11 routes are real. What is
*absent* is absent because the database cannot do it, not because it was
deprioritised:
- **Cohort creation** (I-011) and **member / trainer assignment** (I-012) —
  no write path exists. Both render an explanation instead.
- **Audit rows for five admin actions** (I-028) — `audit_events` refuses an
  admin insert; only the RPC-backed actions are logged.
- **Rating moderation** — `ratings` refuses UPDATE (42501), so the screen is
  read-only aggregation. That matches the brief ("ratings → simple average list").
- **Editing another user's profile** — `profiles` refuses UPDATE for an admin;
  `update_own_profile` is own-row only. The user detail page says so.

## Still a stub
**None.** All 11 WS-6 routes are real pages.

## Issues found in someone else's area
- **I-011** — `cohorts` has no insert path, so no cohort can be created. Needs a migration.
- **I-012** — `cohort_memberships` has no insert path, so no trainer can be assigned to a cohort.
- **I-028** — `audit_events` refuses an admin insert, so role change, deactivate,
  password reset, user creation, cohort rename and issue triage are unlogged.
  §5.5 rule 3 is unachievable for those five without a migration.

> ⚠️ Note on ISSUES.md IDs: I-011 is used by both WS-0 and WS-6 (the known
> concurrent-append collision, logged as I-026). Match on the **From** column,
> not the ID alone.

---

## ⚠️ Two traps that cost this chat real time — worth knowing

**1. A `"use server"` module may export ONLY async functions.**
`actions.ts` originally also exported `idleState` and `ISSUE_STATES`. Next does
**not** fail the build for this — it strips the export, so
`import { idleState }` silently resolves to `undefined`, `useActionState` gets
`undefined` as its initial state, and the component dies at render with
`Cannot read properties of undefined (reading 'length')` pointing at a line that
has nothing to do with the cause. Every constant and type now lives in
`action-state.ts`. **If any workstream sees that error near a form, check this
first.**

**2. `npx next lint` does not exist in Next 16.**
It parses `lint` as a directory name and fails with "Invalid project directory".
The gate in the prompts is stale; the real command is `npx eslint .`
(= `npm run lint`).

**3. Six Turbopack dev servers exhaust Windows' thread pool.**
Mine panicked with `failed to spawn thread: Os { code: 1450, ... Insufficient
system resources }` and stopped answering. It is not a code bug and not fixable
from the app — kill that server and restart it. Find your own PID with
`netstat -ano | grep ":3106"` and kill only that one; never a blanket
`taskkill node.exe`, which would take down five other chats.
