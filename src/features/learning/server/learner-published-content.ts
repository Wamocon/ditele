import { z } from "zod";

import {
  LearnerDashboardSchema,
  type LearnerCourseSummary,
  type LearnerDashboard,
} from "@/features/learning/model/learner-dashboard";
import {
  LearnerCourseWorkspaceSchema,
  CourseActivityLockReasonSchema,
  type CourseActivityState,
  type LearnerCourseWorkspace,
} from "@/features/learning/model/course-workspace";
import {
  LearnerTaskSchema,
  type LearnerTask,
} from "@/features/tasks/model/task";
import type { Locale } from "@/shared/i18n/config";

const UuidSchema = z.string().uuid();
const TimestampSchema = z.string().datetime({ offset: true });
const ContentVersionStateSchema = z.enum(["published", "archived"]);
const EnrollmentStateSchema = z.enum([
  "requested",
  "approved",
  "assigned",
  "completed",
]);
const CohortStateSchema = z.enum(["active", "completed"]);
const DatabaseProgressionModeSchema = z.enum(["scheduled", "flexible"]);

const DashboardTaskStateSchema = z.enum([
  "available",
  "in_progress",
  "submitted",
  "resubmitted",
  "revision_required",
]);

export const LearnerCourseProjectionRowSchema = z.object({
  enrollment_id: UuidSchema,
  enrollment_state: EnrollmentStateSchema,
  course_id: UuidSchema,
  cohort_id: UuidSchema.nullable(),
  cohort_state: CohortStateSchema.nullable(),
  content_version_id: UuidSchema.nullable(),
  content_version_state: ContentVersionStateSchema.nullable(),
  version_number: z.number().int().positive().nullable(),
  title: z.string().trim().min(1),
  progression_mode: DatabaseProgressionModeSchema.nullable(),
  completed_activities: z.number().int().nonnegative(),
  total_activities: z.number().int().nonnegative(),
  next_task_id: UuidSchema.nullable(),
  next_task_title: z.string().trim().min(1).nullable(),
  next_task_state: DashboardTaskStateSchema.nullable(),
}).strict().superRefine((row, context) => {
  const isPinned = row.enrollment_state === "assigned" || row.enrollment_state === "completed";
  const pinnedFields = [
    row.cohort_id,
    row.cohort_state,
    row.content_version_id,
    row.content_version_state,
    row.version_number,
    row.progression_mode,
  ];

  if (isPinned && pinnedFields.some((value) => value === null)) {
    context.addIssue({
      code: "custom",
      message: "learning.pinned_course_projection_incomplete",
    });
  }
  if (!isPinned && pinnedFields.some((value) => value !== null)) {
    context.addIssue({
      code: "custom",
      message: "learning.pending_course_must_be_unpinned",
    });
  }
  if (
    (row.enrollment_state === "assigned" && row.cohort_state !== "active") ||
    (row.enrollment_state === "completed" && row.cohort_state !== "completed")
  ) {
    context.addIssue({
      code: "custom",
      message: "learning.enrollment_cohort_state_mismatch",
    });
  }

  const nextTaskFields = [row.next_task_id, row.next_task_title, row.next_task_state];
  const hasNextTask = nextTaskFields.every((value) => value !== null);
  if (!hasNextTask && nextTaskFields.some((value) => value !== null)) {
    context.addIssue({
      code: "custom",
      message: "learning.next_task_projection_incomplete",
    });
  }
  if (hasNextTask && row.enrollment_state !== "assigned") {
    context.addIssue({
      code: "custom",
      message: "learning.next_task_requires_active_assignment",
    });
  }
  if (row.completed_activities > row.total_activities) {
    context.addIssue({
      code: "custom",
      message: "learning.invalid_activity_progress",
    });
  }
});

export const LearnerCourseProjectionSchema = z.array(
  LearnerCourseProjectionRowSchema,
);

export type LearnerCourseProjectionRow = z.infer<
  typeof LearnerCourseProjectionRowSchema
>;

const CourseActivityProjectionSchema = z.object({
  id: UuidSchema,
  title: z.string().trim().min(1),
  description: z.string().trim(),
  position: z.number().int().nonnegative(),
  state: z.enum([
    "available",
    "in_progress",
    "submitted",
    "revision_required",
    "accepted",
    "locked",
  ]),
  lock_reasons: z.array(CourseActivityLockReasonSchema),
  expected_minutes: z.number().int().positive().nullable(),
  available_from: TimestampSchema.nullable(),
  due_at: TimestampSchema.nullable(),
}).strict();

const CourseStageProjectionSchema = z.object({
  id: UuidSchema,
  title: z.string().trim().min(1),
  description: z.string().trim(),
  position: z.number().int().nonnegative(),
  activities: z.array(CourseActivityProjectionSchema),
}).strict();

export const LearnerCourseWorkspaceProjectionSchema = z.object({
  course_id: UuidSchema,
  enrollment_id: UuidSchema,
  enrollment_state: z.enum(["assigned", "completed"]),
  cohort_id: UuidSchema,
  cohort_state: CohortStateSchema,
  content_version_id: UuidSchema,
  content_version_state: ContentVersionStateSchema,
  version_number: z.number().int().positive(),
  title: z.string().trim().min(1),
  summary: z.string().trim(),
  cohort_name: z.string().trim().min(1),
  progression_mode: DatabaseProgressionModeSchema,
  completed_activities: z.number().int().nonnegative(),
  total_activities: z.number().int().nonnegative(),
  stages: z.array(CourseStageProjectionSchema),
}).strict().superRefine((projection, context) => {
  if (
    (projection.enrollment_state === "assigned" && projection.cohort_state !== "active") ||
    (projection.enrollment_state === "completed" && projection.cohort_state !== "completed")
  ) {
    context.addIssue({
      code: "custom",
      message: "learning.enrollment_cohort_state_mismatch",
    });
  }
  if (projection.completed_activities > projection.total_activities) {
    context.addIssue({
      code: "custom",
      message: "learning.invalid_activity_progress",
    });
  }
  const projectedTotal = projection.stages.reduce(
    (total, stage) => total + stage.activities.length,
    0,
  );
  if (projectedTotal !== projection.total_activities) {
    context.addIssue({
      code: "custom",
      message: "learning.activity_total_mismatch",
    });
  }
});

const CompleteLocalizedTextSchema = z.object({
  en: z.string().trim().min(1),
  de: z.string().trim().min(1),
  ru: z.string().trim().min(1),
}).strict();

const TaskOptionProjectionSchema = z.object({
  id: UuidSchema,
  label: CompleteLocalizedTextSchema,
}).strict();

const TaskAssessmentProjectionSchema = z.object({
  id: z.string().trim().min(1),
  question: CompleteLocalizedTextSchema,
  selection_mode: z.enum(["single", "multiple"]),
  options: z.array(TaskOptionProjectionSchema).min(2),
}).strict();

const TaskHintProjectionSchema = z.object({
  id: UuidSchema,
  content: CompleteLocalizedTextSchema,
}).strict();

export const LearnerTaskProjectionSchema = z.object({
  id: UuidSchema,
  version_number: z.number().int().positive(),
  content_version_id: UuidSchema,
  content_version_state: ContentVersionStateSchema,
  course_id: UuidSchema,
  enrollment_id: UuidSchema,
  cohort_id: UuidSchema,
  cohort_state: z.literal("active"),
  stage_id: UuidSchema,
  title: CompleteLocalizedTextSchema,
  instructions: CompleteLocalizedTextSchema,
  target_url: z.string().url().nullable(),
  hint: TaskHintProjectionSchema.nullable(),
  assessment: TaskAssessmentProjectionSchema.nullable(),
  activated_at: TimestampSchema.nullable(),
  access: z.literal("available"),
}).strict();

export type LearnerTaskProjection = z.infer<typeof LearnerTaskProjectionSchema>;

const nextActionReasons: Record<Locale, string> = {
  en: "Continue the next available practical task.",
  de: "Setze mit der nächsten verfügbaren Praxisaufgabe fort.",
  ru: "Продолжите со следующим доступным практическим заданием.",
};

function canonicalTimestamp(value: string): string {
  return new Date(value).toISOString();
}

function dashboardProgressionMode(
  row: LearnerCourseProjectionRow,
): LearnerCourseSummary["progressionMode"] {
  if (row.progression_mode === "flexible") return "manual_path";
  return "legacy_schedule";
}

function dashboardCourseState(
  state: LearnerCourseProjectionRow["enrollment_state"],
): LearnerCourseSummary["state"] {
  if (state === "assigned") return "active";
  if (state === "completed") return "completed";
  return "requested";
}

function dashboardTaskState(
  state: NonNullable<LearnerCourseProjectionRow["next_task_state"]>,
): NonNullable<LearnerDashboard["nextAction"]>["state"] {
  if (state === "submitted" || state === "resubmitted") return "in_review";
  return state;
}

export function toLearnerDashboard(
  unsafeRows: unknown,
  locale: Locale,
): LearnerDashboard {
  const rows = LearnerCourseProjectionSchema.parse(unsafeRows);
  const summaries = rows.map((row): LearnerCourseSummary => ({
    id: row.enrollment_id,
    courseId: row.course_id,
    ...(row.cohort_id ? { groupId: row.cohort_id } : {}),
    title: row.title,
    state: dashboardCourseState(row.enrollment_state),
    progressionMode: dashboardProgressionMode(row),
    completedActivities: row.completed_activities,
    totalActivities: row.total_activities,
  }));
  const nextRow = rows.find((row) => row.next_task_id !== null);

  return LearnerDashboardSchema.parse({
    activeCourses: summaries.filter((course) => course.state === "active"),
    completedCourses: summaries.filter((course) => course.state === "completed"),
    requestedCourses: summaries.filter((course) => course.state === "requested"),
    nextAction:
      nextRow?.next_task_id && nextRow.next_task_title && nextRow.next_task_state
        ? {
            activityId: nextRow.next_task_id,
            courseId: nextRow.course_id,
            title: nextRow.next_task_title,
            state: dashboardTaskState(nextRow.next_task_state),
            reason: nextActionReasons[locale],
            href: `/learn/tasks/${nextRow.next_task_id}`,
          }
        : null,
  });
}

function toCourseActivityState(
  value: z.infer<typeof CourseActivityProjectionSchema>["state"],
): CourseActivityState {
  return value;
}

export function toLearnerCourseWorkspace(
  unsafeProjection: unknown,
): LearnerCourseWorkspace {
  const projection = LearnerCourseWorkspaceProjectionSchema.parse(unsafeProjection);

  return LearnerCourseWorkspaceSchema.parse({
    courseId: projection.course_id,
    enrollmentId: projection.enrollment_id,
    cohortId: projection.cohort_id,
    accessMode: projection.enrollment_state === "assigned" ? "active" : "history",
    title: projection.title,
    summary: projection.summary,
    cohortName: projection.cohort_name,
    progressionMode: projection.progression_mode,
    completedActivities: projection.completed_activities,
    totalActivities: projection.total_activities,
    stages: projection.stages.map((stage) => ({
      id: stage.id,
      title: stage.title,
      description: stage.description,
      position: stage.position,
      activities: stage.activities.map((activity) => ({
        id: activity.id,
        title: activity.title,
        description: activity.description,
        position: activity.position,
        state: toCourseActivityState(activity.state),
        lockReasons: activity.lock_reasons,
        ...(activity.expected_minutes === null
          ? {}
          : { expectedMinutes: activity.expected_minutes }),
        ...(activity.available_from === null
          ? {}
          : { availableFrom: canonicalTimestamp(activity.available_from) }),
        ...(activity.due_at === null
          ? {}
          : { dueAt: canonicalTimestamp(activity.due_at) }),
      })),
    })),
  });
}

export function toLearnerTask(unsafeProjection: unknown): {
  task: LearnerTask;
  enrollmentId: string;
} {
  const projection = LearnerTaskProjectionSchema.parse(unsafeProjection);
  const task = LearnerTaskSchema.parse({
    id: projection.id,
    version: projection.version_number,
    courseId: projection.course_id,
    groupId: projection.cohort_id,
    stageId: projection.stage_id,
    title: projection.title,
    instructions: projection.instructions,
    ...(projection.target_url ? { targetUrl: projection.target_url } : {}),
    ...(projection.hint
      ? { hintId: projection.hint.id, hint: projection.hint.content }
      : {}),
    ...(projection.assessment
      ? {
          assessment: {
            id: projection.assessment.id,
            question: projection.assessment.question,
            selectionMode: projection.assessment.selection_mode,
            options: projection.assessment.options,
          },
        }
      : {}),
    ...(projection.activated_at
      ? { activatedAt: canonicalTimestamp(projection.activated_at) }
      : {}),
    access: projection.access,
  });

  return { task, enrollmentId: projection.enrollment_id };
}
