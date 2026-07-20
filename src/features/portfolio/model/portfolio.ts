import { z } from "zod";

export const PortfolioVisibilitySchema = z.enum(["private", "unlisted", "public"]);
export type PortfolioVisibility = z.infer<typeof PortfolioVisibilitySchema>;

export const PortfolioEvidenceSchema = z.object({
  id: z.string().min(1),
  title: z.string().trim().min(1).max(255),
  kind: z.enum(["submission", "lab_result", "certificate", "reviewed_artifact"]),
  skillIds: z.array(z.string().min(1)),
  verifiedAt: z.string().datetime(),
  reviewId: z.string().min(1).optional(),
});

export const PortfolioItemSchema = z.object({
  id: z.string().min(1),
  evidence: PortfolioEvidenceSchema,
  caption: z.string().trim().max(2000),
  position: z.number().int().nonnegative(),
});

export type PortfolioItem = z.infer<typeof PortfolioItemSchema>;

export const PortfolioSchema = z.object({
  id: z.string().min(1),
  learnerId: z.string().min(1),
  title: z.string().trim().min(1).max(160),
  summary: z.string().trim().max(4000),
  version: z.number().int().positive(),
  visibility: PortfolioVisibilitySchema,
  items: z.array(PortfolioItemSchema).max(100),
  updatedAt: z.string().datetime(),
});

export type Portfolio = z.infer<typeof PortfolioSchema>;

export const UpdatePortfolioInputSchema = z.object({
  portfolioId: z.string().min(1),
  title: z.string().trim().min(1).max(160),
  summary: z.string().trim().max(4000),
  items: z.array(
    z.object({
      evidenceId: z.string().min(1),
      caption: z.string().trim().max(2000),
      position: z.number().int().nonnegative(),
    }),
  ).max(100),
  expectedVersion: z.number().int().positive(),
  idempotencyKey: z.string().trim().min(12).max(128),
});

export type UpdatePortfolioInput = z.infer<typeof UpdatePortfolioInputSchema>;

export const PublishPortfolioInputSchema = z.object({
  portfolioId: z.string().min(1),
  visibility: z.enum(["unlisted", "public"]),
  expectedVersion: z.number().int().positive(),
  idempotencyKey: z.string().trim().min(12).max(128),
});

export type PublishPortfolioInput = z.infer<typeof PublishPortfolioInputSchema>;

export const PortfolioPublicationSchema = z.object({
  id: z.string().min(1),
  portfolioId: z.string().min(1),
  publicToken: z.string().regex(/^[A-Za-z0-9_-]{43,128}$/),
  status: z.enum(["published", "revoked"]),
  visibility: z.enum(["unlisted", "public"]),
  version: z.number().int().positive(),
  publishedAt: z.string().datetime(),
  revokedAt: z.string().datetime().optional(),
  contentHash: z.string().regex(/^[a-f0-9]{64}$/),
  snapshot: z.object({
    title: z.string().trim().min(1).max(160),
    summary: z.string().trim().max(4000),
    items: z.array(PortfolioItemSchema),
  }),
});

export type PortfolioPublication = z.infer<typeof PortfolioPublicationSchema>;

export const RevokePortfolioInputSchema = z.object({
  publicationId: z.string().min(1),
  expectedVersion: z.number().int().positive(),
  idempotencyKey: z.string().trim().min(12).max(128),
});

export type RevokePortfolioInput = z.infer<typeof RevokePortfolioInputSchema>;

export const PortfolioViewModelSchema = z.object({
  source: z.enum(["live", "preview"]),
  portfolio: PortfolioSchema,
  publication: PortfolioPublicationSchema.optional(),
});

export type PortfolioViewModel = z.infer<typeof PortfolioViewModelSchema>;
