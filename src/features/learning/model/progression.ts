import { z } from "zod";

export const ProgressionModeSchema = z.enum([
  "legacy_schedule",
  "manual_path",
  "competency_path",
]);

export type ProgressionMode = z.infer<typeof ProgressionModeSchema>;

export const ActivityStateSchema = z.enum([
  "blocked",
  "available",
  "in_progress",
  "in_review",
  "revision_required",
  "completed",
]);

export type ActivityState = z.infer<typeof ActivityStateSchema>;

export const LearningActivitySchema = z.object({
  id: z.string().min(1),
  stageId: z.string().min(1),
  title: z.string().trim().min(1),
  type: z.enum(["content", "task", "assessment", "lab"]),
  order: z.number().int().nonnegative(),
  activationAt: z.string().datetime().optional(),
  prerequisiteActivityIds: z.array(z.string().min(1)),
  prerequisiteSkillIds: z.array(z.string().min(1)),
  currentState: ActivityStateSchema.optional(),
});

export type LearningActivity = z.infer<typeof LearningActivitySchema>;

export const ProgressionContextSchema = z.object({
  mode: ProgressionModeSchema,
  now: z.string().datetime(),
  prerequisitesEnabled: z.boolean(),
  completedActivityIds: z.array(z.string().min(1)),
  masteredSkillIds: z.array(z.string().min(1)),
  manuallyUnlockedActivityIds: z.array(z.string().min(1)),
});

export type ProgressionContext = z.infer<typeof ProgressionContextSchema>;

export const BlockReasonSchema = z.object({
  code: z.enum([
    "activation_date",
    "manual_unlock_required",
    "activity_prerequisite",
    "skill_prerequisite",
  ]),
  referenceId: z.string().min(1).optional(),
});

export type BlockReason = z.infer<typeof BlockReasonSchema>;

export interface ProgressionDecision {
  state: ActivityState;
  reasons: BlockReason[];
}

export function evaluateActivityAvailability(
  rawActivity: unknown,
  rawContext: unknown,
): ProgressionDecision {
  const activity = LearningActivitySchema.parse(rawActivity);
  const context = ProgressionContextSchema.parse(rawContext);

  if (context.completedActivityIds.includes(activity.id)) {
    return { state: "completed", reasons: [] };
  }

  if (
    activity.currentState &&
    ["in_progress", "in_review", "revision_required"].includes(activity.currentState)
  ) {
    return { state: activity.currentState, reasons: [] };
  }

  const reasons: BlockReason[] = [];
  if (
    context.mode === "legacy_schedule" &&
    activity.activationAt &&
    new Date(activity.activationAt).getTime() > new Date(context.now).getTime()
  ) {
    reasons.push({ code: "activation_date", referenceId: activity.activationAt });
  }

  if (
    context.mode === "manual_path" &&
    !context.manuallyUnlockedActivityIds.includes(activity.id)
  ) {
    reasons.push({ code: "manual_unlock_required" });
  }

  if (context.prerequisitesEnabled) {
    for (const prerequisiteId of activity.prerequisiteActivityIds) {
      if (!context.completedActivityIds.includes(prerequisiteId)) {
        reasons.push({ code: "activity_prerequisite", referenceId: prerequisiteId });
      }
    }
  }

  if (context.mode === "competency_path") {
    for (const skillId of activity.prerequisiteSkillIds) {
      if (!context.masteredSkillIds.includes(skillId)) {
        reasons.push({ code: "skill_prerequisite", referenceId: skillId });
      }
    }
  }

  return reasons.length > 0
    ? { state: "blocked", reasons }
    : { state: "available", reasons: [] };
}

export function selectNextActivity(
  activities: readonly LearningActivity[],
  context: ProgressionContext,
): { activity: LearningActivity; decision: ProgressionDecision } | null {
  const sorted = [...activities].sort((left, right) => left.order - right.order);

  for (const activity of sorted) {
    const decision = evaluateActivityAvailability(activity, context);
    if (["revision_required", "in_progress", "available"].includes(decision.state)) {
      return { activity, decision };
    }
  }

  return null;
}
