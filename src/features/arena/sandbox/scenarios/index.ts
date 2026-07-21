import { ScenarioConfigurationSchema, type ScenarioConfiguration } from "../model";
import checkoutV1 from "./checkout-v1.json";

/**
 * Draft scenarios — the local half of the authoring loop.
 *
 * ⭐ **Why these are JSON and not TypeScript.** Each file here is the exact
 * document that goes into `hunt_scenarios`: the same `configuration` jsonb,
 * the same title, the same `expected_findings`. `supabase/seed_arena_scenarios.sql`
 * embeds it verbatim and `scripts/ws9-check-scenario.mjs` diffs the two, so a
 * scenario that previews correctly and behaves differently once seeded is a
 * failure mode that cannot happen rather than one we promise to be careful
 * about. A `.ts` file with comments and trailing commas could not be diffed
 * that way, which is the whole reason the commentary lives here instead.
 *
 * The loop, for someone who was not in the chat that built this:
 *
 *   1. copy `checkout-v1.json`, edit it, register it below
 *   2. `DITELE_ARENA_AUTHORING=1` and open
 *      `/de/arena/sandbox/<code>?draft=1` — no database involved
 *   3. `?draft=1&defects=off` for the clean baseline, and run the
 *      visual-correctness checklist in `../README.md` against it
 *   4. paste the JSON into `seed_arena_scenarios.sql`, apply it
 *   5. `node scripts/ws9-check-scenario.mjs` to prove the two agree
 *
 * ⚠️ A draft is **not** a shipping mechanism. `?draft=1` is refused unless
 * `DITELE_ARENA_AUTHORING=1`, which is never set in production, and a hunt
 * task always resolves its scenario from the database. Nothing here reaches a
 * learner.
 */

export interface DraftScenario {
  code: string;
  scenarioVersion: number;
  /** GERMAN. Course material — matches `hunt_scenarios.title`. */
  title: string;
  /** GERMAN. Course material — matches `hunt_scenarios.description`. */
  description: string;
  expectedFindings: number;
  configuration: ScenarioConfiguration;
}

function draft(raw: unknown): DraftScenario {
  const document = raw as Omit<DraftScenario, "configuration"> & { configuration: unknown };
  return {
    ...document,
    // Parsed rather than cast: a draft with a shape the engine cannot render
    // must fail here, in the author's own preview, and not later in a hunt.
    configuration: ScenarioConfigurationSchema.parse(document.configuration),
  };
}

export const DRAFT_SCENARIOS: Record<string, DraftScenario> = {
  "checkout-v1": draft(checkoutV1),
};

export function getDraftScenario(code: string): DraftScenario | null {
  return DRAFT_SCENARIOS[code] ?? null;
}
