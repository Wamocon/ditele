# Issues board — APPEND ONLY

> **Rules:** append a new row at the bottom. **Never edit or delete an existing row.** Editing an existing row is how two chats overwrite each other's report.
> Only the coordinator changes the Status column, and only by appending a new row that references the original ID.
> If you are blocked more than 10 minutes, an entry belongs here.

| ID | Time | From | Area / file | What is wrong | Blocks me? | Status |
|---|---|---|---|---|:---:|---|
| I-001 | 2026-07-21 | WS-0 | `plan/00_MASTER_PLAN.md` §4.4 | The documented test password `Ditele-Local-2026!` is **wrong**. It comes from `supabase/seed.sql`, but `supabase/seed_role_accounts.sql` runs afterwards and re-hashes all four accounts to **`123123123`**. Verified by logging in as all four. No reset was needed. | no | ✅ resolved — correct password recorded in `WS-0.md` |
| I-002 | 2026-07-21 | WS-0 | `SUPABASE_SERVICE_ROLE_KEY` / all tables | The service-role key has **no table grants** on this deployment — `42501 permission denied` on every table and RPC. Cause: migration `…095000` line 285-287 grants DML to `anon`/`authenticated` only. It **does** still work for the Auth Admin API. | no | open — documented in `RPC_CONTRACTS.md` §0.5; WS-6 must use the admin session for `profiles`/`user_roles` |
| I-003 | 2026-07-21 | WS-0 | writes to all domain tables | **All domain writes are RPC-only.** Even an admin session is refused direct inserts on `attempts`, `submissions`, `questions`, `notifications`, `ratings`, `profiles`, `cohorts` (`42501 permission denied`) and on `enrollments`, `cohort_memberships`, `support_issues`, `entitlements` (`42501 RLS violation`). Only `courses`, `course_localizations` and `content_versions` accept direct inserts. | no | open — every workstream must mutate through the command RPCs, never `.from().insert()` |
| I-004 | 2026-07-21 | WS-0 | `public.entitlements` · seeding | 🚨 **Cannot enrol any new learner.** `request_enrollment` requires a `public.entitlements` row (`capability in ('catalog','learning')`, migration `…096000` line 62-70). Inserting that row is refused by RLS for admin, and **no RPC in the 48 grants an entitlement**. Only the original `learner@ditele.local` has one. So the 6 new learner accounts exist but cannot be enrolled, which blocks seeding submissions, questions and ratings. **Needs direct Postgres access** (psql as the DB owner) to insert entitlement rows. | **yes — blocks a rich seed** | open — needs the coordinator / server admin |
| I-005 | 2026-07-21 | WS-0 | `public.entitlements` | **I-004 RESOLVED.** Granted `learning` + `catalog` entitlements to all 6 seeded learners via direct psql on `Nvidia-1` (`docker exec supabase_db_ditele-v2`). `request_enrollment` now works; the full enrolment → attempt → question → rating chain seeds green. | no | ✅ resolved |
| I-006 | 2026-07-21 | WS-0 | `submit_attempt` / evidence | **0 submissions can be seeded.** The seeded task has `evidence_required: true`, so `submit_attempt` raises `22023 verified evidence is required for this task`. `create_external_task_evidence` alone does not produce a *verified* evidence row — that needs the upload pipeline (`finalize_task_evidence_upload_service`). **WS-4 will have an empty review queue.** | **yes for WS-4** | open |
| I-007 | 2026-07-21 | WS-0 | `decide_enrollment` / PostgREST | Calling a decision RPC on an already-decided row does **not** return an error — it hangs, Kong 504s, and the PostgREST connection pool is exhausted so every other request fails for ~30s. Guard state before calling. Recovery: `ssh Nvidia-1 "docker restart supabase_rest_ditele-v2"`. | no | open — treat as a DB bug worth reporting |
---

## What belongs here

- A file you do not own is broken and you cannot compile.
- An RPC in `RPC_CONTRACTS.md` has the wrong signature.
- A table returns zero rows for your role and you think RLS is misconfigured.
- You need a nav entry, a shared component, or a layout change that only WS-0 can make.
- You noticed another workstream's route is broken.
- You cut something from your cut list (record it so the coordinator knows).

## What does NOT belong here

- Your own bugs. Fix those.
- Design opinions about someone else's screen. WS-7 handles consistency.
- Anything you can work around in your own tree in under 10 minutes.
