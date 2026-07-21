import "server-only";

import { z } from "zod";
import { createServerClient } from "@/shared/database/server";
import { mapPostgrestError, ok, err, type DataError, type Result } from "./result";

/**
 * WS-4's data layer. Every trainer read and write goes through here.
 *
 * Three things measured against the live database that contradict the plan —
 * the detail is in plan/status/WS-4.md and ISSUES.md I-016…I-019:
 *
 *  1. `get_submission_review_context` returns ONLY the task title, the
 *     assessment options and the rubric. The learner's answer, the evidence,
 *     the hints and the timings all come from tables.
 *  2. `decide_submission` needs a NON-EMPTY ARRAY of rubric scores, a non-blank
 *     comment, and an idempotency key of 16–200 characters. `{}` always fails.
 *  3. A trainer session reads 0 `enrollments`, so cohort progress is built from
 *     `cohort_memberships`.
 */

/* ── Localized helpers ──────────────────────────────────────────────────── */

/** Snapshot and rubric text comes back as {de,en,ru}. A key can be missing. */
export type LocalizedText = Partial<Record<string, string>>;

export function pick(map: LocalizedText | null | undefined, locale: string): string {
  if (!map) return "";
  return map[locale] || map.de || map.en || Object.values(map).find(Boolean) || "";
}

/* ── Error mapping ──────────────────────────────────────────────────────── */

/**
 * The review RPCs raise domain messages that `mapPostgrestError` does not know:
 * 40001 for a concurrent decision, and a family of 42501/22023 texts. WF-3's
 * "a concurrent decision by two trainers is detected and reported" acceptance
 * criterion is satisfied here.
 */
export function mapReviewError(error: { code?: string; message?: string } | null): DataError {
  const message = error?.message ?? "";

  if (error?.code === "40001" || /stale|not reviewable|not transferable|became stale|latest submission version/i.test(message)) {
    return {
      code: "CONFLICT",
      message:
        "Diese Abgabe wurde inzwischen von jemand anderem bearbeitet. Bitte laden Sie die Seite neu.",
      retryable: true,
    };
  }
  if (/ownership changed/i.test(message)) {
    return {
      code: "OWNERSHIP",
      message: "Diese Abgabe wurde inzwischen an eine andere Person übergeben.",
      retryable: false,
    };
  }
  if (/no active rubric/i.test(message)) {
    return {
      code: "NO_RUBRIC",
      message:
        "Für diese Aufgabe ist kein aktiver Bewertungsbogen hinterlegt. Eine Entscheidung ist nicht möglich.",
      retryable: false,
    };
  }
  if (/criterion scores|required rubric criterion|outside the assigned rubric/i.test(message)) {
    return {
      code: "RUBRIC_SCORES",
      message: "Bitte bewerten Sie alle Pflichtkriterien mit einer gültigen Punktzahl.",
      retryable: false,
    };
  }
  if (/comment/i.test(message)) {
    return { code: "COMMENT_REQUIRED", message: "Ein Kommentar ist erforderlich.", retryable: false };
  }
  if (/target trainer is not active/i.test(message)) {
    return {
      code: "BAD_TARGET",
      message: "Diese Person ist keine aktive Trainerin oder kein aktiver Trainer dieser Gruppe.",
      retryable: false,
    };
  }
  if (/scope denied/i.test(message)) {
    return { code: "42501", message: "Keine Berechtigung für diese Abgabe.", retryable: false };
  }
  return mapPostgrestError(error as never);
}

/** Every mutation in this database needs a 16–200 character key (ISSUES I-016). */
export function idempotencyKey(operation: string, id: string, version: number): string {
  return `ws4-${operation}-${id}-v${version}`;
}

/* ── Shared row shapes ──────────────────────────────────────────────────── */

const SubmissionVersionSchema = z.object({
  id: z.string(),
  version_number: z.number(),
  answer_text: z.string().nullable().default(""),
  selected_option_ids: z.array(z.string()).nullable().default([]),
  evidence_refs: z.array(z.string()).nullable().default([]),
  elapsed_seconds: z.number().nullable().default(0),
  hint_used: z.boolean().nullable().default(false),
  submitted_at: z.string(),
  submitted_by: z.string().nullable().default(null),
  task_snapshot: z.unknown().nullable().default(null),
});

const SubmissionRowSchema = z.object({
  id: z.string(),
  state: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
  learner_id: z.string(),
  task_id: z.string(),
  cohort_id: z.string(),
  course_id: z.string(),
  attempt_id: z.string(),
  latest_version_number: z.number(),
  row_version: z.number(),
  submission_versions: z.array(SubmissionVersionSchema).default([]),
});

const SUBMISSION_SELECT =
  "id,state,created_at,updated_at,learner_id,task_id,cohort_id,course_id,attempt_id," +
  "latest_version_number,row_version," +
  "submission_versions(id,version_number,answer_text,selected_option_ids,evidence_refs," +
  "elapsed_seconds,hint_used,submitted_at,submitted_by,task_snapshot)";

/** Open work only. `accepted` and `withdrawn` have left the queue. */
export const OPEN_SUBMISSION_STATES = ["submitted", "resubmitted", "revision_required"] as const;

const SUBMISSION_STATES = [
  "submitted",
  "resubmitted",
  "revision_required",
  "accepted",
  "withdrawn",
] as const;
export type SubmissionState = (typeof SUBMISSION_STATES)[number];

/** A URL filter is a string from the outside world — narrow it or drop it. */
export function asSubmissionState(value: string | undefined): SubmissionState | undefined {
  return SUBMISSION_STATES.find((state) => state === value);
}

const QUESTION_STATES = ["open", "assigned", "answered", "transferred", "archived"] as const;
export type QuestionState = (typeof QUESTION_STATES)[number];

export function asQuestionState(value: string | undefined): QuestionState | undefined {
  return QUESTION_STATES.find((state) => state === value);
}

export interface QueueItem {
  id: string;
  state: string;
  learnerId: string;
  learnerName: string;
  taskId: string;
  taskTitle: string;
  cohortId: string;
  cohortName: string;
  submittedAt: string;
  waitingHours: number;
  attemptNumber: number;
  hintUsed: boolean;
  elapsedSeconds: number;
  evidenceCount: number;
  rowVersion: number;
}

export interface QueuePage {
  items: QueueItem[];
  total: number;
  cohorts: { id: string; name: string }[];
}

/* ── Small shared readers ───────────────────────────────────────────────── */

type Supabase = Awaited<ReturnType<typeof createServerClient>>;

async function readProfiles(supabase: Supabase, userIds: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(userIds)].filter(Boolean);
  if (unique.length === 0) return new Map();
  const { data } = await supabase.from("profiles").select("user_id,display_name").in("user_id", unique);
  return new Map((data ?? []).map((row) => [row.user_id, row.display_name]));
}

async function readCohorts(supabase: Supabase): Promise<Map<string, string>> {
  const { data } = await supabase.from("cohorts").select("id,name");
  return new Map((data ?? []).map((row) => [row.id, row.name]));
}

/**
 * The snapshot frozen into a submission has no title, so titles come from
 * `task_localizations` — which a trainer can read, unlike a student.
 */
async function readTaskTitles(
  supabase: Supabase,
  taskIds: string[],
  locale: string
): Promise<Map<string, string>> {
  const unique = [...new Set(taskIds)].filter(Boolean);
  if (unique.length === 0) return new Map();
  const { data } = await supabase
    .from("task_localizations")
    .select("task_id,locale,title")
    .in("task_id", unique);

  const byTask = new Map<string, Map<string, string>>();
  for (const row of data ?? []) {
    const entry = byTask.get(row.task_id) ?? new Map<string, string>();
    entry.set(row.locale, row.title);
    byTask.set(row.task_id, entry);
  }
  return new Map(
    [...byTask].map(([taskId, byLocale]) => [
      taskId,
      byLocale.get(locale) || byLocale.get("de") || byLocale.get("en") || [...byLocale.values()][0] || "",
    ])
  );
}

function latestVersion(row: z.infer<typeof SubmissionRowSchema>) {
  return (
    row.submission_versions.find((v) => v.version_number === row.latest_version_number) ??
    row.submission_versions.at(-1) ??
    null
  );
}

export function hoursSince(iso: string): number {
  return (Date.now() - new Date(iso).getTime()) / 3_600_000;
}

/* ── The review queue ───────────────────────────────────────────────────── */

export interface QueueFilters {
  locale: string;
  state?: SubmissionState | undefined;
  cohortId?: string | undefined;
  /** Oldest first is the default — the queue is a FIFO of people waiting. */
  sort?: "oldest" | "newest" | undefined;
  limit?: number | undefined;
  offset?: number | undefined;
}

export async function listReviewQueue(filters: QueueFilters): Promise<Result<QueuePage>> {
  const limit = filters.limit ?? 25;
  const offset = filters.offset ?? 0;

  try {
    const supabase = await createServerClient();

    let query = supabase
      .from("submissions")
      .select(SUBMISSION_SELECT, { count: "exact" })
      .order("created_at", { ascending: filters.sort !== "newest" })
      .range(offset, offset + limit - 1);

    if (filters.state) query = query.eq("state", filters.state);
    else query = query.in("state", [...OPEN_SUBMISSION_STATES]);
    if (filters.cohortId) query = query.eq("cohort_id", filters.cohortId);

    const { data, error, count } = await query;
    if (error) return err(mapReviewError(error));

    const rows = z.array(SubmissionRowSchema).parse(data ?? []);
    const [profiles, cohorts, titles, attempts] = await Promise.all([
      readProfiles(supabase, rows.map((r) => r.learner_id)),
      readCohorts(supabase),
      readTaskTitles(supabase, rows.map((r) => r.task_id), filters.locale),
      readAttemptNumbers(supabase, rows.map((r) => r.attempt_id)),
    ]);

    const items: QueueItem[] = rows.map((row) => {
      const version = latestVersion(row);
      const submittedAt = version?.submitted_at ?? row.created_at;
      return {
        id: row.id,
        state: row.state,
        learnerId: row.learner_id,
        learnerName: profiles.get(row.learner_id) ?? "—",
        taskId: row.task_id,
        taskTitle: titles.get(row.task_id) || "—",
        cohortId: row.cohort_id,
        cohortName: cohorts.get(row.cohort_id) ?? "—",
        submittedAt,
        waitingHours: hoursSince(submittedAt),
        attemptNumber: attempts.get(row.attempt_id) ?? row.latest_version_number,
        hintUsed: version?.hint_used ?? false,
        elapsedSeconds: version?.elapsed_seconds ?? 0,
        evidenceCount: version?.evidence_refs?.length ?? 0,
        rowVersion: row.row_version,
      };
    });

    return ok({
      items,
      total: count ?? items.length,
      cohorts: [...cohorts].map(([id, name]) => ({ id, name })),
    });
  } catch (cause) {
    return err(unexpected(cause));
  }
}

async function readAttemptNumbers(
  supabase: Supabase,
  attemptIds: string[]
): Promise<Map<string, number>> {
  const unique = [...new Set(attemptIds)].filter(Boolean);
  if (unique.length === 0) return new Map();
  const { data } = await supabase.from("attempts").select("id,sequence_number").in("id", unique);
  return new Map((data ?? []).map((row) => [row.id, row.sequence_number]));
}

/* ── The review detail ──────────────────────────────────────────────────── */

const RubricCriterionSchema = z.object({
  id: z.string(),
  code: z.string().nullable().default(null),
  labels: z.record(z.string(), z.string()).nullable().default({}),
  position: z.number().nullable().default(0),
  max_points: z.number(),
  required_for_acceptance: z.boolean().nullable().default(false),
  skill_id: z.string().nullable().default(null),
});

const ReviewContextSchema = z.object({
  content_version_id: z.string().nullable().default(null),
  submission_version_id: z.string(),
  task_title: z.string().nullable().default(""),
  options: z
    .array(z.object({ id: z.string(), labels: z.record(z.string(), z.string()).nullable().default({}) }))
    .default([]),
  rubric: z
    .object({
      id: z.string().nullable().default(null),
      labels: z.record(z.string(), z.string()).nullable().default({}),
      version: z.number().nullable().default(null),
      criteria: z.array(RubricCriterionSchema).default([]),
    })
    .nullable()
    .default(null),
});

export interface RubricCriterion {
  id: string;
  code: string | null;
  label: string;
  maxPoints: number;
  required: boolean;
}

export interface EvidenceItem {
  id: string;
  title: string;
  sourceUri: string | null;
  kind: string;
  capturedAt: string;
}

export interface PastDecision {
  id: string;
  decision: string;
  comment: string;
  createdAt: string;
  reviewerName: string;
}

export interface ReviewDetail {
  id: string;
  state: string;
  rowVersion: number;
  submissionVersionId: string;
  versionNumber: number;
  attemptNumber: number;
  createdAt: string;
  submittedAt: string;

  learnerId: string;
  learnerName: string;
  cohortId: string;
  cohortName: string;
  cohortState: string;

  taskId: string;
  taskTitle: string;
  taskInstructionsHtml: string;
  taskKind: string;
  targetUrl: string | null;
  assessmentQuestion: string;

  answerText: string;
  selectedOptions: { id: string; label: string; selected: boolean }[];
  elapsedSeconds: number;
  hintUsed: boolean;
  hintsUsed: string[];
  evidence: EvidenceItem[];

  rubricTitle: string;
  criteria: RubricCriterion[];
  pastDecisions: PastDecision[];
  /** false when the database will refuse a decision — the bar renders disabled. */
  decidable: boolean;
}

export async function getReviewDetail(
  submissionId: string,
  locale: string
): Promise<Result<ReviewDetail>> {
  try {
    const supabase = await createServerClient();

    const [{ data: contextData, error: contextError }, { data: submissionData, error: submissionError }] =
      await Promise.all([
        supabase.rpc("get_submission_review_context" as never, {
          p_submission_id: submissionId,
          p_locale: locale,
        } as never),
        supabase.from("submissions").select(SUBMISSION_SELECT).eq("id", submissionId).maybeSingle(),
      ]);

    if (contextError) return err(mapReviewError(contextError));
    if (submissionError) return err(mapReviewError(submissionError));
    // A forbidden or unknown id comes back as null with NO error (I-017).
    if (!contextData || !submissionData) {
      return err({
        code: "PGRST116",
        message: "Diese Abgabe existiert nicht oder ist für Sie nicht sichtbar.",
        retryable: false,
      });
    }

    const context = ReviewContextSchema.parse(contextData);
    const submission = SubmissionRowSchema.parse(submissionData);
    const version = latestVersion(submission);

    const snapshot = (version?.task_snapshot ?? {}) as {
      task_kind?: string;
      target_url?: string | null;
      assessment?: { question_translations?: LocalizedText };
    };

    const [profiles, cohorts, instructions, evidence, hints, decisions, attempts, cohortStates] =
      await Promise.all([
        readProfiles(supabase, [submission.learner_id]),
        readCohorts(supabase),
        readTaskInstructions(supabase, submission.task_id, locale),
        readEvidence(supabase, version?.evidence_refs ?? []),
        readHintsUsed(supabase, submission.attempt_id, locale),
        readPastDecisions(supabase, submission.id),
        readAttemptNumbers(supabase, [submission.attempt_id]),
        readCohortStates(supabase),
      ]);

    const selectedIds = new Set(version?.selected_option_ids ?? []);
    const cohortState = cohortStates.get(submission.cohort_id) ?? "";

    return ok({
      id: submission.id,
      state: submission.state,
      rowVersion: submission.row_version,
      submissionVersionId: context.submission_version_id,
      versionNumber: submission.latest_version_number,
      attemptNumber: attempts.get(submission.attempt_id) ?? 1,
      createdAt: submission.created_at,
      submittedAt: version?.submitted_at ?? submission.created_at,

      learnerId: submission.learner_id,
      learnerName: profiles.get(submission.learner_id) ?? "—",
      cohortId: submission.cohort_id,
      cohortName: cohorts.get(submission.cohort_id) ?? "—",
      cohortState,

      taskId: submission.task_id,
      taskTitle: context.task_title || instructions.title || "—",
      taskInstructionsHtml: instructions.html,
      taskKind: snapshot.task_kind ?? "",
      targetUrl: snapshot.target_url ?? null,
      assessmentQuestion: pick(snapshot.assessment?.question_translations, locale),

      answerText: version?.answer_text ?? "",
      selectedOptions: context.options.map((option) => ({
        id: option.id,
        label: pick(option.labels, locale),
        selected: selectedIds.has(option.id),
      })),
      elapsedSeconds: version?.elapsed_seconds ?? 0,
      hintUsed: version?.hint_used ?? false,
      hintsUsed: hints,
      evidence,

      rubricTitle: pick(context.rubric?.labels, locale),
      criteria: (context.rubric?.criteria ?? [])
        .slice()
        .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
        .map((criterion) => ({
          id: criterion.id,
          code: criterion.code,
          label: pick(criterion.labels, locale) || criterion.code || "",
          maxPoints: criterion.max_points,
          required: criterion.required_for_acceptance ?? false,
        })),
      pastDecisions: decisions,
      decidable:
        (submission.state === "submitted" || submission.state === "resubmitted") &&
        cohortState === "active" &&
        (context.rubric?.criteria.length ?? 0) > 0,
    });
  } catch (cause) {
    return err(unexpected(cause));
  }
}

async function readTaskInstructions(
  supabase: Supabase,
  taskId: string,
  locale: string
): Promise<{ title: string; html: string }> {
  const { data } = await supabase
    .from("task_localizations")
    .select("locale,title,instructions_html")
    .eq("task_id", taskId);
  const rows = data ?? [];
  const row =
    rows.find((r) => r.locale === locale) ??
    rows.find((r) => r.locale === "de") ??
    rows.find((r) => r.locale === "en") ??
    rows[0];
  return { title: row?.title ?? "", html: row?.instructions_html ?? "" };
}

async function readEvidence(supabase: Supabase, ids: string[]): Promise<EvidenceItem[]> {
  if (ids.length === 0) return [];
  const { data } = await supabase
    .from("evidence")
    .select("id,title,source_uri,evidence_kind,captured_at")
    .in("id", ids);
  return (data ?? []).map((row) => ({
    id: row.id,
    title: row.title,
    sourceUri: row.source_uri,
    kind: row.evidence_kind,
    capturedAt: row.captured_at,
  }));
}

/** Which hints the learner opened — recorded per attempt, resolved to text. */
async function readHintsUsed(
  supabase: Supabase,
  attemptId: string,
  locale: string
): Promise<string[]> {
  const { data: usage } = await supabase
    .from("attempt_hint_usage")
    .select("hint_id,first_used_at")
    .eq("attempt_id", attemptId)
    .order("first_used_at", { ascending: true });
  const hintIds = (usage ?? []).map((row) => row.hint_id);
  if (hintIds.length === 0) return [];

  const { data: hints } = await supabase
    .from("task_hints")
    .select("id,content_translations")
    .in("id", hintIds);
  const byId = new Map(
    (hints ?? []).map((row) => [row.id, pick(row.content_translations as LocalizedText, locale)])
  );
  return hintIds.map((id) => byId.get(id) ?? "").filter(Boolean);
}

async function readPastDecisions(supabase: Supabase, submissionId: string): Promise<PastDecision[]> {
  const { data } = await supabase
    .from("reviews")
    .select("id,decision,comment,created_at,reviewer_id")
    .eq("submission_id", submissionId)
    .order("created_at", { ascending: false });
  const rows = data ?? [];
  if (rows.length === 0) return [];
  const profiles = await readProfiles(supabase, rows.map((row) => row.reviewer_id));
  return rows.map((row) => ({
    id: row.id,
    decision: row.decision,
    comment: row.comment,
    createdAt: row.created_at,
    reviewerName: profiles.get(row.reviewer_id) ?? "—",
  }));
}

async function readCohortStates(supabase: Supabase): Promise<Map<string, string>> {
  const { data } = await supabase.from("cohorts").select("id,state");
  return new Map((data ?? []).map((row) => [row.id, row.state as string]));
}

/* ── Decisions ──────────────────────────────────────────────────────────── */

export interface CriterionScore {
  criterionId: string;
  points: number;
}

/**
 * ⚠️ `p_criterion_scores` is a NON-EMPTY ARRAY, not `{}` (ISSUES I-016), and
 * `p_decision` never takes "transferred" — that is `transferSubmission`.
 */
export async function decideSubmission(args: {
  submissionId: string;
  submissionVersionId: string;
  expectedVersion: number;
  decision: "accepted" | "revision_required";
  comment: string;
  scores: CriterionScore[];
}): Promise<Result<{ state: string }>> {
  if (args.comment.trim().length === 0) {
    return err({ code: "COMMENT_REQUIRED", message: "Ein Kommentar ist erforderlich.", retryable: false });
  }
  if (args.scores.length === 0) {
    return err({
      code: "RUBRIC_SCORES",
      message: "Bitte bewerten Sie alle Pflichtkriterien mit einer gültigen Punktzahl.",
      retryable: false,
    });
  }

  try {
    const supabase = await createServerClient();
    const { data, error } = await supabase.rpc("decide_submission" as never, {
      p_submission_id: args.submissionId,
      p_submission_version_id: args.submissionVersionId,
      p_expected_version: args.expectedVersion,
      p_decision: args.decision,
      p_comment: args.comment.trim(),
      p_criterion_scores: args.scores.map((score) => ({
        criterion_id: score.criterionId,
        points: score.points,
      })),
      p_correlation_id: crypto.randomUUID(),
      p_idempotency_key: idempotencyKey("decide", args.submissionId, args.expectedVersion),
    } as never);

    if (error) return err(mapReviewError(error));
    return ok({ state: (data as { state?: string } | null)?.state ?? args.decision });
  } catch (cause) {
    return err(unexpected(cause));
  }
}

export async function transferSubmission(args: {
  submissionId: string;
  expectedVersion: number;
  toTrainerId: string;
  reason: string;
}): Promise<Result<{ state: string }>> {
  if (args.reason.trim().length === 0) {
    return err({ code: "REASON_REQUIRED", message: "Eine Begründung ist erforderlich.", retryable: false });
  }
  try {
    const supabase = await createServerClient();
    const { data, error } = await supabase.rpc("transfer_submission" as never, {
      p_submission_id: args.submissionId,
      p_expected_version: args.expectedVersion,
      p_to_trainer_id: args.toTrainerId,
      p_reason: args.reason.trim(),
      p_correlation_id: crypto.randomUUID(),
      p_idempotency_key: idempotencyKey("transfer", args.submissionId, args.expectedVersion),
    } as never);
    if (error) return err(mapReviewError(error));
    return ok({ state: (data as { state?: string } | null)?.state ?? "transferred" });
  } catch (cause) {
    return err(unexpected(cause));
  }
}

/** The transfer-target picker. Excludes the current trainer server-side. */
export async function listCohortTrainers(
  cohortId: string,
  exceptUserId?: string
): Promise<Result<{ id: string; name: string }[]>> {
  try {
    const supabase = await createServerClient();
    const { data, error } = await supabase.rpc("list_active_cohort_trainers" as never, {
      p_cohort_id: cohortId,
    } as never);
    if (error) return err(mapReviewError(error));
    const rows = z
      .array(z.object({ user_id: z.string(), display_name: z.string().nullable().default("") }))
      .parse(data ?? []);
    return ok(
      rows
        .filter((row) => row.user_id !== exceptUserId)
        .map((row) => ({ id: row.user_id, name: row.display_name || "—" }))
    );
  } catch (cause) {
    return err(unexpected(cause));
  }
}

/* ── Questions ──────────────────────────────────────────────────────────── */

export interface QuestionItem {
  id: string;
  subject: string;
  state: string;
  learnerId: string;
  learnerName: string;
  cohortId: string;
  cohortName: string;
  taskId: string;
  taskTitle: string;
  assignedTrainerId: string | null;
  assignedTrainerName: string | null;
  createdAt: string;
  answeredAt: string | null;
  waitingHours: number;
  rowVersion: number;
  messageCount: number;
}

export interface QuestionMessage {
  id: string;
  body: string;
  createdAt: string;
  authorId: string;
  authorName: string;
  kind: string;
  isTrainer: boolean;
}

export interface QuestionDetail extends QuestionItem {
  messages: QuestionMessage[];
  /** Only the claiming trainer may answer. */
  canAnswer: boolean;
  canClaim: boolean;
}

const QuestionRowSchema = z.object({
  id: z.string(),
  subject: z.string(),
  state: z.string(),
  learner_id: z.string(),
  cohort_id: z.string(),
  task_id: z.string(),
  assigned_trainer_id: z.string().nullable().default(null),
  created_at: z.string(),
  answered_at: z.string().nullable().default(null),
  archived_at: z.string().nullable().default(null),
  row_version: z.number(),
});

const QUESTION_SELECT =
  "id,subject,state,learner_id,cohort_id,task_id,assigned_trainer_id,created_at,answered_at,archived_at,row_version";

export const OPEN_QUESTION_STATES = ["open", "assigned", "answered", "transferred"] as const;

export async function listQuestions(args: {
  locale: string;
  archived?: boolean | undefined;
  state?: QuestionState | undefined;
  limit?: number | undefined;
  offset?: number | undefined;
}): Promise<Result<{ items: QuestionItem[]; total: number }>> {
  const limit = args.limit ?? 25;
  const offset = args.offset ?? 0;
  try {
    const supabase = await createServerClient();

    let query = supabase
      .from("questions")
      .select(QUESTION_SELECT, { count: "exact" })
      .range(offset, offset + limit - 1);

    if (args.archived) query = query.eq("state", "archived");
    else if (args.state) query = query.eq("state", args.state);
    else query = query.in("state", [...OPEN_QUESTION_STATES]);

    // Unanswered first, then oldest first — the same fairness rule as the queue.
    query = query.order("answered_at", { ascending: true, nullsFirst: true }).order("created_at");

    const { data, error, count } = await query;
    if (error) return err(mapReviewError(error));

    const rows = z.array(QuestionRowSchema).parse(data ?? []);
    const [profiles, cohorts, titles, counts] = await Promise.all([
      readProfiles(supabase, rows.flatMap((r) => [r.learner_id, r.assigned_trainer_id ?? ""])),
      readCohorts(supabase),
      readTaskTitles(supabase, rows.map((r) => r.task_id), args.locale),
      readMessageCounts(supabase, rows.map((r) => r.id)),
    ]);

    return ok({
      items: rows.map((row) => toQuestionItem(row, profiles, cohorts, titles, counts)),
      total: count ?? rows.length,
    });
  } catch (cause) {
    return err(unexpected(cause));
  }
}

function toQuestionItem(
  row: z.infer<typeof QuestionRowSchema>,
  profiles: Map<string, string>,
  cohorts: Map<string, string>,
  titles: Map<string, string>,
  counts: Map<string, number>
): QuestionItem {
  return {
    id: row.id,
    subject: row.subject,
    state: row.state,
    learnerId: row.learner_id,
    learnerName: profiles.get(row.learner_id) ?? "—",
    cohortId: row.cohort_id,
    cohortName: cohorts.get(row.cohort_id) ?? "—",
    taskId: row.task_id,
    taskTitle: titles.get(row.task_id) || "—",
    assignedTrainerId: row.assigned_trainer_id,
    assignedTrainerName: row.assigned_trainer_id ? profiles.get(row.assigned_trainer_id) ?? "—" : null,
    createdAt: row.created_at,
    answeredAt: row.answered_at,
    waitingHours: hoursSince(row.created_at),
    rowVersion: row.row_version,
    messageCount: counts.get(row.id) ?? 0,
  };
}

async function readMessageCounts(supabase: Supabase, ids: string[]): Promise<Map<string, number>> {
  if (ids.length === 0) return new Map();
  const { data } = await supabase.from("question_messages").select("question_id").in("question_id", ids);
  const counts = new Map<string, number>();
  for (const row of data ?? []) counts.set(row.question_id, (counts.get(row.question_id) ?? 0) + 1);
  return counts;
}

export async function getQuestionDetail(
  questionId: string,
  locale: string,
  viewerId: string
): Promise<Result<QuestionDetail>> {
  try {
    const supabase = await createServerClient();
    const { data, error } = await supabase
      .from("questions")
      .select(QUESTION_SELECT)
      .eq("id", questionId)
      .maybeSingle();
    if (error) return err(mapReviewError(error));
    if (!data) {
      return err({
        code: "PGRST116",
        message: "Diese Frage existiert nicht oder ist für Sie nicht sichtbar.",
        retryable: false,
      });
    }

    const row = QuestionRowSchema.parse(data);
    const { data: messageRows } = await supabase
      .from("question_messages")
      .select("id,body,created_at,author_id,message_kind")
      .eq("question_id", questionId)
      .order("created_at", { ascending: true });

    const messages = messageRows ?? [];
    const [profiles, cohorts, titles, counts] = await Promise.all([
      readProfiles(supabase, [
        row.learner_id,
        row.assigned_trainer_id ?? "",
        ...messages.map((m) => m.author_id),
      ]),
      readCohorts(supabase),
      readTaskTitles(supabase, [row.task_id], locale),
      readMessageCounts(supabase, [row.id]),
    ]);

    const item = toQuestionItem(row, profiles, cohorts, titles, counts);
    return ok({
      ...item,
      messages: messages.map((message) => ({
        id: message.id,
        body: message.body,
        createdAt: message.created_at,
        authorId: message.author_id,
        authorName: profiles.get(message.author_id) ?? "—",
        kind: message.message_kind,
        isTrainer: message.author_id !== row.learner_id,
      })),
      canClaim: row.state === "open" && row.archived_at === null,
      canAnswer: row.assigned_trainer_id === viewerId && row.archived_at === null,
    });
  } catch (cause) {
    return err(unexpected(cause));
  }
}

export async function claimQuestion(args: {
  questionId: string;
  expectedVersion: number;
}): Promise<Result<null>> {
  return questionCommand("claim_question", {
    p_question_id: args.questionId,
    p_expected_version: args.expectedVersion,
    p_correlation_id: crypto.randomUUID(),
    p_idempotency_key: idempotencyKey("claim", args.questionId, args.expectedVersion),
  });
}

export async function answerQuestion(args: {
  questionId: string;
  expectedVersion: number;
  body: string;
}): Promise<Result<null>> {
  if (args.body.trim().length === 0) {
    return err({ code: "BODY_REQUIRED", message: "Bitte schreiben Sie eine Antwort.", retryable: false });
  }
  return questionCommand("answer_question", {
    p_question_id: args.questionId,
    p_body: args.body.trim(),
    p_expected_version: args.expectedVersion,
    p_correlation_id: crypto.randomUUID(),
    p_idempotency_key: idempotencyKey("answer", args.questionId, args.expectedVersion),
  });
}

export async function transferQuestion(args: {
  questionId: string;
  expectedVersion: number;
  toTrainerId: string;
  reason: string;
}): Promise<Result<null>> {
  if (args.reason.trim().length === 0) {
    return err({ code: "REASON_REQUIRED", message: "Eine Begründung ist erforderlich.", retryable: false });
  }
  return questionCommand("transfer_question", {
    p_question_id: args.questionId,
    p_to_trainer_id: args.toTrainerId,
    p_reason: args.reason.trim(),
    p_expected_version: args.expectedVersion,
    p_correlation_id: crypto.randomUUID(),
    p_idempotency_key: idempotencyKey("qtransfer", args.questionId, args.expectedVersion),
  });
}

/** ⚠️ archive_question is the one command with no idempotency key. */
export async function archiveQuestion(args: {
  questionId: string;
  expectedVersion: number;
}): Promise<Result<null>> {
  return questionCommand("archive_question", {
    p_question_id: args.questionId,
    p_expected_version: args.expectedVersion,
    p_correlation_id: crypto.randomUUID(),
  });
}

async function questionCommand(name: string, args: Record<string, unknown>): Promise<Result<null>> {
  try {
    const supabase = await createServerClient();
    const { error } = await supabase.rpc(name as never, args as never);
    if (error) return err(mapReviewError(error));
    return ok(null);
  } catch (cause) {
    return err(unexpected(cause));
  }
}

export async function listQuestionTrainers(
  cohortId: string,
  exceptUserId?: string
): Promise<Result<{ id: string; name: string }[]>> {
  try {
    const supabase = await createServerClient();
    const { data, error } = await supabase.rpc("list_active_question_trainers" as never, {
      p_cohort_id: cohortId,
    } as never);
    if (error) return err(mapReviewError(error));
    const rows = z
      .array(z.object({ user_id: z.string(), display_name: z.string().nullable().default("") }))
      .parse(data ?? []);
    return ok(
      rows
        .filter((row) => row.user_id !== exceptUserId)
        .map((row) => ({ id: row.user_id, name: row.display_name || "—" }))
    );
  } catch (cause) {
    return err(unexpected(cause));
  }
}

/* ── Cohorts, members and progress ──────────────────────────────────────── */

export interface CohortSummary {
  id: string;
  name: string;
  state: string;
  courseId: string;
  startsAt: string | null;
  endsAt: string | null;
  capacity: number | null;
  learnerCount: number;
  trainerCount: number;
  openSubmissions: number;
  openQuestions: number;
}

export async function listCohorts(): Promise<Result<CohortSummary[]>> {
  try {
    const supabase = await createServerClient();
    const [{ data: cohortRows, error }, { data: memberships }, { data: submissions }, { data: questions }] =
      await Promise.all([
        supabase.from("cohorts").select("id,name,state,course_id,starts_at,ends_at,capacity").order("name"),
        supabase.from("cohort_memberships").select("cohort_id,role,state"),
        supabase.from("submissions").select("cohort_id,state"),
        supabase.from("questions").select("cohort_id,state"),
      ]);
    if (error) return err(mapReviewError(error));

    const openSubmissionStates = new Set<string>(OPEN_SUBMISSION_STATES);
    const openQuestionStates = new Set<string>(["open", "assigned", "transferred"]);

    return ok(
      (cohortRows ?? []).map((cohort) => {
        const members = (memberships ?? []).filter(
          (m) => m.cohort_id === cohort.id && m.state === "active"
        );
        return {
          id: cohort.id,
          name: cohort.name,
          state: cohort.state as string,
          courseId: cohort.course_id,
          startsAt: cohort.starts_at,
          endsAt: cohort.ends_at,
          capacity: cohort.capacity,
          learnerCount: members.filter((m) => m.role === "learner").length,
          trainerCount: members.filter((m) => m.role === "trainer").length,
          openSubmissions: (submissions ?? []).filter(
            (s) => s.cohort_id === cohort.id && openSubmissionStates.has(s.state as string)
          ).length,
          openQuestions: (questions ?? []).filter(
            (q) => q.cohort_id === cohort.id && openQuestionStates.has(q.state as string)
          ).length,
        };
      })
    );
  } catch (cause) {
    return err(unexpected(cause));
  }
}

export interface MemberProgress {
  userId: string;
  name: string;
  role: string;
  membershipState: string;
  assignedAt: string;
  submitted: number;
  accepted: number;
  revisionRequired: number;
  openQuestions: number;
  lastActivityAt: string | null;
}

export interface CohortDetail extends CohortSummary {
  members: MemberProgress[];
}

/**
 * ⚠️ Built from `cohort_memberships`, not `enrollments` — a trainer session
 * reads 0 enrollments (ISSUES I-018).
 */
export async function getCohortDetail(cohortId: string): Promise<Result<CohortDetail>> {
  try {
    const cohorts = await listCohorts();
    if (!cohorts.ok) return cohorts;
    const cohort = cohorts.data.find((c) => c.id === cohortId);
    if (!cohort) {
      return err({
        code: "PGRST116",
        message: "Diese Gruppe existiert nicht oder ist für Sie nicht sichtbar.",
        retryable: false,
      });
    }
    const members = await listMemberProgress(cohortId);
    if (!members.ok) return members;
    return ok({ ...cohort, members: members.data });
  } catch (cause) {
    return err(unexpected(cause));
  }
}

export async function listMemberProgress(cohortId?: string): Promise<Result<MemberProgress[]>> {
  try {
    const supabase = await createServerClient();

    let membershipQuery = supabase
      .from("cohort_memberships")
      .select("user_id,role,state,assigned_at,cohort_id")
      .eq("state", "active");
    if (cohortId) membershipQuery = membershipQuery.eq("cohort_id", cohortId);

    const [{ data: memberships, error }, { data: submissions }, { data: questions }] = await Promise.all([
      membershipQuery,
      supabase.from("submissions").select("learner_id,state,updated_at,cohort_id"),
      supabase.from("questions").select("learner_id,state,cohort_id"),
    ]);
    if (error) return err(mapReviewError(error));

    const rows = memberships ?? [];
    const profiles = await readProfiles(supabase, rows.map((row) => row.user_id));
    const openQuestionStates = new Set(["open", "assigned", "transferred"]);

    return ok(
      rows
        .map((row) => {
          const mine = (submissions ?? []).filter(
            (s) => s.learner_id === row.user_id && (!cohortId || s.cohort_id === cohortId)
          );
          const timestamps = mine.map((s) => s.updated_at).sort();
          return {
            userId: row.user_id,
            name: profiles.get(row.user_id) ?? "—",
            role: row.role as string,
            membershipState: row.state as string,
            assignedAt: row.assigned_at,
            submitted: mine.filter((s) => s.state === "submitted" || s.state === "resubmitted").length,
            accepted: mine.filter((s) => s.state === "accepted").length,
            revisionRequired: mine.filter((s) => s.state === "revision_required").length,
            openQuestions: (questions ?? []).filter(
              (q) =>
                q.learner_id === row.user_id &&
                openQuestionStates.has(q.state as string) &&
                (!cohortId || q.cohort_id === cohortId)
            ).length,
            lastActivityAt: timestamps.at(-1) ?? null,
          };
        })
        .sort((a, b) => a.name.localeCompare(b.name, "de"))
    );
  } catch (cause) {
    return err(unexpected(cause));
  }
}

/* ── Review history ─────────────────────────────────────────────────────── */

export interface HistoryEntry {
  id: string;
  decision: string;
  comment: string;
  createdAt: string;
  submissionId: string;
  learnerName: string;
  taskTitle: string;
  reviewerName: string;
  points: number | null;
}

export async function listReviewHistory(args: {
  locale: string;
  limit?: number;
  offset?: number;
}): Promise<Result<{ items: HistoryEntry[]; total: number }>> {
  const limit = args.limit ?? 25;
  const offset = args.offset ?? 0;
  try {
    const supabase = await createServerClient();
    const { data, error, count } = await supabase
      .from("reviews")
      .select("id,decision,comment,created_at,submission_id,reviewer_id", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);
    if (error) return err(mapReviewError(error));

    const rows = data ?? [];
    if (rows.length === 0) return ok({ items: [], total: count ?? 0 });

    const { data: submissions } = await supabase
      .from("submissions")
      .select("id,learner_id,task_id")
      .in("id", rows.map((row) => row.submission_id));
    const { data: scores } = await supabase
      .from("review_rubric_scores")
      .select("review_id,points")
      .in("review_id", rows.map((row) => row.id));

    const submissionById = new Map((submissions ?? []).map((row) => [row.id, row]));
    const [profiles, titles] = await Promise.all([
      readProfiles(supabase, [
        ...rows.map((row) => row.reviewer_id),
        ...(submissions ?? []).map((row) => row.learner_id),
      ]),
      readTaskTitles(supabase, (submissions ?? []).map((row) => row.task_id), args.locale),
    ]);

    return ok({
      items: rows.map((row) => {
        const submission = submissionById.get(row.submission_id);
        const points = (scores ?? [])
          .filter((score) => score.review_id === row.id)
          .reduce((sum, score) => sum + Number(score.points), 0);
        return {
          id: row.id,
          decision: row.decision as string,
          comment: row.comment,
          createdAt: row.created_at,
          submissionId: row.submission_id,
          learnerName: submission ? profiles.get(submission.learner_id) ?? "—" : "—",
          taskTitle: submission ? titles.get(submission.task_id) || "—" : "—",
          reviewerName: profiles.get(row.reviewer_id) ?? "—",
          points: (scores ?? []).some((score) => score.review_id === row.id) ? points : null,
        };
      }),
      total: count ?? rows.length,
    });
  } catch (cause) {
    return err(unexpected(cause));
  }
}

/* ── Dashboard ──────────────────────────────────────────────────────────── */

export interface TrainerDashboard {
  openReviews: number;
  openQuestions: number;
  oldestWaitingHours: number | null;
  decidedToday: number;
  queuePreview: QueueItem[];
  cohorts: CohortSummary[];
}

export async function getTrainerDashboard(locale: string): Promise<Result<TrainerDashboard>> {
  try {
    const supabase = await createServerClient();
    const [queue, cohorts, { data: questionRows }, { data: reviewRows }] = await Promise.all([
      listReviewQueue({ locale, sort: "oldest", limit: 5 }),
      listCohorts(),
      supabase.from("questions").select("id,state,created_at"),
      supabase.from("reviews").select("id,created_at"),
    ]);
    if (!queue.ok) return queue;
    if (!cohorts.ok) return cohorts;

    const openQuestionStates = new Set(["open", "assigned", "transferred"]);
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    return ok({
      openReviews: queue.data.total,
      openQuestions: (questionRows ?? []).filter((row) => openQuestionStates.has(row.state as string))
        .length,
      oldestWaitingHours: queue.data.items.length
        ? Math.max(...queue.data.items.map((item) => item.waitingHours))
        : null,
      decidedToday: (reviewRows ?? []).filter((row) => new Date(row.created_at) >= startOfToday).length,
      queuePreview: queue.data.items,
      cohorts: cohorts.data,
    });
  } catch (cause) {
    return err(unexpected(cause));
  }
}

/* ── Profile ────────────────────────────────────────────────────────────── */

export interface TrainerProfile {
  userId: string;
  displayName: string;
  locale: string;
  timezone: string;
  rowVersion: number;
}

export async function getTrainerProfile(userId: string): Promise<Result<TrainerProfile>> {
  try {
    const supabase = await createServerClient();
    const { data, error } = await supabase
      .from("profiles")
      .select("user_id,display_name,locale,timezone,row_version")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) return err(mapReviewError(error));
    if (!data) {
      return err({ code: "PGRST116", message: "Profil nicht gefunden.", retryable: false });
    }
    return ok({
      userId: data.user_id,
      displayName: data.display_name,
      locale: data.locale,
      timezone: data.timezone,
      rowVersion: data.row_version,
    });
  } catch (cause) {
    return err(unexpected(cause));
  }
}

export async function updateTrainerProfile(args: {
  displayName: string;
  locale: string;
  timezone: string;
  expectedVersion: number;
}): Promise<Result<null>> {
  if (args.displayName.trim().length === 0) {
    return err({ code: "NAME_REQUIRED", message: "Bitte geben Sie einen Namen ein.", retryable: false });
  }
  try {
    const supabase = await createServerClient();
    const { error } = await supabase.rpc("update_own_profile" as never, {
      p_display_name: args.displayName.trim(),
      p_locale: args.locale,
      p_timezone: args.timezone,
      p_expected_version: args.expectedVersion,
      p_correlation_id: crypto.randomUUID(),
      p_idempotency_key: idempotencyKey("profile", args.displayName.trim().slice(0, 8), args.expectedVersion),
    } as never);
    if (error) return err(mapReviewError(error));
    return ok(null);
  } catch (cause) {
    return err(unexpected(cause));
  }
}

/* ── Shared fallback ────────────────────────────────────────────────────── */

function unexpected(cause: unknown): DataError {
  if (cause instanceof z.ZodError) {
    return {
      code: "SHAPE",
      message: "Die Daten vom Server haben ein unerwartetes Format.",
      retryable: false,
    };
  }
  return { code: "NETWORK", message: "Verbindung zum Server fehlgeschlagen.", retryable: true };
}
