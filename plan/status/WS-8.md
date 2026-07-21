# WS-8 — Foundation (Bug Arena, Wave A ⛔ gate)

## RESUME HERE
Updated: 2026-07-21 · Chat: #1 for this workstream

**State:** IN PROGRESS

**Done and committed:**
- `56c1ba1` — coordinator decisions + live-DB reconnaissance
  (ISSUES.md I-036 / I-037 / I-038).
- `c7d5664` — **step 2 done early**: `20260722100000_arena_task_kind_hunt.sql`.
  Widens `task_kind` to accept `'hunt'` **and** patches `public.submit_attempt`,
  which would otherwise have made every hunt unsubmittable (I-040).
- `a4db174` — slice seed + `ws8-probe.mjs`. Hunt task H gates content task T2.
  Also I-041, the German-only/three-locale trap that briefly emptied the
  learner's course.
- `f47c80c` — `ws8-roundtrip.mjs`: **the slice round-trips at the data layer.**
  locked → submitted → accepted → unlocked, all through the real command RPCs.
- Badge seeded and awarded (`scripts/ws8-slice-badge.sql`); idempotent on
  re-run, and the learner reads it back under their own RLS policy.

**Half-finished:**
- Nothing half-written. The slice's **browser** confirmation is the one
  outstanding piece — `06_…` §3 says Wave B may not open until it round-trips
  in a real browser, and only the RPC layer is proven so far.

**Next, in order:**
1. Browser round-trip of the slice. ⚠️ Build + `next start`, **not** `next dev`
   (RELEASE.md §7: Turbopack wedges on this machine and looks like an app bug).
   `NEXT_DIST_DIR=.next-ws8 … --port 3108`.
2. Then steps 3–8 of the `06_…` §8 WS-8 entry: `hunt_scenarios`,
   `hunt_findings`, relative scheduling, lock-reason enrichment, the
   `arena.ts` / `model.ts` pair, the nav entry.

**Blocked on:**
- Nothing.

**Slice fixtures now on the live database** (WS-9/WS-10/WS-13 will want these):

| Thing | Id |
|---|---|
| hunt task H | `019f9100-0000-7000-8000-000000000001` (`external_id='checkout-v1'`, `source_system='arena'`) |
| gated task T2 | `019f9100-0000-7000-8000-000000000002` |
| prerequisite | `019f9100-0000-7000-8000-000000000003` |
| badge | `019f9100-0000-7000-8000-0000000000b1` (`first-bug-found`) |
| learner | `learner@ditele.local` · enrollment `01980a33-0000-7000-8000-000000000001` |

---

## ⚠️ Read this before touching the database

### How to apply a migration
The documented and only working path (WS-0.md:84-85):

```bash
ssh Nvidia-1 'docker exec supabase_db_ditele-v2 psql -U postgres -d postgres -f -' < supabase/migrations/<file>.sql
```

`supabase db push` is **not** usable — see I-036: the ledger is 4 entries stale,
so a push would try to re-run four already-applied migrations.
⚠️ Port 54322 on that host is a **different** Supabase instance. Ours is 56722,
container `supabase_db_ditele-v2`.

### The live database is NOT what `schema_migrations` says (I-036)
45 recorded versions, 48 files in the repo. The four `20260721*` migrations are
applied but unrecorded; `20260717100170` is recorded but has no file. **Verify
schema by effect** (`to_regclass`, `information_schema.columns`,
`pg_get_constraintdef`), never by the ledger. Confirmed applied by effect:
`course_trainers` exists · `rate_course`/`rate_task` dropped ·
`tasks.video_url` + `intro_video_url` exist.

### The lock-reason code is `required_task`, NOT `prerequisite` (I-037)
Both design docs say `{"code":"prerequisite"}`. That code does not exist. The
real set emitted by `app_private.learner_snapshot_task_lock_reasons` is:
`schedule` · `entitlement` · `configuration` · `required_task` · `required_skill`.

### Why enriching the lock-reason function is safe
Every one of its **9 call sites** compares the whole result to `'[]'::jsonb`
(`= '[]'` or `<> '[]'`) — none inspects the contents of a reason object. So
**adding fields to a reason object cannot change any gating decision.** Adding a
new reason *code*, or emitting a reason where none was emitted before, would.
That is the line: widen the return, never the permission.

Call sites: `20260717100000` lines 1135, 1229, 1296, 1403, 1555 ·
`20260717100050` line 1075 · `20260717100100` lines 1051, 1326, 2044, 2498.

### Seeded content reality
- One published content version: `01980a22-0000-7000-8000-000000000001`
  (course `practical-software-testing`), **1 stage, 1 task**.
- Cohort `01980a30-0000-7000-8000-000000000001` → that version,
  `progression_mode = 'scheduled'`. **Scheduled mode means every task needs a
  `task_schedules` row or it locks with code `schedule`.**
- `tasks.external_id` exists and is empty — that is the column `06_…` WS-9 uses
  to point a hunt task at its scenario.
- Learner content is read from `content_versions.snapshot`, never from `tasks`.
  Rebuild it with `app_private.build_content_snapshot(p_content_version_id)`;
  do not hand-assemble jsonb.

---

## The slice plan (`06_…` §3)

```
one locked task → one hunt → one planted bug
    → student reports → trainer accepts → task unlocks → one badge
```

The design's central claim is that **a hunt is just a task with a different
`task_kind`** — so the slice needs almost no new UI. The existing task
workspace, defect form, review queue and prerequisite gate already do the work.
What the slice proves is that the claim is true.

Shape:
- New stage 2 with content task **T2**, and hunt task **H** in stage 1.
- `prerequisites(target_task_id = T2, required_task_id = H)`.
- Student sees T2 locked with `required_task` → follows it to H → submits a
  defect report → trainer accepts → T2 unlocks → badge row appears.

Using a *new* T2 rather than the existing seeded task keeps the slice clear of
the learner's existing attempt on `01980a26-…0001`.

---

## Delivered
- _nothing yet_

## Migrations written
- _none yet_ — my block is `20260722*`

## Data functions added
- _none yet_

## Gates
- _not yet run_

## Deferred / not built
- _tbd_

## Issues found in someone else's area → also appended to ISSUES.md
- I-036 — `schema_migrations` ledger is stale and untrustworthy
- I-037 — design docs name a lock-reason code (`prerequisite`) that does not exist

## Things I learned that are written down nowhere else
- See "Read this before touching the database" above — all four items.
