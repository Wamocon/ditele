import {
  BadgeRuleSchema,
  LeaderboardEntrySchema,
  RewardEventSchema,
  XpLedgerEntrySchema,
  type BadgeRule,
  type LeaderboardEntry,
  type RewardEvent,
  type XpLedgerEntry,
} from "./model";

export interface XpLedgerRepository {
  findBySourceEventId(id: string): Promise<unknown | null>;
  append(entry: Omit<XpLedgerEntry, "id">): Promise<unknown>;
}

const baseXp: Readonly<Record<RewardEvent["type"], number>> = {
  "review.accepted": 80,
  "lab.validation_passed": 100,
  "skill.mastered": 150,
  "mission.completed": 120,
};

export async function awardSkillXp(
  repository: XpLedgerRepository,
  eventInput: unknown,
): Promise<XpLedgerEntry> {
  const event = RewardEventSchema.parse(eventInput);
  const existing = await repository.findBySourceEventId(event.id);
  if (existing) return XpLedgerEntrySchema.parse(existing);
  const amount = Math.max(1, Math.round(baseXp[event.type] * event.demonstratedScore));
  return XpLedgerEntrySchema.parse(await repository.append({
    learnerId: event.learnerId,
    skillId: event.skillId,
    sourceEventId: event.id,
    eventType: event.type,
    amount,
    awardedAt: event.occurredAt,
  }));
}

export function earnedBadges(entries: readonly XpLedgerEntry[], rulesInput: readonly BadgeRule[]): BadgeRule[] {
  const rules = rulesInput.map((rule) => BadgeRuleSchema.parse(rule));
  const xpBySkill = new Map<string, number>();
  for (const entry of entries) xpBySkill.set(entry.skillId, (xpBySkill.get(entry.skillId) ?? 0) + entry.amount);
  return rules.filter((rule) => (xpBySkill.get(rule.skillId) ?? 0) >= rule.minimumXp).sort((a, b) => a.id.localeCompare(b.id));
}

export function buildOptInLeaderboard(entriesInput: readonly LeaderboardEntry[]): LeaderboardEntry[] {
  return entriesInput
    .map((entry) => LeaderboardEntrySchema.parse(entry))
    .filter((entry) => entry.optedIn)
    .sort((left, right) => right.xp - left.xp || left.learnerId.localeCompare(right.learnerId));
}
