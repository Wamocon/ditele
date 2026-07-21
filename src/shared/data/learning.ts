import "server-only";

import { z } from "zod";
import { createServerClient } from "@/shared/database/server";
import { fromSupabase, err, ok, type Result } from "./result";
import {
  getMyLearningCourse as rpcGetMyLearningCourse,
  getMyLearningTask as rpcGetMyLearningTask,
  listMyLearningCourses as rpcListMyLearningCourses,
  pickLocale,
  type LocalizedText,
} from "./rpc";
import {
  DefectReportSchema,
  EMPTY_DEFECT,
  type AttemptState,
  type DefectReport,
  type DraftState,
  type LearningCourseDetail,
  type LearningCourseSummary,
  type LearningTask,
  type SavedDraft,
  type StartedAttempt,
  type SubmittedAttempt,
  type TaskWorkspace,
} from "@/features/learning/model";

/**
 * The types and the pure helpers live in `@/features/learning/model` because
 * this module is `server-only` and the workspace is a Client Component. They are
 * re-exported here so a caller only ever needs one import.
 */
export * from "@/features/learning/model";

/**
 * WS-2 owns this file. Everything the student learning screens read or write
 * goes through here — no page ever calls Supabase directly (MASTER_PLAN §13.1).
 *
 * Measured against the live database on 2026-07-21 as `learner@ditele.local`;
 * every shape below is a real payload, not a guess. The findings that are not
 * in RPC_CONTRACTS.md are recorded in plan/status/WS-2.md and ISSUES.md I-008…010.
 *
 * Three things that will bite anyone editing this file:
 *  1. `get_my_learning_task` returns `{de,en,ru}` objects and takes no locale,
 *     while `get_my_learning_course` resolves via `p_locale`. Two families.
 *  2. A stale `p_expected_draft_version` does not error — it HANGS and poisons
 *     the PostgREST pool for ~30s (ISSUES.md I-009). Always carry the
 *     `draft_version` the previous save returned.
 *  3. `submit_attempt` needs an evidence ref for tasks with `evidence_required`.
 *     `create_external_task_evidence` produces an acceptable one (I-008).
 */

/* ── Schemas ─────────────────────────────────────────────────────────────── */

const Localized = z.record(z.string(), z.string().nullable()).nullish();

/** The RPCs return nulls for absent ids; normalise them all to `null`. */
const uuid = z.string().nullish().transform((v) => v ?? null);
const int = z.number().nullish().transform((v) => v ?? 0);
const text = z.string().nullish().transform((v) => v ?? "");

const CourseSummaryRow = z.object({
  enrollment_id: z.string(),
  enrollment_state: text,
  course_id: z.string(),
  cohort_id: uuid,
  cohort_state: text,
  content_version_id: uuid,
  content_version_state: text,
  version_number: int,
  title: text,
  progression_mode: text,
  completed_activities: int,
  total_activities: int,
  next_task_id: uuid,
  next_task_title: text,
  next_task_state: text,
});

const ActivityRow = z.object({
  id: z.string(),
  title: text,
  description: text,
  position: int,
  state: text,
  lock_reasons: z.array(z.string()).nullish().transform((v) => v ?? []),
  available_from: z.string().nullish().transform((v) => v ?? null),
  due_at: z.string().nullish().transform((v) => v ?? null),
  expected_minutes: int,
});

const StageRow = z.object({
  id: z.string(),
  title: text,
  description: text,
  position: int,
  activities: z.array(ActivityRow).nullish().transform((v) => v ?? []),
});

const CourseDetailRow = z.object({
  course_id: z.string(),
  title: text,
  summary: text,
  cohort_id: uuid,
  cohort_name: text,
  cohort_state: text,
  enrollment_id: uuid,
  enrollment_state: text,
  content_version_id: uuid,
  content_version_state: text,
  version_number: int,
  progression_mode: text,
  completed_activities: int,
  total_activities: int,
  stages: z.array(StageRow).nullish().transform((v) => v ?? []),
});

const OptionRow = z.object({ id: z.string(), label: Localized });

const AssessmentRow = z.object({
  id: z.string(),
  question: Localized,
  selection_mode: text,
  options: z.array(OptionRow).nullish().transform((v) => v ?? []),
});

const HintRow = z.object({ id: z.string(), content: Localized });

const TaskRow = z.object({
  id: z.string(),
  stage_id: uuid,
  cohort_id: uuid,
  course_id: uuid,
  enrollment_id: uuid,
  title: Localized,
  instructions: Localized,
  access: text,
  target_url: z.string().nullish().transform((v) => v ?? null),
  // Added by migration 20260721160000. Older published snapshots were frozen
  // without it, so it must stay optional — a missing key means "no media".
  media: z
    .object({
      video_url: z.string().nullish().transform((v) => v ?? null),
      intro_video_url: z.string().nullish().transform((v) => v ?? null),
      document_url: z.string().nullish().transform((v) => v ?? null),
    })
    .nullish()
    .transform((v) => v ?? null),
  activated_at: z.string().nullish().transform((v) => v ?? null),
  cohort_state: text,
  version_number: int,
  content_version_id: uuid,
  content_version_state: text,
  assessment: AssessmentRow.nullish().transform((v) => v ?? null),
  // ⚠️ Came back as a single object on the seeded task, which has exactly one
  // hint. Accept both so a multi-hint course does not need a code change.
  hint: z.union([HintRow, z.array(HintRow)]).nullish().transform((v) => v ?? null),
});

const AttemptRow = z.object({
  id: z.string(),
  sequence_number: int,
  state: text,
  row_version: int,
  elapsed_seconds: int,
  hint_used: z.boolean().nullish().transform((v) => v ?? false),
  started_at: z.string().nullish().transform((v) => v ?? null),
  submitted_at: z.string().nullish().transform((v) => v ?? null),
});

const DraftRow = z.object({
  answer_text: text,
  selected_option_ids: z.array(z.string()).nullish().transform((v) => v ?? []),
  evidence_draft: z.unknown().nullish(),
  row_version: int,
  updated_at: z.string().nullish().transform((v) => v ?? null),
});

const StartAttemptRow = z.object({
  attempt_id: z.string(),
  attempt_state: text,
  attempt_row_version: int,
});

const SaveDraftRow = z.object({
  draft_version: int,
  attempt_version: int,
  elapsed_seconds: int,
  hint_used: z.boolean().nullish().transform((v) => v ?? false),
  updated_at: z.string().nullish().transform((v) => v ?? null),
});

const EvidenceRow = z.object({ id: z.string() });

const SubmissionRow = z.object({
  id: z.string(),
  state: text,
  latest_version_number: int,
  row_version: int,
});

/* ── Reads ───────────────────────────────────────────────────────────────── */

function parse<T>(schema: z.ZodType<T>, value: unknown, what: string): Result<T> {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    return err({
      code: "SHAPE",
      message: `Die Daten für „${what}“ haben ein unerwartetes Format.`,
      retryable: false,
    });
  }
  return ok(parsed.data);
}

export async function listMyLearningCourses(
  locale: string
): Promise<Result<LearningCourseSummary[]>> {
  const result = await rpcListMyLearningCourses(locale);
  if (!result.ok) return result;

  const parsed = parse(z.array(CourseSummaryRow), result.data, "Meine Kurse");
  if (!parsed.ok) return parsed;

  return ok(
    parsed.data.map((row) => ({
      enrollmentId: row.enrollment_id,
      enrollmentState: row.enrollment_state,
      courseId: row.course_id,
      cohortId: row.cohort_id,
      cohortState: row.cohort_state,
      contentVersionState: row.content_version_state,
      versionNumber: row.version_number,
      title: row.title,
      completedActivities: row.completed_activities,
      totalActivities: row.total_activities,
      nextTaskId: row.next_task_id,
      nextTaskTitle: row.next_task_title,
      nextTaskState: row.next_task_state,
    }))
  );
}

export async function getMyLearningCourse(
  courseId: string,
  locale: string
): Promise<Result<LearningCourseDetail>> {
  const result = await rpcGetMyLearningCourse(courseId, locale);
  if (!result.ok) return result;

  const parsed = parse(CourseDetailRow, result.data, "Kursdetail");
  if (!parsed.ok) return parsed;
  const row = parsed.data;

  return ok({
    courseId: row.course_id,
    title: row.title,
    summary: row.summary,
    cohortName: row.cohort_name,
    cohortState: row.cohort_state,
    enrollmentState: row.enrollment_state,
    contentVersionState: row.content_version_state,
    versionNumber: row.version_number,
    completedActivities: row.completed_activities,
    totalActivities: row.total_activities,
    stages: [...row.stages]
      .sort((a, b) => a.position - b.position)
      .map((stage) => ({
        id: stage.id,
        title: stage.title,
        description: stage.description,
        position: stage.position,
        activities: [...stage.activities]
          .sort((a, b) => a.position - b.position)
          .map((activity) => ({
            id: activity.id,
            title: activity.title,
            description: activity.description,
            position: activity.position,
            state: activity.state,
            lockReasons: activity.lock_reasons,
            availableFrom: activity.available_from,
            dueAt: activity.due_at,
            expectedMinutes: activity.expected_minutes,
            locked: activity.lock_reasons.length > 0,
          })),
      })),
  });
}

function toLocalized(value: unknown): LocalizedText {
  if (!value || typeof value !== "object") return {};
  const out: Record<string, string> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (typeof raw === "string") out[key] = raw;
  }
  return out;
}

export async function getMyLearningTask(
  taskId: string,
  locale: string
): Promise<Result<LearningTask>> {
  const result = await rpcGetMyLearningTask(taskId);
  if (!result.ok) return result;

  const parsed = parse(TaskRow, result.data, "Aufgabe");
  if (!parsed.ok) return parsed;
  const row = parsed.data;

  const hintRows = row.hint === null ? [] : Array.isArray(row.hint) ? row.hint : [row.hint];

  return ok({
    id: row.id,
    courseId: row.course_id,
    cohortId: row.cohort_id,
    enrollmentId: row.enrollment_id,
    title: pickLocale(toLocalized(row.title), locale),
    instructions: pickLocale(toLocalized(row.instructions), locale),
    access: row.access,
    targetUrl: row.target_url,
    videoUrl: row.media?.video_url ?? null,
    introVideoUrl: row.media?.intro_video_url ?? null,
    documentUrl: row.media?.document_url ?? null,
    cohortState: row.cohort_state,
    assessment: row.assessment
      ? {
          id: row.assessment.id,
          question: pickLocale(toLocalized(row.assessment.question), locale),
          multiple: row.assessment.selection_mode !== "single",
          options: row.assessment.options.map((option) => ({
            id: option.id,
            label: pickLocale(toLocalized(option.label), locale),
          })),
        }
      : null,
    hints: hintRows.map((hint) => ({
      id: hint.id,
      content: pickLocale(toLocalized(hint.content), locale),
    })),
  });
}

/**
 * The attempt and its draft. Both tables ARE readable by the owning student —
 * measured, despite `tasks`/`stages` being invisible under the same session.
 * Returns the newest attempt for the task, or nulls when none has been started.
 */
export async function getAttemptForTask(
  taskId: string
): Promise<Result<{ attempt: AttemptState | null; draft: DraftState | null }>> {
  const supabase = await createServerClient();

  const attemptResult = await fromSupabase<unknown[]>(async () => {
    const { data, error } = await supabase
      .from("attempts")
      .select("id, sequence_number, state, row_version, elapsed_seconds, hint_used, started_at, submitted_at")
      .eq("task_id", taskId)
      .order("sequence_number", { ascending: false })
      .limit(1);
    return { data: data as unknown[] | null, error };
  });
  if (!attemptResult.ok) return attemptResult;

  const attemptRow = attemptResult.data[0];
  if (!attemptRow) return ok({ attempt: null, draft: null });

  const parsedAttempt = parse(AttemptRow, attemptRow, "Versuch");
  if (!parsedAttempt.ok) return parsedAttempt;
  const a = parsedAttempt.data;

  const attempt: AttemptState = {
    id: a.id,
    sequenceNumber: a.sequence_number,
    state: a.state,
    rowVersion: a.row_version,
    elapsedSeconds: a.elapsed_seconds,
    hintUsed: a.hint_used,
    submittedAt: a.submitted_at,
  };

  const [draftResult, hintResult] = await Promise.all([
    fromSupabase<unknown[]>(async () => {
      const { data, error } = await supabase
        .from("attempt_drafts")
        .select("answer_text, selected_option_ids, evidence_draft, row_version, updated_at")
        .eq("attempt_id", a.id)
        .limit(1);
      return { data: data as unknown[] | null, error };
    }),
    fromSupabase<unknown[]>(async () => {
      const { data, error } = await supabase
        .from("attempt_hint_usage")
        .select("hint_id")
        .eq("attempt_id", a.id);
      return { data: data as unknown[] | null, error };
    }),
  ]);
  if (!draftResult.ok) return draftResult;

  const usedHintIds = hintResult.ok
    ? hintResult.data
        .map((row) => (row as { hint_id?: unknown }).hint_id)
        .filter((id): id is string => typeof id === "string")
    : [];

  const draftRow = draftResult.data[0];
  if (!draftRow) {
    return ok({
      attempt,
      draft: { answerText: "", selectedOptionIds: [], defect: EMPTY_DEFECT, usedHintIds, version: 0, updatedAt: null },
    });
  }

  const parsedDraft = parse(DraftRow, draftRow, "Entwurf");
  if (!parsedDraft.ok) return parsedDraft;
  const d = parsedDraft.data;

  // `evidence_draft` is jsonb. We store exactly one structured defect report in
  // it so the DefectForm round-trips; anything else we ignore rather than crash.
  const firstEvidence = Array.isArray(d.evidence_draft) ? d.evidence_draft[0] : d.evidence_draft;
  const defect = DefectReportSchema.safeParse(firstEvidence);

  return ok({
    attempt,
    draft: {
      answerText: d.answer_text,
      selectedOptionIds: d.selected_option_ids,
      defect: defect.success ? defect.data : EMPTY_DEFECT,
      usedHintIds,
      version: d.row_version,
      updatedAt: d.updated_at,
    },
  });
}

/** One call for the whole workspace route. */
export async function getTaskWorkspace(
  taskId: string,
  locale: string
): Promise<Result<TaskWorkspace>> {
  const [taskResult, attemptResult] = await Promise.all([
    getMyLearningTask(taskId, locale),
    getAttemptForTask(taskId),
  ]);
  if (!taskResult.ok) return taskResult;
  if (!attemptResult.ok) return attemptResult;

  return ok({
    task: taskResult.data,
    attempt: attemptResult.data.attempt,
    draft: attemptResult.data.draft,
  });
}

/* ── Writes ──────────────────────────────────────────────────────────────── */

async function rpcCall<T>(name: string, args: Record<string, unknown>): Promise<Result<T>> {
  const supabase = await createServerClient();
  return fromSupabase<T>(async () => {
    const { data, error } = await supabase.rpc(name as never, args as never);
    return { data: data as T | null, error };
  });
}

const firstRow = <T>(value: unknown): unknown => (Array.isArray(value) ? (value as T[])[0] : value);

export async function startAttempt(args: {
  taskId: string;
  enrollmentId: string;
}): Promise<Result<StartedAttempt>> {
  // Idempotent per task: replaying it returns the existing attempt instead of
  // creating a second one. This is the server half of "double-submit blocked".
  const result = await rpcCall<unknown>("start_attempt", {
    p_task_id: args.taskId,
    p_enrollment_id: args.enrollmentId,
    p_correlation_id: crypto.randomUUID(),
    p_idempotency_key: `start:${args.taskId}:${args.enrollmentId}`,
  });
  if (!result.ok) return result;

  const parsed = parse(StartAttemptRow, firstRow(result.data), "Versuch starten");
  if (!parsed.ok) return parsed;

  return ok({
    attemptId: parsed.data.attempt_id,
    state: parsed.data.attempt_state,
    rowVersion: parsed.data.attempt_row_version,
  });
}

/**
 * The autosave call, and the reason a draft survives a reload.
 *
 * ⚠️ `expectedDraftVersion` must be current. A stale value does not return a
 * conflict — it hangs and takes the PostgREST pool with it (ISSUES.md I-009).
 * Callers carry forward the `draftVersion` this returns.
 *
 * Passing a hint id in `usedHintIds` is what writes the `attempt_hint_usage`
 * row, so hint usage is recorded *before* the hint is revealed (WF-2).
 */
export async function saveAttemptDraft(args: {
  attemptId: string;
  answerText: string;
  selectedOptionIds: string[];
  usedHintIds: string[];
  defect: DefectReport | null;
  elapsedSeconds: number;
  expectedDraftVersion: number;
}): Promise<Result<SavedDraft>> {
  const result = await rpcCall<unknown>("save_attempt_draft", {
    p_attempt_id: args.attemptId,
    p_answer_text: args.answerText,
    p_selected_option_ids: args.selectedOptionIds,
    p_used_hint_ids: args.usedHintIds,
    p_evidence_draft: args.defect ? [args.defect] : [],
    p_elapsed_seconds: args.elapsedSeconds,
    p_expected_draft_version: args.expectedDraftVersion,
  });
  if (!result.ok) return result;

  const parsed = parse(SaveDraftRow, firstRow(result.data), "Entwurf speichern");
  if (!parsed.ok) return parsed;

  return ok({
    draftVersion: parsed.data.draft_version,
    attemptVersion: parsed.data.attempt_version,
    updatedAt: parsed.data.updated_at,
  });
}

/**
 * Registers the defect report as external evidence and returns its id.
 *
 * The RPC wants a sha256 of the referenced content. For a link-only defect
 * report there is no downloaded body to hash, so we hash the source URI itself —
 * a stable identity for "this learner reported this address". Documented here
 * because it is a deliberate choice, not an oversight (RPC_CONTRACTS.md §8).
 */
async function createExternalEvidence(args: {
  attemptId: string;
  title: string;
  sourceUri: string;
}): Promise<Result<string>> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(args.sourceUri));
  const sha256 = Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");

  const result = await rpcCall<unknown>("create_external_task_evidence", {
    p_attempt_id: args.attemptId,
    p_title: args.title,
    p_source_uri: args.sourceUri,
    p_sha256_hex: sha256,
    p_idempotency_key: `evidence:${args.attemptId}:${sha256}`,
  });
  if (!result.ok) return result;

  const parsed = parse(EvidenceRow, firstRow(result.data), "Evidenz");
  if (!parsed.ok) return parsed;
  return ok(parsed.data.id);
}

/**
 * Submit for review. For a practice task the defect report is registered as
 * evidence first — tasks with `evidence_required` reject a submission without
 * one (`22023 verified evidence is required for this task`, ISSUES.md I-008).
 */
export async function submitAttempt(args: {
  attemptId: string;
  answerText: string;
  selectedOptionIds: string[];
  expectedVersion: number;
  evidence: { title: string; sourceUri: string } | null;
}): Promise<Result<SubmittedAttempt>> {
  const evidenceRefs: string[] = [];
  if (args.evidence && args.evidence.sourceUri.trim().length > 0) {
    const evidence = await createExternalEvidence({
      attemptId: args.attemptId,
      title: args.evidence.title.trim() || args.evidence.sourceUri,
      sourceUri: args.evidence.sourceUri.trim(),
    });
    if (!evidence.ok) return evidence;
    evidenceRefs.push(evidence.data);
  }

  const result = await rpcCall<unknown>("submit_attempt", {
    p_attempt_id: args.attemptId,
    p_answer_text: args.answerText,
    p_selected_option_ids: args.selectedOptionIds,
    p_evidence_refs: evidenceRefs,
    p_expected_version: args.expectedVersion,
    p_correlation_id: crypto.randomUUID(),
    p_idempotency_key: `submit:${args.attemptId}:${args.expectedVersion}`,
  });
  if (!result.ok) return result;

  const parsed = parse(SubmissionRow, firstRow(result.data), "Abgabe");
  if (!parsed.ok) return parsed;
  return ok({ submissionId: parsed.data.id, state: parsed.data.state });
}
