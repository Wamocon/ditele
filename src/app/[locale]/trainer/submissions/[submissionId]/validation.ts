import { z } from "zod";

const decimalScore = z
  .string()
  .trim()
  .regex(/^(?:0|[1-9]\d*)(?:\.\d{1,4})?$/)
  .transform(Number)
  .pipe(z.number().finite().nonnegative());

const decisionFieldsSchema = z.object({
  submissionId: z.string().uuid(),
  expectedVersion: z.coerce.number().int().positive(),
  decision: z.enum(["accepted", "revision_required"]),
  comment: z.string().trim().min(3).max(5_000),
});

const criterionScoreSchema = z.object({
  criterion_id: z.string().uuid(),
  points: decimalScore,
});

const criterionScoresSchema = z
  .array(criterionScoreSchema)
  .min(1)
  .refine(
    (scores) => new Set(scores.map((score) => score.criterion_id)).size === scores.length,
    "Criterion identifiers must be unique.",
  );

const transferFieldsSchema = z.object({
  submissionId: z.string().uuid(),
  expectedVersion: z.coerce.number().int().positive(),
  toTrainerId: z.string().uuid(),
  reason: z.string().trim().min(3).max(2_000),
  idempotencyKey: z.string().trim().min(16).max(200),
});

export type ReviewDecisionForm = z.output<typeof decisionFieldsSchema> & {
  readonly criterionScores: readonly z.output<typeof criterionScoreSchema>[];
};

export type SubmissionTransferForm = z.output<typeof transferFieldsSchema>;

export function parseReviewDecisionForm(formData: FormData): ReviewDecisionForm {
  const fields = decisionFieldsSchema.parse(Object.fromEntries(formData));
  const criterionScores = criterionScoresSchema.parse(
    [...formData.entries()].flatMap(([name, value]) => {
      if (!name.startsWith("score:")) return [];
      if (typeof value === "string" && value.trim().length === 0) return [];
      return [{
        criterion_id: name.slice("score:".length),
        points: value,
      }];
    }),
  );
  return { ...fields, criterionScores };
}

export function parseSubmissionTransferForm(
  formData: FormData,
): SubmissionTransferForm {
  return transferFieldsSchema.parse(Object.fromEntries(formData));
}
