import { z } from "zod";

export const MasteryLevelSchema = z.enum([
  "not_started",
  "developing",
  "proficient",
  "mastered",
]);
export type MasteryLevel = z.infer<typeof MasteryLevelSchema>;

export const SkillSchema = z.object({
  id: z.string().min(1),
  code: z.string().trim().min(1).max(80),
  title: z.string().trim().min(1).max(160),
  prerequisiteSkillIds: z.array(z.string().min(1)),
  targetScore: z.number().min(0).max(1).default(0.8),
  estimatedMinutes: z.number().int().positive(),
});
export type Skill = z.infer<typeof SkillSchema>;

export const SkillEvidenceSchema = z.object({
  id: z.string().min(1),
  learnerId: z.string().min(1),
  skillId: z.string().min(1),
  sourceType: z.enum(["submission", "review", "lab_validation", "placement"]),
  sourceId: z.string().min(1),
  score: z.number().min(0).max(1),
  weight: z.number().positive().max(10),
  verified: z.boolean(),
  recordedAt: z.string().datetime(),
  idempotencyKey: z.string().trim().min(12).max(128),
});
export type SkillEvidence = z.infer<typeof SkillEvidenceSchema>;

export const RecordEvidenceInputSchema = SkillEvidenceSchema.omit({ id: true });
export type RecordEvidenceInput = z.infer<typeof RecordEvidenceInputSchema>;

export const MasterySnapshotSchema = z.object({
  learnerId: z.string().min(1),
  skillId: z.string().min(1),
  score: z.number().min(0).max(1),
  level: MasteryLevelSchema,
  verifiedEvidenceCount: z.number().int().nonnegative(),
  calculatedAt: z.string().datetime(),
});
export type MasterySnapshot = z.infer<typeof MasterySnapshotSchema>;

export const LearningGoalSchema = z.object({
  id: z.string().min(1),
  learnerId: z.string().min(1),
  targetSkillIds: z.array(z.string().min(1)).min(1),
});
export type LearningGoal = z.infer<typeof LearningGoalSchema>;

export const NextLearningActionSchema = z.object({
  skillId: z.string().min(1),
  reason: z.enum(["prerequisite_gap", "largest_mastery_gap", "remediation"]),
  currentScore: z.number().min(0).max(1),
  targetScore: z.number().min(0).max(1),
  estimatedMinutes: z.number().int().positive(),
  blockedBy: z.array(z.string().min(1)),
});
export type NextLearningAction = z.infer<typeof NextLearningActionSchema>;

export const PlacementResponseSchema = z.object({
  itemId: z.string().min(1),
  skillId: z.string().min(1),
  score: z.number().min(0).max(1),
  weight: z.number().positive().max(10),
});
export type PlacementResponse = z.infer<typeof PlacementResponseSchema>;

export const RecommendationOverrideSchema = z.object({
  learnerId: z.string().min(1),
  skillId: z.string().min(1),
  reason: z.string().trim().min(10).max(1000),
  overriddenBy: z.string().min(1),
  createdAt: z.string().datetime(),
});
export type RecommendationOverride = z.infer<typeof RecommendationOverrideSchema>;
