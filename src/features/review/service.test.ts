import { describe, expect, it, vi } from "vitest";

import { ReviewError } from "./errors";
import type {
  ReviewCommandPort,
  ReviewDecisionCommand,
  ReviewEffects,
  ReviewPrincipal,
  ReviewSubmission,
  ReviewTransferCommand,
} from "./model";
import { ReviewService } from "./service";

function submission(overrides: Partial<ReviewSubmission> = {}): ReviewSubmission {
  const snapshot = {
    taskVersionId: "task-version-1",
    answerText: "A reproducible defect report",
    selectedAnswerIds: ["answer-1"],
    evidence: [],
    hintUsage: [],
    solvingDurationSeconds: 540,
  };
  return {
    id: "submission-1",
    organizationId: "org-1",
    taskId: "task-1",
    learnerId: "learner-1",
    groupId: "group-1",
    attemptNumber: 1,
    state: "submitted",
    version: 3,
    createdAt: "2026-07-17T08:00:00.000Z",
    updatedAt: "2026-07-17T09:00:00.000Z",
    submittedAt: "2026-07-17T09:00:00.000Z",
    learnerName: "Learner One",
    groupName: "QA Cohort",
    taskTitle: "Exploratory testing",
    assignedTrainerId: "trainer-1",
    answerText: snapshot.answerText,
    selectedAnswerIds: snapshot.selectedAnswerIds,
    evidence: snapshot.evidence,
    hintUsage: snapshot.hintUsage,
    solvingDurationSeconds: snapshot.solvingDurationSeconds,
    immutableSnapshot: snapshot,
    reviewHistory: [],
    rubric: {
      id: "rubric-1",
      version: 2,
      title: "Defect report",
      acceptanceThresholdPercent: 70,
      criteria: [{
        id: "criterion-1",
        title: "Reproduction",
        description: "Steps are reproducible",
        skillId: "skill-1",
        maxScore: 4,
        weight: 1,
        required: true,
      }],
    },
    ...overrides,
  };
}

const trainer: ReviewPrincipal = {
  userId: "trainer-1",
  organizationId: "org-1",
  role: "trainer",
  permissions: ["review:read", "review:decide", "review:transfer"],
  assignedGroupIds: ["group-1"],
};

class FakeReviewPort implements ReviewCommandPort {
  readonly decide = vi.fn(async (
    command: ReviewDecisionCommand,
    effects: ReviewEffects,
  ): Promise<ReviewSubmission> => {
    void effects;
    return {
      ...this.current,
      state: command.decision,
      version: command.expectedVersion + 1,
      latestReview: {
        id: "review-1",
        decision: command.decision,
        comment: command.comment,
        reviewerId: command.reviewerId,
        createdAt: "2026-07-17T10:00:00.000Z",
        version: 1,
      },
    };
  });

  readonly transfer = vi.fn(async (
    command: ReviewTransferCommand,
    _effects: Omit<ReviewEffects, "masteryEvidence">,
  ): Promise<ReviewSubmission> => {
    void _effects;
    return {
      ...this.current,
      version: command.expectedVersion + 1,
      transfer: {
        id: "transfer-1",
        fromTrainerId: command.fromTrainerId,
        toTrainerId: command.toTrainerId,
        reason: command.reason,
        createdAt: "2026-07-17T10:00:00.000Z",
        status: "accepted",
      },
    };
  });

  constructor(readonly current: ReviewSubmission) {}

  async getSubmission(submissionId: string): Promise<ReviewSubmission | null> {
    return submissionId === this.current.id ? this.current : null;
  }
}

describe("ReviewService", () => {
  it("accepts an in-scope submission and requests audit, notification and mastery evidence", async () => {
    const port = new FakeReviewPort(submission());
    const service = new ReviewService(port);

    await service.decide(trainer, {
      submissionId: "submission-1",
      expectedVersion: 3,
      decision: "accepted",
      comment: "The evidence is complete.",
      rubricScores: [{ criterionId: "criterion-1", score: 4 }],
      idempotencyKey: "review-key-1",
      correlationId: "correlation-1",
    });

    const [command, effects] = port.decide.mock.calls[0] ?? [];
    expect(command?.reviewerId).toBe("trainer-1");
    expect(effects?.audit.eventName).toBe("review.accepted");
    expect(effects?.notification.recipientId).toBe("learner-1");
    expect(effects?.masteryEvidence).toEqual([
      expect.objectContaining({ skillId: "skill-1", scorePercent: 100 }),
    ]);
  });

  it("rejects stale decisions before calling the mutation port", async () => {
    const port = new FakeReviewPort(submission());
    const service = new ReviewService(port);

    await expect(service.decide(trainer, {
      submissionId: "submission-1",
      expectedVersion: 2,
      decision: "accepted",
      comment: "Complete evidence.",
      rubricScores: [{ criterionId: "criterion-1", score: 4 }],
      idempotencyKey: "review-key-2",
      correlationId: "correlation-2",
    })).rejects.toMatchObject({ code: "REVIEW_VERSION_CONFLICT" });
    expect(port.decide).not.toHaveBeenCalled();
  });

  it("rejects cross-group access even when the role is trainer", async () => {
    const port = new FakeReviewPort(submission({ groupId: "group-2" }));
    const service = new ReviewService(port);
    await expect(service.decide(trainer, {
      submissionId: "submission-1",
      expectedVersion: 3,
      decision: "accepted",
      comment: "Complete evidence.",
      rubricScores: [{ criterionId: "criterion-1", score: 4 }],
      idempotencyKey: "review-key-3",
      correlationId: "correlation-3",
    })).rejects.toMatchObject({ code: "REVIEW_FORBIDDEN" });
  });

  it("requires a meaningful trainer comment", async () => {
    const service = new ReviewService(new FakeReviewPort(submission()));
    await expect(service.decide(trainer, {
      submissionId: "submission-1",
      expectedVersion: 3,
      decision: "accepted",
      comment: " ",
      rubricScores: [{ criterionId: "criterion-1", score: 4 }],
      idempotencyKey: "review-key-4",
      correlationId: "correlation-4",
    })).rejects.toBeInstanceOf(ReviewError);
  });

  it("does not allow a decision that contradicts the rubric threshold", async () => {
    const service = new ReviewService(new FakeReviewPort(submission()));
    await expect(service.decide(trainer, {
      submissionId: "submission-1",
      expectedVersion: 3,
      decision: "accepted",
      comment: "The report needs work.",
      rubricScores: [{ criterionId: "criterion-1", score: 1 }],
      idempotencyKey: "review-key-5",
      correlationId: "correlation-5",
    })).rejects.toMatchObject({ code: "REVIEW_RUBRIC_INVALID" });
  });

  it("transfers ownership without changing the submission state", async () => {
    const port = new FakeReviewPort(submission());
    const service = new ReviewService(port);
    const result = await service.transfer(trainer, {
      submissionId: "submission-1",
      expectedVersion: 3,
      toTrainerId: "trainer-2",
      reason: "Specialist review required.",
      idempotencyKey: "transfer-key-1",
      correlationId: "correlation-6",
    });

    expect(result.state).toBe("submitted");
    expect(result.transfer?.toTrainerId).toBe("trainer-2");
    const [command, effects] = port.transfer.mock.calls[0] ?? [];
    expect(command?.fromTrainerId).toBe("trainer-1");
    expect(effects?.audit.eventName).toBe("review.transferred");
  });
});
