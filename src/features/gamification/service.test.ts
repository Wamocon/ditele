import { describe, expect, it, vi } from "vitest";

import { awardSkillXp, buildOptInLeaderboard, earnedBadges } from "./service";

const awardedAt = "2026-07-17T12:00:00.000Z";
const entry = { id: "xp-1", learnerId: "learner-1", skillId: "skill-1", sourceEventId: "event-1", eventType: "skill.mastered" as const, amount: 150, awardedAt };

describe("gamification", () => {
  it("awards positive skill XP only for demonstrated-learning event types", async () => {
    const repository = { findBySourceEventId: vi.fn().mockResolvedValue(null), append: vi.fn().mockResolvedValue(entry) };
    await expect(awardSkillXp(repository, { id: "event-1", learnerId: "learner-1", skillId: "skill-1", type: "skill.mastered", demonstratedScore: 1, occurredAt: awardedAt })).resolves.toEqual(entry);
    await expect(awardSkillXp(repository, { id: "event-2", learnerId: "learner-1", skillId: "skill-1", type: "login", demonstratedScore: 1, occurredAt: awardedAt })).rejects.toThrow();
  });

  it("replays events idempotently without another ledger append", async () => {
    const repository = { findBySourceEventId: vi.fn().mockResolvedValue(entry), append: vi.fn() };
    await awardSkillXp(repository, { id: "event-1", learnerId: "learner-1", skillId: "skill-1", type: "skill.mastered", demonstratedScore: 1, occurredAt: awardedAt });
    expect(repository.append).not.toHaveBeenCalled();
  });

  it("earns badges from immutable ledger totals", () => {
    expect(earnedBadges([entry], [{ id: "badge-1", title: "Mastery", skillId: "skill-1", minimumXp: 100 }])).toHaveLength(1);
  });

  it("excludes non-opted-in learners and sorts ties deterministically", () => {
    expect(buildOptInLeaderboard([
      { learnerId: "b", displayName: "Private", xp: 999, optedIn: false },
      { learnerId: "b", displayName: "B", xp: 100, optedIn: true },
      { learnerId: "a", displayName: "A", xp: 100, optedIn: true },
    ]).map((item) => item.learnerId)).toEqual(["a", "b"]);
  });
});
