import { z } from "zod";

export const CourseActivityStateSchema = z.enum([
  "available",
  "in_progress",
  "submitted",
  "revision_required",
  "accepted",
  "locked",
]);

export type CourseActivityState = z.infer<typeof CourseActivityStateSchema>;

const SimpleCourseActivityLockReasonSchema = z.object({
  code: z.enum([
    "schedule",
    "entitlement",
    "configuration",
    "required_task",
    "history",
  ]),
}).strict();

const SkillCourseActivityLockReasonSchema = z.object({
  code: z.literal("required_skill"),
  current_basis_points: z.number().int().min(0).max(10_000),
  minimum_basis_points: z.number().int().min(0).max(10_000),
}).strict();

export const CourseActivityLockReasonSchema = z.discriminatedUnion("code", [
  SimpleCourseActivityLockReasonSchema,
  SkillCourseActivityLockReasonSchema,
]);

export type CourseActivityLockReason = z.infer<
  typeof CourseActivityLockReasonSchema
>;

export const CourseActivitySchema = z.object({
  id: z.string().uuid(),
  title: z.string().trim().min(1),
  description: z.string().trim(),
  position: z.number().int().nonnegative(),
  state: CourseActivityStateSchema,
  lockReasons: z.array(CourseActivityLockReasonSchema),
  expectedMinutes: z.number().int().positive().optional(),
  availableFrom: z.string().datetime().optional(),
  dueAt: z.string().datetime().optional(),
}).superRefine((activity, context) => {
  if (activity.state === "locked" && activity.lockReasons.length === 0) {
    context.addIssue({
      code: "custom",
      message: "learning.locked_activity_requires_reason",
    });
  }
  if (activity.state !== "locked" && activity.lockReasons.length > 0) {
    context.addIssue({
      code: "custom",
      message: "learning.open_activity_cannot_have_lock_reason",
    });
  }
});

export type CourseActivity = z.infer<typeof CourseActivitySchema>;

export const CourseStageSchema = z.object({
  id: z.string().uuid(),
  title: z.string().trim().min(1),
  description: z.string().trim(),
  position: z.number().int().nonnegative(),
  activities: z.array(CourseActivitySchema),
});

export const LearnerCourseWorkspaceSchema = z.object({
  courseId: z.string().uuid(),
  enrollmentId: z.string().uuid(),
  cohortId: z.string().uuid(),
  accessMode: z.enum(["active", "history"]),
  title: z.string().trim().min(1),
  summary: z.string().trim(),
  cohortName: z.string().trim().min(1),
  progressionMode: z.enum(["scheduled", "flexible"]),
  completedActivities: z.number().int().nonnegative(),
  totalActivities: z.number().int().nonnegative(),
  stages: z.array(CourseStageSchema),
});

export type LearnerCourseWorkspace = z.infer<typeof LearnerCourseWorkspaceSchema>;
