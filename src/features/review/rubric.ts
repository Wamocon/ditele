import { ReviewError } from "./errors";
import type {
  CriterionScore,
  MasteryEvidenceRequest,
  ReviewRubric,
  RubricResult,
} from "./model";

const PERCENT_MULTIPLIER = 100;

export function evaluateRubric(
  rubric: ReviewRubric,
  submittedScores: readonly CriterionScore[],
): RubricResult {
  const scoreByCriterion = new Map(
    submittedScores.map((score) => [score.criterionId, score] as const),
  );

  if (scoreByCriterion.size !== submittedScores.length) {
    throw new ReviewError("REVIEW_RUBRIC_INVALID", "A rubric criterion was scored twice.");
  }

  let earnedPoints = 0;
  let possiblePoints = 0;

  for (const criterion of rubric.criteria) {
    const score = scoreByCriterion.get(criterion.id);
    if (criterion.required && !score) {
      throw new ReviewError(
        "REVIEW_RUBRIC_INVALID",
        `Required rubric criterion ${criterion.id} is missing.`,
        { criterionId: criterion.id },
      );
    }
    if (!score) {
      continue;
    }
    if (!Number.isFinite(score.score) || score.score < 0 || score.score > criterion.maxScore) {
      throw new ReviewError(
        "REVIEW_RUBRIC_INVALID",
        `Score for criterion ${criterion.id} is outside its allowed range.`,
        { criterionId: criterion.id, score: score.score },
      );
    }
    earnedPoints += score.score * criterion.weight;
    possiblePoints += criterion.maxScore * criterion.weight;
  }

  for (const criterionId of scoreByCriterion.keys()) {
    if (!rubric.criteria.some((criterion) => criterion.id === criterionId)) {
      throw new ReviewError(
        "REVIEW_RUBRIC_INVALID",
        `Unknown rubric criterion ${criterionId}.`,
        { criterionId },
      );
    }
  }

  const percent = possiblePoints === 0
    ? 0
    : Math.round((earnedPoints / possiblePoints) * PERCENT_MULTIPLIER * 100) / 100;

  return {
    rubricId: rubric.id,
    rubricVersion: rubric.version,
    scores: submittedScores,
    earnedPoints,
    possiblePoints,
    percent,
    passesThreshold: percent >= rubric.acceptanceThresholdPercent,
  };
}

export function buildMasteryEvidenceRequests(input: {
  readonly learnerId: string;
  readonly submissionId: string;
  readonly reviewerId: string;
  readonly idempotencyKey: string;
  readonly rubric: ReviewRubric;
  readonly result: RubricResult;
}): readonly MasteryEvidenceRequest[] {
  const scores = new Map(input.result.scores.map((score) => [score.criterionId, score]));
  return input.rubric.criteria.flatMap((criterion) => {
    const score = scores.get(criterion.id);
    if (!criterion.skillId || !score || criterion.maxScore === 0) {
      return [];
    }
    return [{
      learnerId: input.learnerId,
      skillId: criterion.skillId,
      sourceType: "trainer_review" as const,
      sourceId: input.submissionId,
      rubricId: input.rubric.id,
      rubricVersion: input.rubric.version,
      scorePercent: Math.round((score.score / criterion.maxScore) * 10_000) / 100,
      recordedBy: input.reviewerId,
      idempotencyKey: `${input.idempotencyKey}:mastery:${criterion.skillId}`,
    }];
  });
}
