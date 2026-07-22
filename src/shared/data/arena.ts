import "server-only";

import { z } from "zod";
import { createServerClient } from "@/shared/database/server";
import { fromSupabase, ok, type Result } from "./result";
import {
  HUNT_VERDICTS,
  type HuntFinding,
  type HuntScenario,
  type HuntScenarioDefect,
  type HuntVerdict,
} from "@/features/arena/model";

/**
 * Bug Arena data access.
 *
 * The types and pure helpers live in `@/features/arena/model` — this module is
 * `server-only`, and the sandbox and ticket screens are Client Components that
 * need those helpers at runtime. Everything is re-exported at the bottom so
 * callers can keep importing from one place.
 *
 * Two rules inherited from the rest of this codebase, both learned the hard way:
 *
 *  * **Never `.from(x).insert()`.** Every domain write goes through a
 *    `SECURITY DEFINER` command RPC (ISSUES.md I-003). `hunt_findings` has no
 *    INSERT policy at all, so a direct write fails with 42501 at runtime, on a
 *    user action, having compiled perfectly. WS-10 writes findings from inside
 *    the submit and review transactions.
 *  * **Never send a stale `p_expected_*_version`.** This deployment does not
 *    return a conflict — it HANGS, Kong 504s, and the PostgREST pool is
 *    unusable for ~30 s afterwards (I-007 / I-009). Read the row version
 *    immediately before the call that uses it.
 */

/* ── Row schemas ──────────────────────────────────────────────────────────── */

const HuntScenarioRow = z.object({
  id: z.string(),
  code: z.string(),
  scenario_version: z.number(),
  title: z.string(),
  description: z.string(),
  configuration: z.unknown(),
  html: z.string().nullish().transform((v) => v ?? null),
  reward_badge_id: z.string().nullish().transform((v) => v ?? null),
  expected_findings: z.number(),
  state: z.string(),
});

const HuntScenarioDefectRow = z.object({
  id: z.string(),
  scenario_id: z.string(),
  code: z.string(),
  position: z.number(),
  title: z.string(),
  location_hint: z.string(),
  expected_behaviour: z.string(),
  reproduction: z.string(),
  severity: z.string(),
});

const HuntFindingRow = z.object({
  id: z.string(),
  attempt_id: z.string(),
  submission_id: z.string().nullable(),
  scenario_id: z.string().nullable(),
  reported_summary: z.string(),
  planted_code: z.string().nullable(),
  verdict: z.string(),
  severity: z.string().nullable(),
  decided_at: z.string().nullable(),
});

function toScenario(row: z.infer<typeof HuntScenarioRow>): HuntScenario {
  return {
    id: row.id,
    code: row.code,
    scenarioVersion: row.scenario_version,
    title: row.title,
    description: row.description,
    configuration:
      row.configuration && typeof row.configuration === "object" && !Array.isArray(row.configuration)
        ? (row.configuration as Record<string, unknown>)
        : {},
    html: row.html,
    rewardBadgeId: row.reward_badge_id,
    expectedFindings: row.expected_findings,
    state: row.state,
  };
}

function toDefect(row: z.infer<typeof HuntScenarioDefectRow>): HuntScenarioDefect {
  return {
    id: row.id,
    scenarioId: row.scenario_id,
    code: row.code,
    position: row.position,
    title: row.title,
    locationHint: row.location_hint,
    expectedBehaviour: row.expected_behaviour,
    reproduction: row.reproduction,
    severity: row.severity,
  };
}

function toFinding(row: z.infer<typeof HuntFindingRow>): HuntFinding {
  return {
    id: row.id,
    attemptId: row.attempt_id,
    submissionId: row.submission_id,
    scenarioId: row.scenario_id,
    reportedSummary: row.reported_summary,
    plantedCode: row.planted_code,
    verdict: (HUNT_VERDICTS as readonly string[]).includes(row.verdict)
      ? (row.verdict as HuntVerdict)
      : "pending",
    severity: row.severity,
    decidedAt: row.decided_at,
  };
}

const SCENARIO_COLUMNS =
  "id, code, scenario_version, title, description, configuration, html, " +
  "reward_badge_id, expected_findings, state";
const DEFECT_COLUMNS =
  "id, scenario_id, code, position, title, location_hint, expected_behaviour, " +
  "reproduction, severity";
const FINDING_COLUMNS =
  "id, attempt_id, submission_id, scenario_id, reported_summary, planted_code, verdict, severity, decided_at";

/* ── Scenarios ────────────────────────────────────────────────────────────── */

/**
 * The scenario a hunt task points at.
 *
 * The link is `tasks.source_system = 'arena'` + `tasks.external_id = code`, so
 * pointing a hunt at a different scenario is a content edit, never a migration.
 *
 * Returns `null` rather than an error when nothing matches: RLS scopes this to
 * active scenarios in a cohort the learner can reach, so "not found" and "not
 * yours" are deliberately indistinguishable to the caller.
 */
export async function getHuntScenarioByCode(
  code: string,
): Promise<Result<HuntScenario | null>> {
  const supabase = await createServerClient();
  const result = await fromSupabase<unknown[]>(async () => {
    const { data, error } = await supabase
      .from("hunt_scenarios")
      .select(SCENARIO_COLUMNS)
      .eq("code", code)
      .eq("state", "active")
      .order("scenario_version", { ascending: false })
      .limit(1);
    return { data: data as unknown[] | null, error };
  });
  if (!result.ok) return result;

  const parsed = HuntScenarioRow.safeParse(result.data[0]);
  return ok(parsed.success ? toScenario(parsed.data) : null);
}

/** Every scenario the caller may read. Authoring and admin screens. */
export async function listHuntScenarios(): Promise<Result<HuntScenario[]>> {
  const supabase = await createServerClient();
  const result = await fromSupabase<unknown[]>(async () => {
    const { data, error } = await supabase
      .from("hunt_scenarios")
      .select(SCENARIO_COLUMNS)
      .order("code", { ascending: true })
      .order("scenario_version", { ascending: false });
    return { data: data as unknown[] | null, error };
  });
  if (!result.ok) return result;

  const scenarios: HuntScenario[] = [];
  for (const row of result.data) {
    const parsed = HuntScenarioRow.safeParse(row);
    // Skip a malformed row rather than blanking the whole list. A scenario the
    // studio has half-authored should not take the page down with it.
    if (parsed.success) scenarios.push(toScenario(parsed.data));
  }
  return ok(scenarios);
}

/* ── Findings ─────────────────────────────────────────────────────────────── */

/** Every defect reported in one attempt. The student's own ticket list. */
export async function listHuntFindingsForAttempt(
  attemptId: string,
): Promise<Result<HuntFinding[]>> {
  const supabase = await createServerClient();
  const result = await fromSupabase<unknown[]>(async () => {
    const { data, error } = await supabase
      .from("hunt_findings")
      .select(FINDING_COLUMNS)
      .eq("attempt_id", attemptId)
      .order("created_at", { ascending: true });
    return { data: data as unknown[] | null, error };
  });
  if (!result.ok) return result;

  const findings: HuntFinding[] = [];
  for (const row of result.data) {
    const parsed = HuntFindingRow.safeParse(row);
    if (parsed.success) findings.push(toFinding(parsed.data));
  }
  return ok(findings);
}

/**
 * The findings attached to one submission — what the trainer's ground-truth
 * panel reads (decision D2). Scoped by `can_access_submission`, the same helper
 * that already governs the review screen.
 */
export async function listHuntFindingsForSubmission(
  submissionId: string,
): Promise<Result<HuntFinding[]>> {
  const supabase = await createServerClient();
  const result = await fromSupabase<unknown[]>(async () => {
    const { data, error } = await supabase
      .from("hunt_findings")
      .select(FINDING_COLUMNS)
      .eq("submission_id", submissionId)
      .order("created_at", { ascending: true });
    return { data: data as unknown[] | null, error };
  });
  if (!result.ok) return result;

  const findings: HuntFinding[] = [];
  for (const row of result.data) {
    const parsed = HuntFindingRow.safeParse(row);
    if (parsed.success) findings.push(toFinding(parsed.data));
  }
  return ok(findings);
}

/* ── Planted defects — the answer key ─────────────────────────────────────── */

/**
 * The planted defects for one scenario.
 *
 * ⚠️ **Staff only, and enforced in the database rather than here.**
 * `hunt_scenario_defects` carries exactly one RLS policy and it requires
 * `content.manage` or `review.manage`. A learner calling this gets an empty
 * array, not an error — so never branch on "empty means no defects" in a
 * learner-facing path, because for a learner it always will be.
 *
 * `expectedBehaviour` and `reproduction` are worked answers. They belong on the
 * trainer's review screen and the admin's authoring screen, and nowhere near
 * the sandbox iframe.
 */
export async function listHuntScenarioDefects(
  scenarioId: string,
): Promise<Result<HuntScenarioDefect[]>> {
  const supabase = await createServerClient();
  const result = await fromSupabase<unknown[]>(async () => {
    const { data, error } = await supabase
      .from("hunt_scenario_defects")
      .select(DEFECT_COLUMNS)
      .eq("scenario_id", scenarioId)
      .order("position", { ascending: true })
      .order("code", { ascending: true });
    return { data: data as unknown[] | null, error };
  });
  if (!result.ok) return result;

  const defects: HuntScenarioDefect[] = [];
  for (const row of result.data) {
    const parsed = HuntScenarioDefectRow.safeParse(row);
    // A malformed row is skipped rather than blanking the list, for the same
    // reason listHuntScenarios does it: a half-authored scenario should not
    // take the trainer's review panel down with it.
    if (parsed.success) defects.push(toDefect(parsed.data));
  }
  return ok(defects);
}

/** Defect counts per scenario, for the admin list. One query, not one per row. */
export async function countDefectsByScenario(): Promise<Result<Map<string, number>>> {
  const supabase = await createServerClient();
  const result = await fromSupabase<unknown[]>(async () => {
    const { data, error } = await supabase
      .from("hunt_scenario_defects")
      .select("scenario_id");
    return { data: data as unknown[] | null, error };
  });
  if (!result.ok) return result;

  const counts = new Map<string, number>();
  for (const row of result.data) {
    const id = (row as { scenario_id?: unknown }).scenario_id;
    if (typeof id === "string") counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return ok(counts);
}

/* ── Badge catalogue, for the scenario editor's picker ────────────────────── */

export interface AwardableBadge {
  id: string;
  code: string;
  label: string;
}

/**
 * The badges a scenario may be pinned to.
 *
 * Active only: an archived badge is one the product has retired, and offering
 * it in the picker would let an author promise something that is never awarded
 * — `award_scenario_badge` skips a badge that is not active.
 *
 * `badges_member_read` scopes this to global badges plus the caller's own
 * organisation, so no extra filter is needed here.
 */
export async function listAwardableBadges(locale: string): Promise<Result<AwardableBadge[]>> {
  const supabase = await createServerClient();
  const result = await fromSupabase<unknown[]>(async () => {
    const { data, error } = await supabase
      .from("badges")
      .select("id, code, labels")
      .eq("state", "active")
      .order("code");
    return { data: data ?? null, error };
  });
  if (!result.ok) return result;

  const rows = z
    .array(z.object({ id: z.string(), code: z.string(), labels: z.unknown() }))
    .safeParse(result.data);
  if (!rows.success) return ok([]);

  return ok(
    rows.data.map((row) => {
      const labels = (row.labels ?? {}) as Record<string, string>;
      // German is the source of truth for the catalogue; fall back to the code
      // so an untranslated badge is still pickable rather than blank.
      return { id: row.id, code: row.code, label: labels[locale] ?? labels.de ?? row.code };
    })
  );
}

/* ── Re-exports, so callers import from one place ─────────────────────────── */

export {
  HUNT_VERDICTS,
  LOCK_REASON_CODES,
  arenaHubHref,
  countsAsFound,
  gateQuestionLock,
  huntPrerequisite,
  huntProgress,
  huntScenarioLock,
  huntTaskHref,
  isPending,
  toLockReason,
  toLockReasons,
} from "@/features/arena/model";
export type {
  HuntFinding,
  HuntScenario,
  HuntScenarioDefect,
  HuntVerdict,
  LockReason,
  LockReasonCode,
} from "@/features/arena/model";
