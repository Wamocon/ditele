# WS-0 — Foundation (Wave 0a + 0b)

Started: 2026-07-21 · Port: 3100 · Dist: `.next-ws0` · Account: see §Credentials below

---

## RESUME HERE
Updated: 2026-07-21 · Chat: **#1** for this workstream · **Tasks 0 and 1 done; 2–7 not started**

**State:** HANDOFF READY — chat #1 stopped on context, not on a problem.

> ### For the next WS-0 chat, in one paragraph
> Task 0 and Task 1 are complete and committed. The two items the prompt called
> highest-risk are **both resolved**: the login password is `123123123` (the plan's
> was wrong) and `plan/status/RPC_CONTRACTS.md` now holds all 48 real, introspected
> RPC signatures. **The Wave 0a gate is NOT open** — Tasks 2 through 7 (purge, deps,
> design system, shell, 42 stubs, auth/data layer, smoke test) have **not been
> started**. No frontend file has been touched; the repo still contains the full
> old app and `tsc` is as it was. **Start at Task 2 (§6.3, the purge).** Read
> `RPC_CONTRACTS.md` §0 first — it has six findings that change how the data layer
> must be written, and none of them are in the master plan.

**Done and committed:**
- **Task 1d — seeding: PARTIAL, and blocked by a real database constraint** ⚠️
  - ✅ 6 learner accounts created (`learner1..6@ditele.local`, password `123123123`).
    Profiles and `learner` roles are granted automatically by a DB trigger.
  - ✅ 2 extra courses seeded — `testautomatisierung-grundlagen` (in_review) and
    `api-testing-praxis` (draft). **The admin lifecycle bar now has all three
    states** (published / in review / draft). Courses: 1 → **3**.
  - ❌ **Enrolments, attempts, submissions, questions and ratings could NOT be
    seeded.** `request_enrollment` requires a `public.entitlements` row, inserting
    one is refused by RLS even for admin, and no RPC grants an entitlement.
    **See `ISSUES.md` I-004 — this needs direct Postgres access.** The exact SQL
    to unblock it is in the header of `scripts/seed-mock.mjs`; once it is run, the
    script goes green with no code change.
  - Consequence: `learner@ditele.local` remains the **only** account with learning
    data. Submissions, questions, ratings and notifications are still **0 rows**.
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
- `scripts/seed-mock.mjs` — **runs clean and is safe to re-run**, but sections 2–5
  fail on the entitlement blocker above. It is not broken code; it is correct code
  against a database that refuses the operation. Do not "fix" it by switching to
  direct inserts — those are revoked too (I-003). Leave it until I-004 is resolved.
- Nothing else. No frontend file has been created, modified or deleted.

**Next, in order — start here:**
1. **Task 2 — the purge** (`02_WORKSTREAMS.md` §6.3). Delete per MASTER_PLAN §5.1
   **incrementally**, running `npx tsc --noEmit` after each group:
   `app/[locale]` → `entities` → `features` → `shared/api` → `shared/ui` → the rest.
   `docs/execution/` is **not** deleted. Recovery for any file is
   `git checkout pre-v3-purge -- <path>` (the tag exists).
2. **Task 3** — deps (Tailwind v4, 10-minute fallback to v3.4), `postcss.config.mjs`,
   `distDir` + `frame-src` CSP in `next.config.ts`, `.next-*` in `.gitignore`.
   Commit `package.json` + lockfile here; dependencies are frozen after this.
3. **Task 4** — brand assets, `fonts.ts`, `globals.css` tokens, `layout.tsx`,
   tier-1 components only.
4. **Task 5** — shell, `nav-config.ts` (all 42 routes), 5 route-group layouts, 42 stubs.
5. **Task 6** — `role.ts`, `guard.ts`, `result.ts`, `session.ts`, `rpc.ts`, `/403`.
   ⚠️ `database.types.ts` is **current** — do not regenerate it (`db:types` targets
   a local Supabase and would break it).
6. **Task 7** — `scripts/smoke.mjs`.
7. **GATE §6.9**, then Wave 0b components (`IframePanel` first — it blocks WS-2).

> ⚠️ **Do not open the Wave 0a gate on the seed-data box.** §6.9 asks for
> "courses, stages, tasks, a cohort with the learner in it" — that is satisfied
> (3 courses, 1 stage, 1 task, 1 cohort, learner enrolled). But submissions,
> questions and ratings are all 0, so WS-4's and WS-6's screens have nothing to
> render. Tell the coordinator plainly rather than ticking it silently.

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
- ⭐ **`content_versions.snapshot` is the whole product.** It is one jsonb document
  containing the entire course tree — stages, tasks, hints, options, assessment,
  rubric, skill mappings, every localization. **The learner RPCs read the snapshot,
  not the `stages`/`tasks` tables.** That is the real reason a student sees 0 rows
  in `tasks` but gets a full curriculum from `get_my_learning_course`. WS-5:
  publishing is not flipping a state column, it is producing a correct snapshot —
  let `publish_content_version` build it, never hand-assemble one.
- **`task_kind` value seen in real data: `practical`.** The other values are not
  confirmed; do not guess `theory` without checking the check-constraint.
- The database has a `rubrics` / `review_rubric_scores` structure already wired
  into the snapshot (`criteria`, `max_points`, `required_for_acceptance`). Rubric
  scoring is P1 in the plan, but `decide_submission` **requires**
  `p_criterion_scores` regardless — pass `{}` for P0.
- **Creating an auth user via the Admin API auto-provisions a profile and a
  `learner` role** through a DB trigger (reason: "standalone self-registration").
  You do not insert those yourself — and you could not if you tried.

**Blocked on:**
- **`ISSUES.md` I-004 — needs the coordinator.** New learners cannot be enrolled
  without a `public.entitlements` row, and nothing in the API surface can create
  one. Someone with direct Postgres access must run the insert in
  `scripts/seed-mock.mjs`'s header. **This does not block Tasks 2–7** — carry on
  with the purge and the foundation. It only limits how much data the Wave-1
  chats will see on their screens.

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

## Gates (§6.9) — ⛔ GATE IS CLOSED. Do not release the Wave-1 chats.

- [x] OneDrive paused (process killed — see caveat above)
- [x] `git tag pre-v3-purge` exists
- [x] 🚨 Login verified for all **four** accounts — password `123123123` recorded above
- [x] 🚨 `RPC_CONTRACTS.md` written with real, introspected signatures
- [~] 🚨 Seed data — **partial, judge this one deliberately.** Present: 3 courses
      (published / in_review / draft), 1 stage, 1 task, 1 cohort, `learner@ditele.local`
      enrolled with 1 attempt, 10 profiles. **Absent: 0 submissions, 0 questions,
      0 ratings, 0 support issues** — blocked by ISSUES.md I-004. WS-4 and WS-6
      will have nothing to render.
- [x] RLS findings per role recorded here and in `RPC_CONTRACTS.md` §10
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
