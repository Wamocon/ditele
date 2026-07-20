import { z } from "zod";

export const LearnerPortfolioVisibilitySchema = z.enum([
  "private",
  "organization",
  "public",
]);

export type LearnerPortfolioVisibility = z.infer<
  typeof LearnerPortfolioVisibilitySchema
>;

const PortfolioDatabaseRowSchema = z.object({
  id: z.string().uuid(),
  learner_id: z.string().uuid(),
  title: z.string().trim().min(1),
  summary: z.string(),
  visibility: LearnerPortfolioVisibilitySchema,
  row_version: z.number().int().positive(),
  updated_at: z.string().datetime({ offset: true }),
});

const ValidationResultDatabaseRowSchema = z.object({
  outcome: z.enum(["passed", "failed", "inconclusive", "error"]),
  validated_at: z.string().datetime({ offset: true }),
});

const EvidenceDatabaseRowSchema = z.object({
  id: z.string().uuid(),
  evidence_kind: z.enum([
    "submission",
    "lab",
    "upload",
    "review",
    "placement",
    "external",
  ]),
  title: z.string().trim().min(1),
  captured_at: z.string().datetime({ offset: true }),
  validation_results: z.array(ValidationResultDatabaseRowSchema),
});

const PortfolioItemDatabaseRowSchema = z.object({
  id: z.string().uuid(),
  evidence_id: z.string().uuid(),
  position: z.number().int().nonnegative(),
  reflection: z.string(),
  created_at: z.string().datetime({ offset: true }),
  evidence: EvidenceDatabaseRowSchema.nullable(),
});

export const LearnerPortfolioEvidenceRecordSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1).nullable(),
  kind: EvidenceDatabaseRowSchema.shape.evidence_kind.nullable(),
  capturedAt: z.string().datetime({ offset: true }),
  reflection: z.string(),
  position: z.number().int().nonnegative(),
  verification: z.enum(["verified", "recorded", "unavailable"]),
});

export type LearnerPortfolioEvidenceRecord = z.infer<
  typeof LearnerPortfolioEvidenceRecordSchema
>;

export const LearnerPortfolioRecordSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1),
  summary: z.string(),
  visibility: LearnerPortfolioVisibilitySchema,
  version: z.number().int().positive(),
  updatedAt: z.string().datetime({ offset: true }),
  items: z.array(LearnerPortfolioEvidenceRecordSchema),
});

export type LearnerPortfolioRecord = z.infer<typeof LearnerPortfolioRecordSchema>;

function evidenceVerification(
  evidence: z.infer<typeof EvidenceDatabaseRowSchema>,
): LearnerPortfolioEvidenceRecord["verification"] {
  // Evidence metadata is learner-writable and therefore cannot confer verified
  // status. Only a protected deterministic validation result does so here.
  if (evidence.validation_results.some((result) => result.outcome === "passed")) {
    return "verified";
  }
  return "recorded";
}

export function buildLearnerPortfolioRecord(
  rawPortfolio: unknown,
  rawItems: unknown,
): LearnerPortfolioRecord {
  const portfolio = PortfolioDatabaseRowSchema.parse(rawPortfolio);
  const items = z.array(PortfolioItemDatabaseRowSchema).parse(rawItems);

  return LearnerPortfolioRecordSchema.parse({
    id: portfolio.id,
    title: portfolio.title,
    summary: portfolio.summary,
    visibility: portfolio.visibility,
    version: portfolio.row_version,
    updatedAt: portfolio.updated_at,
    items: items
      .map((item) => {
        if (!item.evidence) {
          return {
            id: item.id,
            title: null,
            kind: null,
            capturedAt: item.created_at,
            reflection: item.reflection,
            position: item.position,
            verification: "unavailable" as const,
          };
        }
        return {
          id: item.id,
          title: item.evidence.title,
          kind: item.evidence.evidence_kind,
          capturedAt: item.evidence.captured_at,
          reflection: item.reflection,
          position: item.position,
          verification: evidenceVerification(item.evidence),
        };
      })
      .toSorted((left, right) => left.position - right.position),
  });
}
