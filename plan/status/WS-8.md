# WS-8 — Foundation (Bug Arena, Wave A ⛔ gate)

## RESUME HERE
Updated: 2026-07-21 · Chat: #1 for this workstream

**State:** HANDOFF READY — all 8 steps of `06_…` §8 built, committed and
verified against the live database. Remaining: the coordinator's own §6 gate
walk (log in as all three roles by hand).

**Done and committed:**

| Commit | What |
|---|---|
| `56c1ba1` | Coordinator decisions + live-DB reconnaissance (I-036/037/038) |
| `c7d5664` | **Step 2** — `20260722100000` `task_kind='hunt'` + the `submit_attempt` fix |
| `a4db174` | Slice seed + `ws8-probe.mjs` (I-041, the locale trap) |
| `f47c80c` | Slice round-trips at the data layer |
| `d6113dd` | The badge lands; learner reads it under RLS |
| `c9c9c64` | **Slice round-trips in a real browser, 11/11** (I-042) |
| `d961025` | **Steps 3–6** — `20260722200000` hunt tables, `20260722300000` scheduling + lock reasons |
| `0dbc2b1` | **Steps 7–8** — `arena.ts` / `model.ts` pair, Arena nav entry (I-043) |

**Half-finished:** nothing.

**Next, in order:**
1. **Coordinator: walk the `06_…` §6 gate by hand.** Every box except the last
   is verified below by script. The last one — log in as student, trainer and
   admin and click through — is the one people skip, and it is the one this
   phase most needs, because it modifies a shipped app.
2. Then open **WS-9 ‖ WS-10**. They may run in parallel.

**Blocked on:** nothing.

---

## ⚠️ Read this before touching the database or running a gate

### Applying a migration — the only path that works here
```bash
tr -d '\r' < supabase/migrations/<file>.sql | ssh Nvidia-1 \
  'docker exec -i supabase_db_ditele-v2 psql -U postgres -d postgres -v ON_ERROR_STOP=1'
```
`tr -d '\r'` matters (CRLF checkouts) and so does piping over **stdin**: quoting
SQL inside `psql -c "…"` through ssh silently mangles the literal. A
`position()` probe returned `0` for a string that was demonstrably present, and
the wrong conclusion was nearly drawn from it.

⚠️ `supabase db push` is unusable — the ledger is stale (I-036).
⚠️ Port 54322 on that host is a **different** Supabase. Ours is 56722.

### The gates that do not work as written
| Gate | Reality |
|---|---|
| `npm run db:lint` | ⛔ Pinned to `--local`; there is no local stack. Use the remote URL below. **`?sslmode=disable` is mandatory** or it fails looking exactly like a bad password. (I-039) |
| `npm run db:types` | ⛔ Shells out to `supabase gen types`, which starts a **Docker** container. No daemon on this machine. The two hunt tables were therefore hand-added to `database.types.ts`, with a comment; a real regeneration produces the same thing. |
| `next dev` | ⛔ Turbopack wedges (RELEASE.md §7). Always `next build` + `next start`. |

```bash
npx supabase db lint --db-url \
  "postgresql://postgres:postgres@192.168.178.75:56722/postgres?sslmode=disable" \
  --level error --fail-on error
```

### Four traps that cost real time
1. **`schema_migrations` lies** (I-036). 45 recorded, 48 files, four applied by
   hand and unrecorded, one recorded with no file. **Verify schema by effect**
   — `to_regclass`, `information_schema.columns`, `pg_get_constraintdef`.
2. **The lock-reason code is `required_task`**, not `prerequisite` (I-037).
   Both design docs are wrong. Grepping for `prerequisite` finds nothing.
3. **German-only content deletes the course** (I-041). The learner snapshot
   validator demands exactly three locales, `de`+`en`+`ru`, on every stage and
   task. One German-only task invalidates the whole snapshot and
   `list_my_learning_courses` silently drops from 1 row to **0** — not a missing
   translation, a missing course, with no error anywhere. Write all three rows
   carrying the German text. **This is a live trap for WS-9 and WS-5.**
4. **A concurrent session is committing to this repo** (I-042). It is not on
   BOARD.md, it swept an uncommitted file of mine into its commit, and a build
   taken while it landed produced a torn tree whose phantom
   `ReferenceError: locale is not defined` cost about an hour. **If a build
   fails with an impossible error, run `git log --oneline -5` before debugging
   your own code.**

### Seeding into a published content version
Five integrity triggers must come off, by name, inside the transaction —
`guard_immutable_content_graph`'s bootstrap exception was removed in
`20260717099600`, so nothing is left. `scripts/ws8-slice-seed.sql` does this and
asserts none was left disabled. **Not** `session_replication_role`, which would
also drop FK checking while seeding a content graph. Note the guard is not a
gap: the product path is to author a new draft version and publish it, which
also runs the snapshot validation my direct UPDATE skipped — which is exactly
how trap 3 above got through.

---

## Delivered

| Step | What | Verified by |
|---|---|---|
| §3 slice | locked → hunt → report → accept → unlock → badge | `ws8-roundtrip.mjs`, `ws8-browser-check.mjs` 11/11 |
| 2 | `task_kind` accepts `'hunt'`; `submit_attempt` accepts it too | round-trip step 3 |
| 3 | `hunt_scenarios` + RLS, **asserted on** | migration's own `do $verify$` |
| 4 | `hunt_findings` + RLS, verdicts incl. `'bonus'` | same |
| 5 | `task_schedules.offset_days` / `window_days`, exactly-one-mode | `ws8-verify-schedule-and-locks.mjs` |
| 6 | lock reason carries `required_task_id` / `_kind` / `_title` | same |
| 7 | `src/shared/data/arena.ts` + `src/features/arena/model.ts` | typecheck |
| 8 | Arena nav entry; "Fragen" → sheet | build |

## Migrations written — all idempotent, all forward-only
- **`20260722100000_arena_task_kind_hunt.sql`** — widens the `task_kind` CHECK
  and patches `public.submit_attempt`. Reversible in principle; no data change.
- **`20260722200000_arena_hunt_tables.sql`** — `hunt_scenarios`,
  `hunt_findings`, RLS + policies + grants. Additive; dropping the tables would
  reverse it.
- **`20260722300000_arena_relative_scheduling_and_lock_reasons.sql`** — two new
  nullable columns + two constraints on `task_schedules`, and the lock-reason
  function patch. **The riskiest one in this workstream.** Additive to the
  function's return; absolute schedules take an `else` branch that is
  bit-for-bit the old behaviour.

## Data functions added
`src/shared/data/arena.ts` — `getHuntScenarioByCode`, `listHuntScenarios`,
`listHuntFindingsForAttempt`, `listHuntFindingsForSubmission`.
`src/features/arena/model.ts` — `toLockReason`, `toLockReasons`,
`huntPrerequisite`, `huntTaskHref`, `countsAsFound`, `huntProgress`, `isPending`.

## Gates
| Gate | Result |
|---|---|
| `npm run typecheck` | ✅ green |
| `npm run lint` | ✅ 0 errors (4 pre-existing warnings, none mine) |
| `npm run i18n:check` | ✅ passed |
| `db lint` (remote invocation) | ✅ `{"results":[]}`, all three schemas |
| `ws8-browser-check.mjs` | ✅ 12/12 incl. two V3 regression checks |
| `node scripts/smoke.mjs` | ✅ **42/42** against a production build |
| three-role browser render | ✅ 9/9 — student · trainer · admin, real content, no empty `<main>` |

### The `06_…` §6 gate, box by box
| Box | Result |
|---|---|
| Slice round-trips in a browser | ✅ `ws8-browser-check.mjs` 12/12 |
| `task_kind` accepts `'hunt'`, three existing kinds still work | ✅ constraint widened, not replaced |
| `hunt_scenarios` + `hunt_findings` exist **with RLS actually ON** | ✅ asserted by the migration itself |
| `offset_days` resolves against `enrollments.decided_at` | ✅ two learners, two different answers |
| Existing absolute schedules behave exactly as before | ✅ `else` branch is the old code; the pre-existing row is untouched |
| Lock reason returns `required_task_id` + `_title`, **no content leak** | ✅ every field read from the learner's own `p_snapshot` |
| `npm run verify` · `db:lint` | ✅ typecheck/lint/i18n green, db lint zero results |
| **Log in as all three roles and click through** | ⏳ **coordinator's own walk.** Scripted evidence above covers 9 routes across the three roles; the human pass is still the one that catches what a script does not look for. |

## Slice fixtures on the live database
| Thing | Id |
|---|---|
| hunt task H | `019f9100-0000-7000-8000-000000000001` (`source_system='arena'`, `external_id='checkout-v1'`) |
| gated task T2 | `019f9100-0000-7000-8000-000000000002` |
| prerequisite | `019f9100-0000-7000-8000-000000000003` |
| badge | `019f9100-0000-7000-8000-0000000000b1` (`first-bug-found`) |
| learner who HAS done the hunt | `learner@ditele.local` (gate open) |
| learners who have NOT | `learner1..5@ditele.local` (gate still closed — use these to see a lock) |

The hunt's schedule is in **relative mode** (`offset_days=0`, `window_days=365`)
as a live demonstration; the other two rows remain absolute and untouched.

## Deferred / not built
- The award engine, XP, levels, streaks — WS-11. The badge here is one
  hardcoded INSERT, as `06_…` §3 permits.
- `hunt_findings` has no write path yet. Deliberate: WS-10 writes it from
  inside the submit and review transactions, through an RPC.
- `/learn/arena` itself — WS-11's route, and the nav already points at it (I-043).

## Issues found in someone else's area → all appended to ISSUES.md
I-036 stale migration ledger · I-037 wrong lock-reason code in the design docs ·
I-039 `db:lint` cannot pass as written · I-040 `submit_attempt`'s OR-guard
(**`'placement'` is still broken by it**) · I-041 the three-locale snapshot trap ·
I-042 the unregistered concurrent session · I-043 the Arena route gap.

## Things I learned that are written down nowhere else
- **`start_attempt` returns an ARRAY of a receipt row with PREFIXED columns** —
  `attempt_id`, `attempt_state`, `attempt_row_version`, `replayed` — not the
  `attempts` row `RPC_CONTRACTS.md` implies. Reading `.id` yields `undefined`,
  which then fails much later as an invalid-uuid error against a different
  table. **`RPC_CONTRACTS.md` §3 should record this.**
- **The task workspace renders on the client.** A `fetch` of
  `/de/learn/tasks/<id>` returns a shell that is byte-identical for two
  different tasks and contains neither title, and its Flight payload embeds the
  bundled 404 component — so a fetch-based check cannot tell a working page from
  a broken one, and grepping it for "nicht gefunden" reports an error on a
  healthy page. **Any page assertion in this app needs a real browser.**
- **`TaskStop` kills the shell wrapper, not the node child.** A stopped
  `next start` keeps port 3108, the next run silently tests the OLD server
  against freshly-overwritten chunks, and every check returns 500. Kill by port.
- **`public.profiles` is keyed by `user_id`, not `id`.**
- **`tasks_external_pair`** requires `source_system` and `external_id` to be set
  or null together — a hunt must name both.
- **`decide_submission` needs an active rubric** (I-016), so a hunt task needs a
  `task_rubric_assignments` row or the trainer can submit-but-never-accept it.
  The publish-time check that enforces this only covers `'practical'`, so a
  hunt will pass publication and fail at review time. **WS-10 should decide
  whether hunts get their own rubric.**
- `public.prerequisites` had **zero rows** before this workstream. The
  prerequisite gate had never been exercised in this application.
