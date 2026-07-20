import { z } from "zod";

import { PRIVACY_REQUEST_STATES } from "@/entities/privacy/state-machine";

export const ConsentRecordSchema = z.object({
  id: z.string().min(1),
  subjectId: z.string().min(1),
  purpose: z.enum(["product_analytics", "learning_analytics", "ai_processing", "marketing"]),
  granted: z.boolean(),
  policyVersion: z.string().trim().min(1).max(40),
  recordedAt: z.string().datetime(),
  withdrawnAt: z.string().datetime().nullable(),
});
export type ConsentRecord = z.infer<typeof ConsentRecordSchema>;

export const PrivacyRequestStateSchema = z.enum(PRIVACY_REQUEST_STATES);

export const PrivacyRequestSchema = z.object({
  id: z.string().min(1),
  subjectId: z.string().min(1),
  organizationId: z.string().min(1).nullable(),
  type: z.enum(["export", "deletion"]),
  state: PrivacyRequestStateSchema,
  version: z.number().int().positive(),
  requestedAt: z.string().datetime(),
  completedAt: z.string().datetime().nullable(),
  failureCode: z.string().min(1).nullable(),
  idempotencyKey: z.string().trim().min(12).max(128),
}).strict();
export type PrivacyRequest = z.infer<typeof PrivacyRequestSchema>;

export const CreatePrivacyRequestInputSchema = z.object({
  subjectId: z.string().min(1),
  organizationId: z.string().min(1).nullable(),
  type: z.enum(["export", "deletion"]),
  requestedAt: z.string().datetime(),
  idempotencyKey: z.string().trim().min(12).max(128),
});
export type CreatePrivacyRequestInput = z.infer<typeof CreatePrivacyRequestInputSchema>;

export const RetentionPolicySchema = z.object({
  entityType: z.string().min(1),
  retentionDays: z.number().int().positive(),
  action: z.enum(["delete", "anonymize"]),
});
export type RetentionPolicy = z.infer<typeof RetentionPolicySchema>;

export const RetentionCandidateSchema = z.object({
  id: z.string().min(1),
  entityType: z.string().min(1),
  referenceDate: z.string().datetime(),
  legalHold: z.boolean(),
});
export type RetentionCandidate = z.infer<typeof RetentionCandidateSchema>;
