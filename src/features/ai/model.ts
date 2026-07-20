import { z } from "zod";

import { AI_MODES } from "@/entities/common/persistence-states";

export const AiInteractionModeSchema = z.enum(AI_MODES);
export type AiInteractionMode = z.infer<typeof AiInteractionModeSchema>;

export const AiCoachRequestSchema = z.object({
  id: z.string().min(1),
  learnerId: z.string().min(1),
  organizationId: z.string().min(1).nullable(),
  mode: AiInteractionModeSchema,
  prompt: z.string().trim().min(1).max(2000),
  taskId: z.string().min(1).nullable(),
  hintLevel: z.number().int().min(0).max(3),
  requestedAt: z.string().datetime(),
});
export type AiCoachRequest = z.infer<typeof AiCoachRequestSchema>;

export const ApprovedAiContextSchema = z.object({
  id: z.string().min(1),
  title: z.string().trim().min(1).max(200),
  excerpt: z.string().trim().min(1).max(2000),
  sourceUrl: z.string().url().nullable(),
  approvedForAssessment: z.boolean(),
});
export type ApprovedAiContext = z.infer<typeof ApprovedAiContextSchema>;

export const AiProviderAvailabilitySchema = z.discriminatedUnion("available", [
  z.object({ available: z.literal(true) }),
  z.object({ available: z.literal(false), reason: z.enum(["not_configured", "provider_timeout", "circuit_open"]) }),
]);
export type AiProviderAvailability = z.infer<typeof AiProviderAvailabilitySchema>;

export const AiProviderResponseSchema = z.object({
  message: z.string().trim().min(1).max(4000),
}).strict();

export const AiCoachOutcomeSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("answered"), message: z.string().trim().min(1).max(4000), hintLevel: z.number().int().min(0).max(3), citations: z.array(z.object({ id: z.string().min(1), title: z.string().min(1), sourceUrl: z.string().url().nullable() })).max(5) }),
  z.object({ status: z.literal("refused"), reason: z.enum(["answer_leakage", "hidden_defect_request", "sensitive_data"]), escalationRecommended: z.boolean() }),
  z.object({
    status: z.literal("unavailable"),
    reason: z.enum([
      "not_configured",
      "provider_timeout",
      "provider_error",
      "provider_invalid_response",
      "context_limit_exceeded",
      "circuit_open",
      "quota_exceeded",
    ]),
  }),
]);
export type AiCoachOutcome = z.infer<typeof AiCoachOutcomeSchema>;

export const TrainerFeedbackDraftSchema = z.object({
  id: z.string().min(1),
  reviewId: z.string().min(1),
  authorType: z.literal("ai"),
  content: z.string().trim().min(1).max(4000),
  status: z.enum(["requires_trainer_approval", "approved", "discarded"]),
  approvedBy: z.string().min(1).nullable(),
  createdAt: z.string().datetime(),
});
export type TrainerFeedbackDraft = z.infer<typeof TrainerFeedbackDraftSchema>;
