export const REVIEW_SUBMISSION_STATES = [
  "submitted",
  "revision_required",
  "resubmitted",
  "accepted",
  "withdrawn",
] as const;

export type ReviewSubmissionState = (typeof REVIEW_SUBMISSION_STATES)[number];
export type ReviewDecision = "accepted" | "revision_required";
export type EvidenceKind = "file" | "link" | "text" | "lab_result";
export type TransferState = "pending" | "accepted" | "failed";

export type ReviewPermission =
  | "review:read"
  | "review:decide"
  | "review:transfer"
  | "review:read_all";

export interface ReviewPrincipal {
  readonly userId: string;
  readonly organizationId: string;
  readonly role: "trainer" | "admin";
  readonly permissions: readonly ReviewPermission[];
  readonly assignedGroupIds: readonly string[];
}

export interface ReviewEvidence {
  readonly id: string;
  readonly kind: EvidenceKind;
  readonly name: string;
  readonly uri?: string;
  readonly mimeType?: string;
  readonly sizeBytes?: number;
  readonly createdAt: string;
}

export interface ReviewSelectedAnswer {
  readonly id: string;
  readonly label: string;
}

export interface HintUsage {
  readonly hintId: string;
  readonly usedAt: string;
}

export interface ReviewSnapshot {
  readonly taskVersionId: string;
  readonly answerText: string;
  readonly selectedAnswerIds: readonly string[];
  readonly selectedAnswers?: readonly ReviewSelectedAnswer[];
  readonly evidence: readonly ReviewEvidence[];
  readonly hintUsage: readonly HintUsage[];
  readonly solvingDurationSeconds: number;
}

export interface ReviewCriterion {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly skillId?: string;
  readonly maxScore: number;
  readonly weight: number;
  readonly required: boolean;
}

export interface ReviewRubric {
  readonly id: string;
  readonly version: number;
  readonly title: string;
  readonly criteria: readonly ReviewCriterion[];
  readonly acceptanceThresholdPercent: number;
}

export interface CriterionScore {
  readonly criterionId: string;
  readonly score: number;
  readonly comment?: string;
}

export interface RubricResult {
  readonly rubricId: string;
  readonly rubricVersion: number;
  readonly scores: readonly CriterionScore[];
  readonly earnedPoints: number;
  readonly possiblePoints: number;
  readonly percent: number;
  readonly passesThreshold: boolean;
}

export interface ReviewRecord {
  readonly id: string;
  readonly decision: ReviewDecision;
  readonly comment: string;
  readonly reviewerId: string;
  readonly createdAt: string;
  readonly version: number;
  readonly rubricResult?: RubricResult;
}

export interface ReviewTransfer {
  readonly id: string;
  readonly fromTrainerId: string;
  readonly toTrainerId: string;
  readonly reason?: string;
  readonly createdAt: string;
  readonly status: TransferState;
}

/**
 * Canonical trainer-facing projection of the learner-owned attempt DTO.
 * It intentionally keeps learner payload field names stable at the boundary.
 */
export interface ReviewSubmission {
  readonly id: string;
  readonly organizationId: string;
  readonly taskId: string;
  readonly learnerId: string;
  readonly groupId: string;
  readonly attemptNumber: number;
  readonly state: ReviewSubmissionState;
  readonly version: number;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly submittedAt?: string;
  readonly reviewedAt?: string;
  readonly learnerName: string;
  readonly groupName: string;
  readonly taskTitle: string;
  readonly assignedTrainerId?: string;
  readonly answerText: string;
  readonly selectedAnswerIds: readonly string[];
  readonly selectedAnswers?: readonly ReviewSelectedAnswer[];
  readonly evidence: readonly ReviewEvidence[];
  readonly hintUsage: readonly HintUsage[];
  readonly solvingDurationSeconds: number;
  readonly startedAt?: string;
  readonly revisionOfAttemptId?: string;
  readonly immutableSnapshot: ReviewSnapshot;
  readonly latestReview?: ReviewRecord;
  readonly reviewHistory: readonly ReviewRecord[];
  readonly transfer?: ReviewTransfer;
  readonly rubric?: ReviewRubric;
  readonly dueAt?: string;
}

export interface ReviewQueueFilters {
  readonly groupId?: string;
  readonly state?: "submitted" | "resubmitted";
  readonly ownership?: "assigned" | "transferred" | "all";
  readonly olderThanHours?: number;
  readonly search?: string;
}

export interface ReviewQueueItem {
  readonly id: string;
  readonly groupId: string;
  readonly groupName: string;
  readonly learnerName: string;
  readonly taskTitle: string;
  readonly state: "submitted" | "resubmitted";
  readonly version: number;
  readonly submittedAt: string;
  readonly assignedTrainerId?: string;
  readonly transfer?: ReviewTransfer;
  readonly dueAt?: string;
}

export interface AuditEventRequest {
  readonly eventName: string;
  readonly actorId: string;
  readonly organizationId: string;
  readonly resourceType: "submission";
  readonly resourceId: string;
  readonly correlationId: string;
  readonly metadata: Readonly<Record<string, string | number | boolean>>;
}

export interface NotificationRequest {
  readonly recipientId: string;
  readonly template:
    | "submission_accepted"
    | "submission_revision_required"
    | "submission_transferred";
  readonly idempotencyKey: string;
  readonly variables: Readonly<Record<string, string>>;
}

export interface MasteryEvidenceRequest {
  readonly learnerId: string;
  readonly skillId: string;
  readonly sourceType: "trainer_review";
  readonly sourceId: string;
  readonly rubricId: string;
  readonly rubricVersion: number;
  readonly scorePercent: number;
  readonly recordedBy: string;
  readonly idempotencyKey: string;
}

export interface ReviewEffects {
  readonly audit: AuditEventRequest;
  readonly notification: NotificationRequest;
  readonly masteryEvidence: readonly MasteryEvidenceRequest[];
}

export interface ReviewDecisionCommand {
  readonly submissionId: string;
  readonly expectedVersion: number;
  readonly decision: ReviewDecision;
  readonly comment: string;
  readonly rubricScores: readonly CriterionScore[];
  readonly reviewerId: string;
  readonly idempotencyKey: string;
}

export interface ReviewTransferCommand {
  readonly submissionId: string;
  readonly expectedVersion: number;
  readonly fromTrainerId: string;
  readonly toTrainerId: string;
  readonly reason: string;
  readonly idempotencyKey: string;
}

export interface ReviewCommandPort {
  getSubmission(submissionId: string): Promise<ReviewSubmission | null>;

  /** Must compare-and-set expectedVersion and persist effects in one transaction. */
  decide(command: ReviewDecisionCommand, effects: ReviewEffects): Promise<ReviewSubmission>;

  /** Transfer changes ownership, not the submission lifecycle state. */
  transfer(
    command: ReviewTransferCommand,
    effects: Omit<ReviewEffects, "masteryEvidence">,
  ): Promise<ReviewSubmission>;
}
