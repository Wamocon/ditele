import { z } from "zod";

import { ActivityStateSchema, ProgressionModeSchema } from "./progression";

export const LearnerCourseSummarySchema = z.object({
  id: z.string().min(1),
  courseId: z.string().min(1),
  groupId: z.string().min(1).optional(),
  learningPathId: z.string().min(1).optional(),
  title: z.string().trim().min(1),
  state: z.enum(["requested", "active", "completed"]),
  progressionMode: ProgressionModeSchema,
  completedActivities: z.number().int().nonnegative(),
  totalActivities: z.number().int().nonnegative(),
});

export type LearnerCourseSummary = z.infer<typeof LearnerCourseSummarySchema>;

export const NextLearningActionSchema = z.object({
  activityId: z.string().min(1),
  courseId: z.string().min(1),
  title: z.string().trim().min(1),
  state: ActivityStateSchema,
  reason: z.string().trim().min(1),
  href: z.string().min(1),
});

export type NextLearningAction = z.infer<typeof NextLearningActionSchema>;

export const LearnerDashboardSchema = z.object({
  activeCourses: z.array(LearnerCourseSummarySchema),
  completedCourses: z.array(LearnerCourseSummarySchema),
  requestedCourses: z.array(LearnerCourseSummarySchema),
  nextAction: NextLearningActionSchema.nullable(),
});

export type LearnerDashboard = z.infer<typeof LearnerDashboardSchema>;
