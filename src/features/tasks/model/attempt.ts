import { z } from "zod";

export const AttemptStateSchema = z.enum([
  "draft",
  "submitted",
  "revision_required",
  "resubmitted",
  "accepted",
  "abandoned",
]);

export type AttemptState = z.infer<typeof AttemptStateSchema>;

const FileEvidenceSchema = z.object({
  id: z.string().min(1),
  kind: z.literal("file"),
  name: z.string().trim().min(1).max(255),
  uri: z.string().url(),
  mimeType: z.string().trim().min(1),
  sizeBytes: z.number().int().nonnegative(),
  createdAt: z.string().datetime(),
});

const LinkEvidenceSchema = z.object({
  id: z.string().min(1),
  kind: z.literal("link"),
  name: z.string().trim().min(1).max(255),
  uri: z.string().url(),
  createdAt: z.string().datetime(),
});

const TextEvidenceSchema = z.object({
  id: z.string().min(1),
  kind: z.literal("text"),
  name: z.string().trim().min(1).max(255),
  text: z.string().trim().min(1).max(10_000),
  createdAt: z.string().datetime(),
});

const LabEvidenceSchema = z.object({
  id: z.string().min(1),
  kind: z.literal("lab_result"),
  name: z.string().trim().min(1).max(255),
  validationResultId: z.string().min(1),
  createdAt: z.string().datetime(),
});

const RecordEvidenceSchema = z.object({
  id: z.string().min(1),
  kind: z.literal("record"),
  name: z.string().trim().min(1).max(255),
  createdAt: z.string().datetime(),
});

export const EvidenceRefSchema = z.discriminatedUnion("kind", [
  FileEvidenceSchema,
  LinkEvidenceSchema,
  TextEvidenceSchema,
  LabEvidenceSchema,
  RecordEvidenceSchema,
]);

export type EvidenceRef = z.infer<typeof EvidenceRefSchema>;

export const HintUsageSchema = z.object({
  hintId: z.string().min(1),
  usedAt: z.string().datetime(),
});

export const ReviewSummarySchema = z.object({
  id: z.string().min(1),
  decision: z.enum(["accepted", "revision_required"]),
  comment: z.string().max(10_000),
  reviewerId: z.string().min(1),
  createdAt: z.string().datetime(),
  version: z.number().int().positive(),
});

export const ReviewTransferSchema = z.object({
  id: z.string().min(1),
  fromTrainerId: z.string().min(1),
  toTrainerId: z.string().min(1),
  reason: z.string().trim().min(1).max(1000).optional(),
  createdAt: z.string().datetime(),
  status: z.enum(["pending", "accepted", "failed"]),
});

export const SubmissionSnapshotSchema = z.object({
  taskVersionId: z.string().min(1),
  answerText: z.string().max(50_000),
  selectedAnswerIds: z.array(z.string().min(1)),
  evidence: z.array(EvidenceRefSchema),
  hintUsage: z.array(HintUsageSchema),
  solvingDurationSeconds: z.number().int().nonnegative(),
});

export type SubmissionSnapshot = z.infer<typeof SubmissionSnapshotSchema>;

export const AttemptSummarySchema = z.object({
  id: z.string().min(1),
  taskId: z.string().min(1),
  learnerId: z.string().min(1),
  groupId: z.string().min(1),
  attemptNumber: z.number().int().positive(),
  state: AttemptStateSchema,
  version: z.number().int().positive(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  submittedAt: z.string().datetime().optional(),
  reviewedAt: z.string().datetime().optional(),
});

export type AttemptSummary = z.infer<typeof AttemptSummarySchema>;

export const AttemptDetailSchema = AttemptSummarySchema.extend({
  draftVersion: z.number().int().nonnegative().optional(),
  answerText: z.string().max(50_000),
  selectedAnswerIds: z.array(z.string().min(1)),
  evidence: z.array(EvidenceRefSchema),
  hintUsage: z.array(HintUsageSchema),
  solvingDurationSeconds: z.number().int().nonnegative(),
  startedAt: z.string().datetime().optional(),
  revisionOfAttemptId: z.string().min(1).optional(),
  immutableSnapshot: SubmissionSnapshotSchema.optional(),
  latestReview: ReviewSummarySchema.optional(),
  reviewHistory: z.array(ReviewSummarySchema),
  transfer: ReviewTransferSchema.optional(),
});

export type AttemptDetail = z.infer<typeof AttemptDetailSchema>;

const DraftFieldsSchema = z.object({
  taskId: z.string().min(1),
  groupId: z.string().min(1),
  taskVersionId: z.string().min(1),
  attemptId: z.string().min(1).optional(),
  expectedVersion: z.number().int().nonnegative(),
  answerText: z.string().max(50_000),
  selectedAnswerIds: z.array(z.string().min(1)),
  evidence: z.array(EvidenceRefSchema).max(50),
  usedHintIds: z.array(z.string().min(1)).max(100),
  solvingDurationSeconds: z.number().int().nonnegative(),
  idempotencyKey: z.string().trim().min(16).max(128),
});

export const SaveAttemptDraftInputSchema = DraftFieldsSchema;
export type SaveAttemptDraftInput = z.infer<typeof SaveAttemptDraftInputSchema>;

export const SubmitAttemptInputSchema = DraftFieldsSchema.extend({
  attemptId: z.string().min(1),
}).superRefine((value, context) => {
  if (value.answerText.trim().length === 0 && value.selectedAnswerIds.length === 0) {
    context.addIssue({
      code: "custom",
      message: "tasks.answer_required",
      path: ["answerText"],
    });
  }
});

export type SubmitAttemptInput = z.infer<typeof SubmitAttemptInputSchema>;

const ATTEMPT_TRANSITIONS: Readonly<Record<AttemptState, readonly AttemptState[]>> = {
  draft: ["submitted"],
  submitted: ["accepted", "revision_required"],
  revision_required: ["resubmitted"],
  resubmitted: ["accepted", "revision_required"],
  accepted: [],
  abandoned: [],
};

export function canTransitionAttempt(from: AttemptState, to: AttemptState): boolean {
  return ATTEMPT_TRANSITIONS[from].includes(to);
}

export function isAttemptEditable(state: AttemptState): boolean {
  return state === "draft" || state === "revision_required";
}

export function createSubmissionSnapshot(input: {
  taskVersionId: string;
  answerText: string;
  selectedAnswerIds: string[];
  evidence: EvidenceRef[];
  hintUsage: z.infer<typeof HintUsageSchema>[];
  solvingDurationSeconds: number;
}): Readonly<SubmissionSnapshot> {
  return Object.freeze(
    SubmissionSnapshotSchema.parse({
      ...input,
      selectedAnswerIds: [...input.selectedAnswerIds],
      evidence: input.evidence.map((item) => ({ ...item })),
      hintUsage: input.hintUsage.map((item) => ({ ...item })),
    }),
  );
}
