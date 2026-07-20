import { z } from "zod";

import { ReviewError } from "./errors";
import type {
  AuditEventRequest,
  CriterionScore,
  NotificationRequest,
  ReviewCommandPort,
  ReviewDecision,
  ReviewPrincipal,
  ReviewSubmission,
} from "./model";
import { assertCanReview } from "./policy";
import { buildMasteryEvidenceRequests, evaluateRubric } from "./rubric";

const decisionInputSchema = z.object({
  submissionId: z.string().min(1),
  expectedVersion: z.number().int().nonnegative(),
  decision: z.enum(["accepted", "revision_required"]),
  comment: z.string().trim().min(3).max(5_000),
  rubricScores: z.array(z.object({
    criterionId: z.string().min(1),
    score: z.number().nonnegative(),
    comment: z.string().trim().max(2_000).optional(),
  })),
  idempotencyKey: z.string().min(8).max(200),
  correlationId: z.string().min(8).max(200),
});

const transferInputSchema = z.object({
  submissionId: z.string().min(1),
  expectedVersion: z.number().int().nonnegative(),
  toTrainerId: z.string().min(1),
  reason: z.string().trim().min(3).max(2_000),
  idempotencyKey: z.string().min(8).max(200),
  correlationId: z.string().min(8).max(200),
});

export type DecideReviewInput = z.input<typeof decisionInputSchema>;
export type TransferReviewInput = z.input<typeof transferInputSchema>;

function parseInput<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new ReviewError(
      "REVIEW_INVALID_INPUT",
      "The review command is invalid.",
      { issueCount: result.error.issues.length },
    );
  }
  return result.data;
}

function assertReviewable(submission: ReviewSubmission, expectedVersion: number): void {
  if (submission.version !== expectedVersion) {
    throw new ReviewError(
      "REVIEW_VERSION_CONFLICT",
      "The submission changed after it was opened. Reload before deciding.",
      { expectedVersion, actualVersion: submission.version },
    );
  }
  if (submission.state !== "submitted" && submission.state !== "resubmitted") {
    throw new ReviewError(
      "REVIEW_INVALID_STATE",
      `Submission state ${submission.state} cannot be reviewed.`,
      { submissionId: submission.id },
    );
  }
}

function notificationForDecision(
  submission: ReviewSubmission,
  decision: ReviewDecision,
  idempotencyKey: string,
): NotificationRequest {
  return {
    recipientId: submission.learnerId,
    template: decision === "accepted"
      ? "submission_accepted"
      : "submission_revision_required",
    idempotencyKey: `${idempotencyKey}:notification`,
    variables: { submissionId: submission.id, taskTitle: submission.taskTitle },
  };
}

function auditRequest(input: {
  readonly eventName: string;
  readonly principal: ReviewPrincipal;
  readonly submissionId: string;
  readonly correlationId: string;
  readonly metadata: Readonly<Record<string, string | number | boolean>>;
}): AuditEventRequest {
  return {
    eventName: input.eventName,
    actorId: input.principal.userId,
    organizationId: input.principal.organizationId,
    resourceType: "submission",
    resourceId: input.submissionId,
    correlationId: input.correlationId,
    metadata: input.metadata,
  };
}

export class ReviewService {
  constructor(private readonly port: ReviewCommandPort) {}

  async decide(principal: ReviewPrincipal, rawInput: DecideReviewInput): Promise<ReviewSubmission> {
    const input = parseInput(decisionInputSchema, rawInput);
    const submission = await this.port.getSubmission(input.submissionId);
    if (!submission) {
      throw new ReviewError("REVIEW_NOT_FOUND", "The submission does not exist.");
    }

    assertCanReview(principal, submission, "review:decide");
    assertReviewable(submission, input.expectedVersion);

    const rubricScores: readonly CriterionScore[] = input.rubricScores.map((score) => ({
      criterionId: score.criterionId,
      score: score.score,
      ...(score.comment === undefined ? {} : { comment: score.comment }),
    }));
    let rubricResult;
    if (submission.rubric) {
      rubricResult = evaluateRubric(submission.rubric, rubricScores);
      const rubricDecision: ReviewDecision = rubricResult.passesThreshold
        ? "accepted"
        : "revision_required";
      if (rubricDecision !== input.decision) {
        throw new ReviewError(
          "REVIEW_RUBRIC_INVALID",
          "The requested decision conflicts with the configured rubric threshold.",
        );
      }
    } else if (input.rubricScores.length > 0) {
      throw new ReviewError(
        "REVIEW_RUBRIC_INVALID",
        "Rubric scores were supplied for a submission without a rubric.",
      );
    }

    const masteryEvidence = input.decision === "accepted" && submission.rubric && rubricResult
      ? buildMasteryEvidenceRequests({
          learnerId: submission.learnerId,
          submissionId: submission.id,
          reviewerId: principal.userId,
          idempotencyKey: input.idempotencyKey,
          rubric: submission.rubric,
          result: rubricResult,
        })
      : [];

    return this.port.decide(
      {
        submissionId: input.submissionId,
        expectedVersion: input.expectedVersion,
        decision: input.decision,
        comment: input.comment,
        rubricScores,
        reviewerId: principal.userId,
        idempotencyKey: input.idempotencyKey,
      },
      {
        audit: auditRequest({
          eventName: `review.${input.decision}`,
          principal,
          submissionId: submission.id,
          correlationId: input.correlationId,
          metadata: {
            fromState: submission.state,
            decision: input.decision,
            expectedVersion: input.expectedVersion,
          },
        }),
        notification: notificationForDecision(submission, input.decision, input.idempotencyKey),
        masteryEvidence,
      },
    );
  }

  async transfer(
    principal: ReviewPrincipal,
    rawInput: TransferReviewInput,
  ): Promise<ReviewSubmission> {
    const input = parseInput(transferInputSchema, rawInput);
    const submission = await this.port.getSubmission(input.submissionId);
    if (!submission) {
      throw new ReviewError("REVIEW_NOT_FOUND", "The submission does not exist.");
    }

    assertCanReview(principal, submission, "review:transfer");
    assertReviewable(submission, input.expectedVersion);
    if (input.toTrainerId === principal.userId) {
      throw new ReviewError(
        "REVIEW_INVALID_INPUT",
        "A submission cannot be transferred to the current reviewer.",
      );
    }

    return this.port.transfer(
      {
        submissionId: input.submissionId,
        expectedVersion: input.expectedVersion,
        fromTrainerId: principal.userId,
        toTrainerId: input.toTrainerId,
        reason: input.reason,
        idempotencyKey: input.idempotencyKey,
      },
      {
        audit: auditRequest({
          eventName: "review.transferred",
          principal,
          submissionId: submission.id,
          correlationId: input.correlationId,
          metadata: {
            fromTrainerId: principal.userId,
            toTrainerId: input.toTrainerId,
            expectedVersion: input.expectedVersion,
          },
        }),
        notification: {
          recipientId: input.toTrainerId,
          template: "submission_transferred",
          idempotencyKey: `${input.idempotencyKey}:notification`,
          variables: { submissionId: submission.id, taskTitle: submission.taskTitle },
        },
      },
    );
  }
}
