import type { Principal } from "@/shared/auth/types";

import {
  MasterySnapshotSchema,
  NextLearningActionSchema,
  PlacementResponseSchema,
  RecommendationOverrideSchema,
  RecordEvidenceInputSchema,
  SkillEvidenceSchema,
  SkillSchema,
  type MasterySnapshot,
  type NextLearningAction,
  type PlacementResponse,
  type RecommendationOverride,
  type RecordEvidenceInput,
  type Skill,
  type SkillEvidence,
} from "./model";

export class SkillDomainError extends Error {
  constructor(
    readonly code:
      | "skills.forbidden"
      | "skills.cycle_detected"
      | "skills.no_action_available",
  ) {
    super(code);
    this.name = "SkillDomainError";
  }
}

export interface SkillEvidenceRepository {
  findByIdempotencyKey(key: string): Promise<unknown | null>;
  append(input: RecordEvidenceInput): Promise<unknown>;
}

function canRecordEvidence(principal: Principal, learnerId: string): boolean {
  return (
    principal.userId === learnerId ||
    principal.permissions.includes("evidence.record") ||
    principal.permissions.includes("review.decide")
  );
}

export async function appendSkillEvidence(
  repository: SkillEvidenceRepository,
  principal: Principal,
  input: unknown,
): Promise<SkillEvidence> {
  const command = RecordEvidenceInputSchema.parse(input);
  if (!canRecordEvidence(principal, command.learnerId)) {
    throw new SkillDomainError("skills.forbidden");
  }
  const existing = await repository.findByIdempotencyKey(command.idempotencyKey);
  if (existing) return SkillEvidenceSchema.parse(existing);
  return SkillEvidenceSchema.parse(await repository.append(command));
}

export function masteryLevel(score: number, evidenceCount: number) {
  if (evidenceCount === 0) return "not_started" as const;
  if (score >= 0.85) return "mastered" as const;
  if (score >= 0.65) return "proficient" as const;
  return "developing" as const;
}

export function calculateMastery(
  learnerId: string,
  skillId: string,
  evidence: readonly SkillEvidence[],
  calculatedAt: string,
): MasterySnapshot {
  const verified = evidence.filter(
    (item) => item.learnerId === learnerId && item.skillId === skillId && item.verified,
  );
  const totals = verified.reduce(
    (result, item) => ({
      weightedScore: result.weightedScore + item.score * item.weight,
      weight: result.weight + item.weight,
    }),
    { weightedScore: 0, weight: 0 },
  );
  const score = totals.weight === 0 ? 0 : totals.weightedScore / totals.weight;
  return MasterySnapshotSchema.parse({
    learnerId,
    skillId,
    score,
    level: masteryLevel(score, verified.length),
    verifiedEvidenceCount: verified.length,
    calculatedAt,
  });
}

export function validateSkillGraph(skillsInput: readonly Skill[]): void {
  const skills = skillsInput.map((skill) => SkillSchema.parse(skill));
  const byId = new Map(skills.map((skill) => [skill.id, skill]));
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (id: string) => {
    if (visiting.has(id)) throw new SkillDomainError("skills.cycle_detected");
    if (visited.has(id)) return;
    visiting.add(id);
    for (const prerequisiteId of byId.get(id)?.prerequisiteSkillIds ?? []) {
      if (byId.has(prerequisiteId)) visit(prerequisiteId);
    }
    visiting.delete(id);
    visited.add(id);
  };
  for (const skill of skills) visit(skill.id);
}

export function selectNextLearningAction(
  skillsInput: readonly Skill[],
  mastery: ReadonlyMap<string, number>,
  targetSkillIds: readonly string[],
): NextLearningAction {
  const skills = skillsInput.map((skill) => SkillSchema.parse(skill));
  validateSkillGraph(skills);
  const byId = new Map(skills.map((skill) => [skill.id, skill]));
  const targetSet = new Set(targetSkillIds);
  const candidates = skills.filter((skill) => targetSet.has(skill.id));
  const ranked = candidates
    .map((skill) => {
      const blockedBy = skill.prerequisiteSkillIds.filter(
        (id) => (mastery.get(id) ?? 0) < (byId.get(id)?.targetScore ?? 0.8),
      );
      const currentScore = mastery.get(skill.id) ?? 0;
      return {
        skill,
        blockedBy,
        currentScore,
        gap: skill.targetScore - currentScore,
      };
    })
    .filter((candidate) => candidate.gap > 0)
    .sort((left, right) => {
      const blockingOrder = left.blockedBy.length - right.blockedBy.length;
      if (blockingOrder !== 0) return blockingOrder;
      const gapOrder = right.gap - left.gap;
      if (gapOrder !== 0) return gapOrder;
      return left.skill.id.localeCompare(right.skill.id);
    });
  const selected = ranked[0];
  if (!selected) throw new SkillDomainError("skills.no_action_available");
  return NextLearningActionSchema.parse({
    skillId: selected.skill.id,
    reason:
      selected.blockedBy.length > 0
        ? "prerequisite_gap"
        : selected.currentScore > 0
          ? "remediation"
          : "largest_mastery_gap",
    currentScore: selected.currentScore,
    targetScore: selected.skill.targetScore,
    estimatedMinutes: selected.skill.estimatedMinutes,
    blockedBy: selected.blockedBy,
  });
}

export function scorePlacement(
  learnerId: string,
  responsesInput: readonly PlacementResponse[],
  calculatedAt: string,
): MasterySnapshot[] {
  const responses = responsesInput.map((response) => PlacementResponseSchema.parse(response));
  const skillIds = [...new Set(responses.map((response) => response.skillId))].sort();
  return skillIds.map((skillId) =>
    calculateMastery(
      learnerId,
      skillId,
      responses
        .filter((response) => response.skillId === skillId)
        .map((response) => ({
          id: `placement:${response.itemId}`,
          learnerId,
          skillId,
          sourceType: "placement",
          sourceId: response.itemId,
          score: response.score,
          weight: response.weight,
          verified: true,
          recordedAt: calculatedAt,
          idempotencyKey: `placement:${learnerId}:${response.itemId}`,
        })),
      calculatedAt,
    ),
  );
}

export function createRecommendationOverride(
  principal: Principal,
  input: unknown,
): RecommendationOverride {
  if (!principal.permissions.includes("learning_path.override")) {
    throw new SkillDomainError("skills.forbidden");
  }
  return RecommendationOverrideSchema.parse({
    ...(typeof input === "object" && input !== null ? input : {}),
    overriddenBy: principal.userId,
  });
}
