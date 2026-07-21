import { z } from "zod";

/**
 * The learning domain model — types and pure helpers, with **no server imports**.
 *
 * `src/shared/data/learning.ts` is `server-only`, and the task workspace is a
 * Client Component that needs `EMPTY_DEFECT` and `isAttemptLocked` at runtime.
 * Importing those from the data module drags `next/headers` into the browser
 * bundle and the route 500s. Anything both sides need lives here; the data
 * module re-exports it so callers can keep importing from one place.
 */

/* ── Courses ─────────────────────────────────────────────────────────────── */

export interface LearningCourseSummary {
  enrollmentId: string;
  enrollmentState: string;
  courseId: string;
  cohortId: string | null;
  cohortState: string;
  contentVersionState: string;
  versionNumber: number;
  title: string;
  completedActivities: number;
  totalActivities: number;
  nextTaskId: string | null;
  nextTaskTitle: string;
  nextTaskState: string;
}

export interface LearningActivity {
  id: string;
  title: string;
  description: string;
  position: number;
  state: string;
  lockReasons: string[];
  availableFrom: string | null;
  dueAt: string | null;
  expectedMinutes: number;
  locked: boolean;
}

export interface LearningStage {
  id: string;
  title: string;
  description: string;
  position: number;
  activities: LearningActivity[];
}

export interface LearningCourseDetail {
  courseId: string;
  title: string;
  summary: string;
  cohortName: string;
  cohortState: string;
  enrollmentState: string;
  contentVersionState: string;
  versionNumber: number;
  completedActivities: number;
  totalActivities: number;
  stages: LearningStage[];
}

/* ── Tasks ───────────────────────────────────────────────────────────────── */

export interface TaskOption {
  id: string;
  label: string;
}

export interface TaskAssessment {
  id: string;
  question: string;
  multiple: boolean;
  options: TaskOption[];
}

export interface TaskHint {
  id: string;
  content: string;
}

export interface LearningTask {
  id: string;
  courseId: string | null;
  cohortId: string | null;
  enrollmentId: string | null;
  title: string;
  instructions: string;
  access: string;
  /** Non-null ⇒ practice task: the IframePanel target. Null ⇒ theory task. */
  targetUrl: string | null;
  cohortState: string;
  assessment: TaskAssessment | null;
  hints: TaskHint[];
}

/* ── Attempts ────────────────────────────────────────────────────────────── */

export interface AttemptState {
  id: string;
  sequenceNumber: number;
  /** attempt_state: in_progress · submitted · revision_required · resubmitted · accepted · abandoned */
  state: string;
  rowVersion: number;
  elapsedSeconds: number;
  hintUsed: boolean;
  submittedAt: string | null;
}

export interface DraftState {
  answerText: string;
  selectedOptionIds: string[];
  defect: DefectReport;
  usedHintIds: string[];
  /** `p_expected_draft_version` for the next save. Never send a stale one (I-009). */
  version: number;
  updatedAt: string | null;
}

export interface TaskWorkspace {
  task: LearningTask;
  attempt: AttemptState | null;
  draft: DraftState | null;
}

export interface StartedAttempt {
  attemptId: string;
  state: string;
  rowVersion: number;
}

export interface SavedDraft {
  draftVersion: number;
  attemptVersion: number;
  updatedAt: string | null;
}

export interface SubmittedAttempt {
  submissionId: string;
  state: string;
}

/** Attempt states in which the workspace is read-only. */
const LOCKED_ATTEMPT_STATES = new Set(["submitted", "resubmitted", "accepted"]);

export const isAttemptLocked = (state: string | undefined) =>
  state !== undefined && LOCKED_ATTEMPT_STATES.has(state);

/* ── The defect report ───────────────────────────────────────────────────── */

/** Round-tripped through `attempt_drafts.evidence_draft` so the form survives a reload. */
export const DefectReportSchema = z.object({
  summary: z.string().default(""),
  severity: z.enum(["low", "medium", "high", "critical"]).default("medium"),
  sourceUri: z.string().default(""),
  steps: z.string().default(""),
  expected: z.string().default(""),
  actual: z.string().default(""),
});

export type DefectReport = z.infer<typeof DefectReportSchema>;

export const EMPTY_DEFECT: DefectReport = {
  summary: "",
  severity: "medium",
  sourceUri: "",
  steps: "",
  expected: "",
  actual: "",
};
