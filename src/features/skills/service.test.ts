import { describe, expect, it, vi } from "vitest";

import type { Principal } from "@/shared/auth/types";

import type { Skill, SkillEvidence } from "./model";
import {
  SkillDomainError,
  appendSkillEvidence,
  calculateMastery,
  createRecommendationOverride,
  scorePlacement,
  selectNextLearningAction,
  validateSkillGraph,
} from "./service";

const now = "2026-07-17T12:00:00.000Z";
const learner: Principal = {
  userId: "learner-1",
  sessionId: "session-1",
  organizationId: "org-1",
  primaryRole: "learner",
  roles: ["learner"],
  permissions: [],
  cohortIds: ["cohort-1"],
};
const skills: Skill[] = [
  { id: "basics", code: "BAS", title: "Basics", prerequisiteSkillIds: [], targetScore: 0.8, estimatedMinutes: 30 },
  { id: "design", code: "DES", title: "Test design", prerequisiteSkillIds: ["basics"], targetScore: 0.8, estimatedMinutes: 50 },
];

describe("skills domain", () => {
  it("calculates weighted mastery from verified evidence only", () => {
    const evidence: SkillEvidence[] = [
      { id: "e1", learnerId: "learner-1", skillId: "basics", sourceType: "review", sourceId: "r1", score: 1, weight: 2, verified: true, recordedAt: now, idempotencyKey: "review:learner-1:r1" },
      { id: "e2", learnerId: "learner-1", skillId: "basics", sourceType: "submission", sourceId: "s1", score: 0, weight: 9, verified: false, recordedAt: now, idempotencyKey: "submit:learner-1:s1" },
    ];
    expect(calculateMastery("learner-1", "basics", evidence, now)).toMatchObject({ score: 1, level: "mastered", verifiedEvidenceCount: 1 });
  });

  it("chooses an explainable unblocked action deterministically", () => {
    expect(selectNextLearningAction(skills, new Map([["basics", 0.9]]), ["basics", "design"])).toMatchObject({ skillId: "design", reason: "largest_mastery_gap", blockedBy: [] });
  });

  it("reports prerequisites when every target remains blocked", () => {
    expect(selectNextLearningAction([skills[1]!], new Map(), ["design"])).toMatchObject({ skillId: "design", reason: "prerequisite_gap", blockedBy: ["basics"] });
  });

  it("rejects cyclic skill graphs", () => {
    expect(() => validateSkillGraph([
      { ...skills[0]!, prerequisiteSkillIds: ["design"] },
      skills[1]!,
    ])).toThrowError(new SkillDomainError("skills.cycle_detected"));
  });

  it("scores placement per skill", () => {
    expect(scorePlacement("learner-1", [
      { itemId: "q1", skillId: "basics", score: 1, weight: 2 },
      { itemId: "q2", skillId: "basics", score: 0.5, weight: 1 },
    ], now)[0]).toMatchObject({ skillId: "basics", score: 5 / 6, level: "proficient" });
  });

  it("deduplicates append-only evidence by idempotency key", async () => {
    const stored: SkillEvidence = { id: "e1", learnerId: "learner-1", skillId: "basics", sourceType: "review", sourceId: "r1", score: 1, weight: 1, verified: true, recordedAt: now, idempotencyKey: "review:learner-1:r1" };
    const append = vi.fn();
    await expect(appendSkillEvidence({ findByIdempotencyKey: vi.fn().mockResolvedValue(stored), append }, learner, stored)).resolves.toEqual(stored);
    expect(append).not.toHaveBeenCalled();
  });

  it("requires an authorized, documented path override", () => {
    expect(() => createRecommendationOverride(learner, { learnerId: "learner-1", skillId: "design", reason: "Trainer calibration requires remediation", createdAt: now })).toThrowError(new SkillDomainError("skills.forbidden"));
    expect(createRecommendationOverride({ ...learner, permissions: ["learning_path.override"] }, { learnerId: "learner-1", skillId: "design", reason: "Trainer calibration requires remediation", createdAt: now })).toMatchObject({ overriddenBy: "learner-1", skillId: "design" });
  });
});
