import "server-only";

import { z } from "zod";
import { createServerClient } from "@/shared/database/server";
import { fromSupabase, ok, type Result } from "@/shared/data/result";
import { DefectReportSchema, EMPTY_DEFECT, type DefectReport } from "@/features/learning/model";
import { HUNT_VERDICTS, type HuntFinding, type HuntVerdict } from "@/features/arena/model";
import { readPlantedDefects, type PlantedDefect } from "./matching";

/**
 * Ticket data access.
 *
 * **Why this exists next to `src/shared/data/arena.ts` rather than inside it.**
 * That module is WS-8's, and its `HuntFinding` type predates
 * `hunt_findings.reported_details` — the column WS-10 added in
 * `20260724300000` to carry the structured report. WS-10 may not edit WS-8's
 * files, so the ticket-shaped read lives here and *composes* WS-8's type
 * instead of forking it: a `HuntTicket` is a `HuntFinding` plus the report.
 * When WS-13 does its consistency pass, the two can merge with no call-site
 * churn, because nothing here redefines what WS-8 already defined.
 *
 * The same two rules the rest of the data layer runs on apply:
 *  * **Never `.from(x).insert()`** — `hunt_findings` has no INSERT policy at
 *    all. Writes go through the trigger (on submit) and
 *    `decide_hunt_finding` (on review).
 *  * **Never send a stale expected version** — a stale one HANGS on this
 *    deployment rather than erroring (I-007 / I-009). Read `rowVersion`
 *    immediately before the call that uses it.
 */

/* ── Rows ─────────────────────────────────────────────────────────────────── */

const TicketRow = z.object({
  id: z.string(),
  attempt_id: z.string(),
  submission_id: z.string().nullable(),
  scenario_id: z.string().nullable(),
  reported_summary: z.string(),
  reported_details: z.unknown(),
  planted_code: z.string().nullable(),
  verdict: z.string(),
  severity: z.string().nullable(),
  decided_at: z.string().nullable(),
  row_version: z.number(),
  created_at: z.string(),
});

const TICKET_COLUMNS =
  "id, attempt_id, submission_id, scenario_id, reported_summary, reported_details, " +
  "planted_code, verdict, severity, decided_at, row_version, created_at";

/** WS-8's finding, plus the report it was filed as and the version to write against. */
export interface HuntTicket extends HuntFinding {
  /**
   * The structured report exactly as the learner filed it.
   *
   * Falls back to `EMPTY_DEFECT` for a row written before
   * `20260724300000`, or one whose draft was gone at submit time — so callers
   * never have to null-check a field. `reportedSummary` is still populated in
   * that case, because the trigger falls back to the answer text.
   */
  report: DefectReport;
  /** `p_expected_version` for `decide_hunt_finding`. */
  rowVersion: number;
  createdAt: string;
}

function toTicket(row: z.infer<typeof TicketRow>): HuntTicket {
  // safeParse, not parse: every DefectReport field carries a default, so a row
  // written before WS-10's fields existed fills them in rather than throwing.
  // A ticket that fails outright still renders from reported_summary.
  const parsed = DefectReportSchema.safeParse(row.reported_details);

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
    report: parsed.success ? parsed.data : EMPTY_DEFECT,
    rowVersion: row.row_version,
    createdAt: row.created_at,
  };
}

/* ── Reads ────────────────────────────────────────────────────────────────── */

/**
 * Every ticket filed against one submission — what the trainer's ground-truth
 * panel reads.
 *
 * Scoped by WS-8's `hunt_findings_scoped_read`, which admits the learner who
 * owns the attempt *and* anyone who may access the submission. That is
 * deliberately the same audience the ticket view has, and deliberately **wider
 * than** who may *decide* a ticket — `decide_hunt_finding` re-checks that
 * separately with `decide_submission`'s own pair of checks. Reading a ticket
 * and grading it are not the same permission.
 */
export async function listTicketsForSubmission(
  submissionId: string,
): Promise<Result<HuntTicket[]>> {
  const supabase = await createServerClient();
  const result = await fromSupabase<unknown[]>(async () => {
    const { data, error } = await supabase
      .from("hunt_findings")
      .select(TICKET_COLUMNS)
      .eq("submission_id", submissionId)
      .order("created_at", { ascending: true });
    return { data: data as unknown[] | null, error };
  });
  if (!result.ok) return result;

  const tickets: HuntTicket[] = [];
  for (const row of result.data) {
    const parsed = TicketRow.safeParse(row);
    // Skip a malformed row rather than blanking the panel. One bad ticket must
    // not cost the trainer the other four.
    if (parsed.success) tickets.push(toTicket(parsed.data));
  }
  return ok(tickets);
}

/** The learner's own tickets for one attempt. Their side of the same view. */
export async function listTicketsForAttempt(
  attemptId: string,
): Promise<Result<HuntTicket[]>> {
  const supabase = await createServerClient();
  const result = await fromSupabase<unknown[]>(async () => {
    const { data, error } = await supabase
      .from("hunt_findings")
      .select(TICKET_COLUMNS)
      .eq("attempt_id", attemptId)
      .order("created_at", { ascending: true });
    return { data: data as unknown[] | null, error };
  });
  if (!result.ok) return result;

  const tickets: HuntTicket[] = [];
  for (const row of result.data) {
    const parsed = TicketRow.safeParse(row);
    if (parsed.success) tickets.push(toTicket(parsed.data));
  }
  return ok(tickets);
}

/**
 * The ground truth behind a hunt task: the planted defects and how many count.
 *
 * Resolved through `tasks.source_system = 'arena'` + `tasks.external_id`, which
 * is what makes pointing a hunt at a different scenario a content edit rather
 * than a migration.
 *
 * ⚠️ Returns an EMPTY list rather than an error when nothing matches, and that
 * is the normal case today: `hunt_scenarios` had zero rows when WS-10 was
 * built — WS-9 seeds it. The trainer panel must therefore be useful with no
 * ground truth at all, showing the report and the field checklist and simply
 * omitting the suggestions.
 */
export async function getScenarioGroundTruth(scenarioCode: string): Promise<
  Result<{ planted: PlantedDefect[]; expectedFindings: number; title: string } | null>
> {
  const supabase = await createServerClient();
  const result = await fromSupabase<unknown[]>(async () => {
    const { data, error } = await supabase
      .from("hunt_scenarios")
      .select("title, configuration, expected_findings")
      .eq("code", scenarioCode)
      .eq("state", "active")
      .order("scenario_version", { ascending: false })
      .limit(1);
    return { data: data as unknown[] | null, error };
  });
  if (!result.ok) return result;

  const row = result.data[0] as
    | { title?: unknown; configuration?: unknown; expected_findings?: unknown }
    | undefined;
  if (!row) return ok(null);

  const configuration =
    row.configuration && typeof row.configuration === "object" && !Array.isArray(row.configuration)
      ? (row.configuration as Record<string, unknown>)
      : {};

  return ok({
    planted: readPlantedDefects(configuration),
    expectedFindings:
      typeof row.expected_findings === "number" ? row.expected_findings : 0,
    // Course material, German only (CONTENT_LOCALES === ["de"]).
    title: typeof row.title === "string" ? row.title : "",
  });
}
