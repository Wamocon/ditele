import { z } from "zod";

export const CertificateStateSchema = z.enum(["eligible", "issued", "available", "revoked", "expired"]);
export type CertificateState = z.infer<typeof CertificateStateSchema>;

export const CertificateSchema = z.object({
  id: z.string().min(1),
  learnerId: z.string().min(1),
  organizationId: z.string().min(1).nullable(),
  courseId: z.string().min(1),
  courseTitle: z.string().trim().min(1).max(200),
  state: CertificateStateSchema,
  publicToken: z.string().regex(/^[A-Za-z0-9_-]{43,128}$/),
  issuedAt: z.string().datetime(),
  expiresAt: z.string().datetime().nullable(),
  revokedAt: z.string().datetime().nullable(),
  revocationReason: z.string().max(1000).nullable(),
  version: z.number().int().positive(),
});
export type Certificate = z.infer<typeof CertificateSchema>;

export const IssueCertificateInputSchema = z.object({
  learnerId: z.string().min(1),
  courseId: z.string().min(1),
  organizationId: z.string().min(1).nullable(),
  idempotencyKey: z.string().trim().min(12).max(128),
});
export type IssueCertificateInput = z.infer<typeof IssueCertificateInputSchema>;

export const RevokeCertificateInputSchema = z.object({
  certificateId: z.string().min(1),
  reason: z.string().trim().min(10).max(1000),
  expectedVersion: z.number().int().positive(),
  idempotencyKey: z.string().trim().min(12).max(128),
});
export type RevokeCertificateInput = z.infer<typeof RevokeCertificateInputSchema>;

export const CertificateVerificationSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("valid"), certificateId: z.string().min(1), courseTitle: z.string().min(1), issuedAt: z.string().datetime(), expiresAt: z.string().datetime().nullable() }),
  z.object({ status: z.literal("revoked"), certificateId: z.string().min(1) }),
  z.object({ status: z.literal("expired"), certificateId: z.string().min(1) }),
  z.object({ status: z.literal("not_found") }),
]);
export type CertificateVerification = z.infer<typeof CertificateVerificationSchema>;
