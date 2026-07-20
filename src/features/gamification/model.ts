import { z } from "zod";

export const RewardEventTypeSchema = z.enum([
  "review.accepted",
  "lab.validation_passed",
  "skill.mastered",
  "mission.completed",
]);
export type RewardEventType = z.infer<typeof RewardEventTypeSchema>;

export const RewardEventSchema = z.object({
  id: z.string().min(1),
  learnerId: z.string().min(1),
  skillId: z.string().min(1),
  type: RewardEventTypeSchema,
  demonstratedScore: z.number().min(0).max(1),
  occurredAt: z.string().datetime(),
});
export type RewardEvent = z.infer<typeof RewardEventSchema>;

export const XpLedgerEntrySchema = z.object({
  id: z.string().min(1),
  learnerId: z.string().min(1),
  skillId: z.string().min(1),
  sourceEventId: z.string().min(1),
  eventType: RewardEventTypeSchema,
  amount: z.number().int().positive(),
  awardedAt: z.string().datetime(),
});
export type XpLedgerEntry = z.infer<typeof XpLedgerEntrySchema>;

export const BadgeRuleSchema = z.object({
  id: z.string().min(1),
  title: z.string().trim().min(1).max(120),
  skillId: z.string().min(1),
  minimumXp: z.number().int().positive(),
});
export type BadgeRule = z.infer<typeof BadgeRuleSchema>;

export const LeaderboardEntrySchema = z.object({
  learnerId: z.string().min(1),
  displayName: z.string().trim().min(1).max(80),
  xp: z.number().int().nonnegative(),
  optedIn: z.boolean(),
});
export type LeaderboardEntry = z.infer<typeof LeaderboardEntrySchema>;
