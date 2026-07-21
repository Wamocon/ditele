# WS-9 — Sandbox engine (Bug Arena, Wave B)

## RESUME HERE
Updated: 2026-07-21 · Chat: #1 for this workstream

**State:** IN PROGRESS

**Done and committed:** nothing yet.

**Next, in order:**
1. `src/features/arena/sandbox/model.ts` — the `configuration` schema
2. `registry.ts` + `defect-context.tsx` — the engine
3. The checkout surfaces (reference scenario)
4. The route `/[locale]/arena/sandbox/[scenarioId]`
5. `supabase/seed_arena_scenarios.sql`
6. Capture-region
7. `README.md` — the authoring contract, and the visual-correctness run

**Things I learned that are written down nowhere else:** see the bottom section.

**Blocked on:** nothing.

---

## Delivered
_(nothing yet)_

## Migrations written
None, and none are allowed — WS-9's block is **seeds only**
(`supabase/seed_arena_scenarios.sql`).

## Data functions added
None. WS-8's `src/shared/data/arena.ts` already exposes
`getHuntScenarioByCode`, which is the only read this workstream needs.

## Gates
_(not run yet)_

## Deferred / not built

## Issues found in someone else's area → also appended to ISSUES.md

## Things I learned that are written down nowhere else
