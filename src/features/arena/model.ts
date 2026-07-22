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
  /**
   * Phase 1c added these two, and they are the gate chain from
   * FEATURE_BUILD_PLAN §1.6.
   *
   * `required_hunt` — this course task is waiting on an Arena scenario whose
   * hunt the learner has not had ACCEPTED yet. Carries `scenario_code` and
   * `scenario_title`.
   *
   * `gate_question` — the PREVIOUS task's pre-task question has not been
   * answered. Carries `previous_task_id` and `previous_task_title`.
   *
   * ⚠️ They are separate reasons on purpose and both can be present at once.
   * §1.6: the next task stays locked until the question is answered "even if
   * its own Arena task is already approved". Collapsing them into one would
   * tell a learner about whichever the code happened to check first and leave
   * them stuck on the other.
   */
  "required_hunt",
  "gate_question",
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
  /** `required_hunt` — which Arena scenario opens this task. */
  scenario_code: z.string().nullish(),
  scenario_title: z.string().nullish(),
  /** `gate_question` — whose question is still unanswered. */
  previous_task_id: z.string().nullish(),
  previous_task_title: z.string().nullish(),
});

export type LockReasonRow = z.infer<typeof LockReasonSchema>;

export interface LockReason {
  code: LockReasonCode | string;
  requiredTaskId: string | null;
  requiredTaskKind: string | null;
  requiredTaskTitle: string | null;
  scenarioCode: string | null;
  scenarioTitle: string | null;
  previousTaskId: string | null;
  previousTaskTitle: string | null;
}

/** Every enriched field, absent. Keeps the construction sites below in step. */
const EMPTY_LOCK_DETAIL = {
  requiredTaskId: null,
  requiredTaskKind: null,
  requiredTaskTitle: null,
  scenarioCode: null,
  scenarioTitle: null,
  previousTaskId: null,
  previousTaskTitle: null,
} as const;

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
    return { code: value, ...EMPTY_LOCK_DETAIL };
  }

  /**
   * ⭐ **Idempotent on purpose, and it was not.** An already-normalised
   * `LockReason` carries `requiredTaskId`; the schema below reads
   * `required_task_id`. Both keys are `nullish`, so re-normalising a normalised
   * reason **parsed successfully and silently returned nulls** — no error, no
   * warning, just a lock reason that had forgotten which task it was waiting on.
   *
   * That is exactly what happened once `shared/data/learning.ts` started
   * normalising at the boundary: `huntPrerequisite` then found no
   * `requiredTaskId` and the unlock link stopped rendering, while the lock
   * text beside it kept working. A normaliser that is not idempotent is a trap
   * for its second caller, so this one now recognises its own output.
   */
  if (value && typeof value === "object" && "requiredTaskId" in value) {
    const already = value as Partial<LockReason>;
    if (typeof already.code === "string") {
      return {
        code: already.code,
        requiredTaskId: already.requiredTaskId ?? null,
        requiredTaskKind: already.requiredTaskKind ?? null,
        requiredTaskTitle: already.requiredTaskTitle ?? null,
        // Carried through for the same reason the three above are: an
        // already-normalised reason that loses these on a second pass is the
        // non-idempotence trap documented above, and it would take the unlock
        // link with it.
        scenarioCode: already.scenarioCode ?? null,
        scenarioTitle: already.scenarioTitle ?? null,
        previousTaskId: already.previousTaskId ?? null,
        previousTaskTitle: already.previousTaskTitle ?? null,
      };
    }
  }

  const parsed = LockReasonSchema.safeParse(value);
  if (!parsed.success) return null;
  return {
    code: parsed.data.code,
    requiredTaskId: parsed.data.required_task_id ?? null,
    requiredTaskKind: parsed.data.required_task_kind ?? null,
    requiredTaskTitle: parsed.data.required_task_title ?? null,
    scenarioCode: parsed.data.scenario_code ?? null,
    scenarioTitle: parsed.data.scenario_title ?? null,
    previousTaskId: parsed.data.previous_task_id ?? null,
    previousTaskTitle: parsed.data.previous_task_title ?? null,
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

/**
 * A COURSE task's own page. Named for what it is, because it is also used for
 * the gate-question link, which points at a knowledge task and must not be
 * dragged into the Arena when `arenaHuntHref` changes.
 */
export function learningTaskHref(locale: string, taskId: string): string {
  return `/${locale}/learn/tasks/${taskId}`;
}

/**
 * Where an Arena task is played (§5.5: "an Arena row sends the learner to
 * Arena").
 *
 * A hunt is a `tasks` row like any other, so for a long time this returned the
 * ordinary task route — and a learner who clicked a Jagd in the Arena landed on
 * a page headed **Aufgabe**. The workspace is still what renders underneath;
 * what changes here is that the hunt keeps an Arena URL and Arena framing all
 * the way through, so "Arena tasks are worked in the Arena" is true of the
 * address bar and the breadcrumb, not only of the intent.
 */
export function arenaHuntHref(locale: string, taskId: string): string {
  return `/${locale}/learn/arena/${taskId}`;
}

/**
 * @deprecated Ambiguous — it was used both for hunts and for course tasks.
 * Use {@link arenaHuntHref} for a hunt and {@link learningTaskHref} otherwise.
 */
export function huntTaskHref(locale: string, taskId: string): string {
  return arenaHuntHref(locale, taskId);
}

/**
 * The Phase 1c Arena gate: this task is waiting on a hunt of a named SCENARIO,
 * not on a particular task.
 *
 * Distinct from `huntPrerequisite` above, which reads the older
 * `required_task` reason where the gate points at one specific hunt task in the
 * same course. `required_hunt` points at a scenario code and is satisfied by an
 * accepted hunt of that scenario anywhere — the Arena is a cross-course
 * practice ground, and a learner who has already found the planted defects in
 * `checkout-v1` should not have to repeat the identical screen.
 *
 * That is also why there is no task id here to link to: the hunt that satisfies
 * it may not be in this course at all, so the Arena hub is the honest
 * destination.
 */
export function huntScenarioLock(reasons: unknown): LockReason | null {
  return toLockReasons(reasons).find((r) => r.code === "required_hunt") ?? null;
}

/** Straight to the Arena hub, which lists the hunts open to this learner. */
export function arenaHubHref(locale: string): string {
  return `/${locale}/learn/arena`;
}

/**
 * The pre-task question gate. §1.6: a skipped question does not block its own
 * task, it blocks progression PAST it — so this reason always names the
 * PREVIOUS task, and the link goes there rather than to the locked task.
 */
export function gateQuestionLock(reasons: unknown): LockReason | null {
  return toLockReasons(reasons).find((r) => r.code === "gate_question") ?? null;
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
  /**
   * Phase 1c. Free-form HTML/CSS/JS written by an admin, rendered in an iframe
   * with `sandbox="allow-scripts"` and nothing else.
   *
   * `null` means this scenario is rendered by the component-registry engine
   * from `configuration.surfaces` instead. The two modes are mutually
   * exclusive and the database enforces it for an active scenario
   * (`hunt_scenarios_one_render_mode`).
   */
  html: string | null;
  /**
   * Optional badge, awarded once when a submission for this hunt is accepted.
   *
   * `null` is the normal case and the default. Every other badge in the product
   * is a threshold ("five confirmed findings"); this is the one an author can
   * pin to a specific scenario. Not every hunt should carry one — a badge per
   * task is how a wall of badges stops meaning anything.
   *
   * Replaces `startMediaUrl` / `endMediaUrl`, which the authoring form wrote
   * and no screen anywhere ever rendered.
   */
  rewardBadgeId: string | null;
  expectedFindings: number;
  state: string;
}

/**
 * One planted defect, as the trainer grades against it.
 *
 * ⚠️ NEVER send this to a learner and never into the sandbox iframe.
 * `expectedBehaviour` and `reproduction` are the worked answers — the whole
 * hunt becomes a reading exercise if they leak. The database enforces it:
 * `hunt_scenario_defects` has exactly one policy and it requires
 * `content.manage` or `review.manage`.
 */
export interface HuntScenarioDefect {
  id: string;
  scenarioId: string;
  code: string;
  position: number;
  title: string;
  locationHint: string;
  expectedBehaviour: string;
  reproduction: string;
  severity: string;
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
