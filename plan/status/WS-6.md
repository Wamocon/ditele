# WS-6 — Admin Ops

Started: 2026-07-21 · Port: 3106 · Dist: `.next-ws6` · Account: `admin@ditele.local` / `123123123`

---

## RESUME HERE
Updated: 2026-07-21 · Chat: **#1** for this workstream

**State:** IN PROGRESS

**Done and committed:**
- `src/shared/data/admin.ts` — the whole WS-6 data layer.
- `src/features/admin/` — `i18n.ts`, `format.ts`, `ui.tsx`, `form-ui.tsx`, `actions.ts`
  (Server Actions, each re-checking the role), plus the per-screen panels.
- `adminOps` + `adminOps.roleLabels` in `messages/de.json` (German only).
- **`/admin/applications`** — approve / reject-with-reason / assign-to-cohort.
  ⭐ Verified against the live database end to end: approve → assign →
  `cohort_memberships` grew 6 → 7. WF-1's admin half works.
- **`/admin/users`** — search, role filter, pagination, empty state.
- **`/admin/users/[userId]`** — role change, deactivate/reactivate, password
  reset, enrolments, groups.
- **`/admin/users/new`** — service-role create, in a Server Action only.

**Half-finished:**
- Nothing.

**Next, in order:**
1. `/admin/groups` → `/admin/groups/[cohortId]` → `/admin/groups/new`
2. `/admin/issues` → `/admin/ratings` → `/admin/settings` → `/admin/profile`

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
| /admin/groups | ⬜ | | | | | | | |
| /admin/groups/new | ⬜ | | | | | | | |
| /admin/groups/[cohortId] | ⬜ | | | | | | | |
| /admin/issues | ⬜ | | | | | | | |
| /admin/ratings | ⬜ | | | | | | | |
| /admin/settings | ⬜ | | | | | | | |
| /admin/profile | ⬜ | | | | | | | |

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
- [ ] SEC-3: `grep -r "service_role" .next-ws6/static/` returns nothing
- [x] committed

## Deferred / not yet built
_pending — see the cut list in 02_WORKSTREAMS §8 WS-6_

## Still a stub
`/admin/groups` · `/admin/groups/new` · `/admin/groups/[cohortId]` ·
`/admin/issues` · `/admin/ratings` · `/admin/settings` · `/admin/profile`

## Issues found in someone else's area
- I-011 — `cohorts` has no insert path, so no cohort can be created (needs a migration)
- I-012 — `cohort_memberships` has no insert path, so no trainer can be assigned to a cohort
