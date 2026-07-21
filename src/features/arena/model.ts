import { z } from "zod";

/**
 * The Bug Arena domain model — types and pure helpers, with **no server
 * imports**.
 *
 * Same split, and the same reason, as `src/features/learning/model.ts`:
 * `src/shared/data/arena.ts` is `server-only`, and the sandbox and ticket
 * screens are Client Components that need these at runtime. Importing them from
 * the data module drags `next/headers` into the browser bundle and the route
 * 500s. WS-9, WS-10 and WS-11 should import types from here and data functions
 * from there.
 */

/* ── Lock reasons ─────────────────────────────────────────────────────────── */

/**
 * ⚠️ The code is `required_task`. Both design documents call it
 * `prerequisite`; that code has never existed in this database — see
 * `plan/status/ISSUES.md` I-037. The full set the lock-reason function can
 * emit is below; anything else means the content is misconfigured.
 */
export const LOCK_REASON_CODES = [
  "schedule",
  "entitlement",
  "configuration",
  "required_task",
  "required_skill",
] as const;

export type LockReasonCode = (typeof LOCK_REASON_CODES)[number];

/**
 * WS-8 widened the `required_task` reason so a lock chip can become a button
 * that sends the learner to the hunt that opens the task (05_… §G8).
 *
 * Every enriched field is read from the learner's own published snapshot, so
 * none of it discloses content they are not already allowed to see.
 */
export const LockReasonSchema = z.object({
  code: z.string(),
  required_task_id: z.string().nullish(),
  required_task_kind: z.string().nullish(),
  required_task_title: z.string().nullish(),
  current_basis_points: z.number().nullish(),
  minimum_basis_points: z.number().nullish(),
});

export type LockReasonRow = z.infer<typeof LockReasonSchema>;

export interface LockReason {
  code: LockReasonCode | string;
  requiredTaskId: string | null;
  requiredTaskKind: string | null;
  requiredTaskTitle: string | null;
}

/**
 * Normalises one lock reason.
 *
 * Accepts a bare string as well as an object, because the reason list has been
 * typed as `string[]` in `features/learning/model.ts` since WS-2 while the RPC
 * has always returned objects. Rather than make every caller guess, both shapes
 * resolve here.
 */
export function toLockReason(value: unknown): LockReason | null {
  if (typeof value === "string") {
    return { code: value, requiredTaskId: null, requiredTaskKind: null, requiredTaskTitle: null };
  }
  const parsed = LockReasonSchema.safeParse(value);
  if (!parsed.success) return null;
  return {
    code: parsed.data.code,
    requiredTaskId: parsed.data.required_task_id ?? null,
    requiredTaskKind: parsed.data.required_task_kind ?? null,
    requiredTaskTitle: parsed.data.required_task_title ?? null,
  };
}

export function toLockReasons(value: unknown): LockReason[] {
  if (!Array.isArray(value)) return [];
  return value.map(toLockReason).filter((r): r is LockReason => r !== null);
}

/**
 * The reason a task is waiting on a hunt, if it is. This is what turns
 * "🔒 Gesperrt" into "🔒 Gesperrt — Jagd spielen, um freizuschalten →".
 */
export function huntPrerequisite(reasons: unknown): LockReason | null {
  return (
    toLockReasons(reasons).find(
      (r) => r.code === "required_task" && r.requiredTaskKind === "hunt" && r.requiredTaskId,
    ) ?? null
  );
}

/** Where that button goes. A hunt is a task, so it lives on the task route. */
export function huntTaskHref(locale: string, taskId: string): string {
  return `/${locale}/learn/tasks/${taskId}`;
}

/* ── Scenarios ────────────────────────────────────────────────────────────── */

/**
 * ⚠️ `title` and `description` are COURSE MATERIAL and therefore German only
 * (`CONTENT_LOCALES === ["de"]`). They are plain strings, not localized maps.
 * Do not wrap them in a locale picker.
 */
export interface HuntScenario {
  id: string;
  code: string;
  scenarioVersion: number;
  title: string;
  description: string;
  /** WS-9 owns this shape and documents it in features/arena/sandbox/README.md. */
  configuration: Record<string, unknown>;
  expectedFindings: number;
  state: string;
}

/* ── Findings ─────────────────────────────────────────────────────────────── */

/**
 * `bonus` is deliberate: a student who finds a real bug we did not plant should
 * score MORE than one who finds a planted one, not be marked wrong.
 */
export const HUNT_VERDICTS = [
  "pending",
  "confirmed",
  "duplicate",
  "invalid",
  "bonus",
] as const;

export type HuntVerdict = (typeof HUNT_VERDICTS)[number];

export interface HuntFinding {
  id: string;
  attemptId: string;
  submissionId: string | null;
  scenarioId: string | null;
  reportedSummary: string;
  /** The planted defect a trainer confirmed this matches. Null = unplanted. */
  plantedCode: string | null;
  verdict: HuntVerdict;
  severity: string | null;
  decidedAt: string | null;
}

/** A finding that counts towards the scenario's `expectedFindings`. */
export function countsAsFound(finding: HuntFinding): boolean {
  return finding.verdict === "confirmed" || finding.verdict === "bonus";
}

/**
 * "2 von 5 gefunden" — the ground-truth summary decision D2 promises the
 * trainer. Bonus findings count as found but are NOT capped by the planted
 * total, so a learner can exceed it; that is the intended message, not a bug.
 */
export function huntProgress(
  findings: HuntFinding[],
  expectedFindings: number,
): { found: number; expected: number; complete: boolean } {
  const found = findings.filter(countsAsFound).length;
  return { found, expected: expectedFindings, complete: found >= expectedFindings };
}

/** Still awaiting a trainer. Drives the "offene Jagden" count. */
export function isPending(finding: HuntFinding): boolean {
  return finding.verdict === "pending";
}
