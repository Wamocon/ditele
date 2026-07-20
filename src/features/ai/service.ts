import type { Principal } from "@/shared/auth/types";

import {
  AiCoachOutcomeSchema,
  AiCoachRequestSchema,
  AiProviderAvailabilitySchema,
  AiProviderResponseSchema,
  ApprovedAiContextSchema,
  TrainerFeedbackDraftSchema,
  type AiCoachOutcome,
  type AiCoachRequest,
  type ApprovedAiContext,
  type TrainerFeedbackDraft,
} from "./model";

export class AiSafetyError extends Error {
  constructor(
    readonly code:
      | "ai.forbidden"
      | "ai.trainer_approval_required"
      | "ai.unsafe_provider_output",
  ) {
    super(code);
    this.name = "AiSafetyError";
  }
}

export interface AiProviderPort {
  availability(): Promise<unknown>;
  generate(input: { mode: AiCoachRequest["mode"]; prompt: string; hintLevel: number; context: readonly ApprovedAiContext[]; instruction: string }): Promise<{ message: string }>;
}

export interface AiContextPort {
  retrieveAuthorized(input: {
    actorId: string;
    learnerId: string;
    organizationId: string | null;
    taskId: string | null;
    mode: AiCoachRequest["mode"];
  }): Promise<unknown[]>;
}

export interface AiResourceAccessPort {
  canAccess(input: {
    actorId: string;
    learnerId: string;
    organizationId: string | null;
    taskId: string | null;
    mode: AiCoachRequest["mode"];
  }): Promise<boolean>;
}

export interface AiQuotaPort {
  consume(input: { userId: string; organizationId: string | null; requestId: string }): Promise<boolean>;
}

export interface AiSafetyAuditPort {
  record(input: { requestId: string; decision: "allowed" | "refused" | "unavailable"; reason: string }): Promise<void>;
}

export interface TrainerDraftRepository {
  canAccessReview(input: {
    reviewId: string;
    trainerId: string;
    action: "assist" | "approve";
  }): Promise<boolean>;
  saveDraft(input: Omit<TrainerFeedbackDraft, "id">): Promise<unknown>;
  approve(input: { draftId: string; trainerId: string }): Promise<unknown>;
}

const sensitivePattern = /(bearer\s+[a-z0-9._-]+|api[_-]?key\s*[:=]|password\s*[:=]|[\w.+-]+@[\w.-]+\.[a-z]{2,})/i;
const finalAnswerPattern = /(give|tell|show|reveal|write).{0,30}(final|correct|exact).{0,20}(answer|solution)/i;
const hiddenDefectPattern = /(hidden|seeded|secret).{0,20}(defect|bug|fault)/i;
const promptInjectionPattern = /(?:ignore|disregard|override).{0,30}(?:previous|system|developer).{0,20}(?:instruction|prompt)|(?:reveal|repeat|print).{0,25}(?:system|developer)\s+(?:instruction|prompt)/i;
const leakedFinalAnswerPattern = /(?:the\s+)?(?:final|correct|exact)\s+(?:answer|solution)\s*(?:is|:|=)|(?:choose|select|submit)\s+(?:answer\s+|option\s+)?[a-z0-9][a-z0-9._-]*/i;
const leakedHiddenDefectPattern = /(?:the\s+)?(?:hidden|seeded|secret)\s+(?:defect|bug|fault)\s*(?:is|:|=)|(?:defect|bug|fault)\s+(?:is\s+)?(?:located|found)\s+(?:at|in|on)/i;

const MAX_RETRIEVED_CONTEXTS = 20;
const MAX_RETURNED_CITATIONS = 5;

export function classifyAiSafety(prompt: string): "allowed" | "answer_leakage" | "hidden_defect_request" | "sensitive_data" {
  if (sensitivePattern.test(prompt)) return "sensitive_data";
  if (promptInjectionPattern.test(prompt)) return "answer_leakage";
  if (hiddenDefectPattern.test(prompt)) return "hidden_defect_request";
  if (finalAnswerPattern.test(prompt)) return "answer_leakage";
  return "allowed";
}

export function redactAiPrompt(prompt: string): string {
  return prompt
    .replace(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi, "[REDACTED_EMAIL]")
    .replace(/bearer\s+[a-z0-9._-]+/gi, "[REDACTED_TOKEN]")
    .replace(/(api[_-]?key|password)\s*[:=]\s*\S+/gi, "$1=[REDACTED]");
}

export function classifyAiOutputSafety(
  output: string,
): "allowed" | "answer_leakage" | "hidden_defect_request" | "sensitive_data" {
  if (sensitivePattern.test(output)) return "sensitive_data";
  if (leakedHiddenDefectPattern.test(output)) return "hidden_defect_request";
  if (leakedFinalAnswerPattern.test(output)) return "answer_leakage";
  return "allowed";
}

function assertCoachAccess(principal: Principal, request: AiCoachRequest) {
  const tenantMatches = request.organizationId === null || request.organizationId === principal.organizationId;
  const ownsRequest = request.learnerId === principal.userId;
  const canDraft = request.mode === "trainer_draft" && principal.permissions.includes("review.assist");
  if (!tenantMatches || (!ownsRequest && !canDraft)) throw new AiSafetyError("ai.forbidden");
}

export async function runGuardedAiCoach(
  dependencies: {
    provider: AiProviderPort;
    context: AiContextPort;
    access: AiResourceAccessPort;
    quota: AiQuotaPort;
    audit: AiSafetyAuditPort;
  },
  principal: Principal,
  input: unknown,
): Promise<AiCoachOutcome> {
  const request = AiCoachRequestSchema.parse(input);
  assertCoachAccess(principal, request);
  const resourceScope = {
    actorId: principal.userId,
    learnerId: request.learnerId,
    organizationId: request.organizationId,
    taskId: request.taskId,
    mode: request.mode,
  };
  if (!(await dependencies.access.canAccess(resourceScope))) {
    throw new AiSafetyError("ai.forbidden");
  }
  const decision = classifyAiSafety(request.prompt);
  if (decision !== "allowed") {
    await dependencies.audit.record({ requestId: request.id, decision: "refused", reason: decision });
    return AiCoachOutcomeSchema.parse({ status: "refused", reason: decision, escalationRecommended: true });
  }
  if (!(await dependencies.quota.consume({ userId: principal.userId, organizationId: principal.organizationId, requestId: request.id }))) {
    await dependencies.audit.record({ requestId: request.id, decision: "unavailable", reason: "quota_exceeded" });
    return { status: "unavailable", reason: "quota_exceeded" };
  }
  const availability = AiProviderAvailabilitySchema.parse(await dependencies.provider.availability());
  if (!availability.available) {
    await dependencies.audit.record({ requestId: request.id, decision: "unavailable", reason: availability.reason });
    return { status: "unavailable", reason: availability.reason };
  }
  const rawContext = await dependencies.context.retrieveAuthorized(resourceScope);
  if (rawContext.length > MAX_RETRIEVED_CONTEXTS) {
    await dependencies.audit.record({
      requestId: request.id,
      decision: "unavailable",
      reason: "context_limit_exceeded",
    });
    return { status: "unavailable", reason: "context_limit_exceeded" };
  }
  const context = rawContext
    .map((item) => ApprovedAiContextSchema.parse(item))
    .filter((item) => request.mode !== "assessment" || item.approvedForAssessment)
    .slice(0, MAX_RETURNED_CITATIONS);
  const instruction = request.mode === "assessment"
    ? "Use only a concept reminder or guiding question. Never provide the final answer or identify hidden defects."
    : "Teach with a concept reminder, then a guiding question, then at most the requested partial hint.";
  let providerOutput: unknown;
  try {
    providerOutput = await dependencies.provider.generate({
      mode: request.mode,
      prompt: redactAiPrompt(request.prompt),
      hintLevel: request.hintLevel,
      context,
      instruction,
    });
  } catch {
    await dependencies.audit.record({
      requestId: request.id,
      decision: "unavailable",
      reason: "provider_error",
    });
    return { status: "unavailable", reason: "provider_error" };
  }
  const parsedProviderOutput = AiProviderResponseSchema.safeParse(providerOutput);
  if (!parsedProviderOutput.success) {
    await dependencies.audit.record({
      requestId: request.id,
      decision: "unavailable",
      reason: "provider_invalid_response",
    });
    return { status: "unavailable", reason: "provider_invalid_response" };
  }
  const generated = parsedProviderOutput.data;
  const outputDecision = classifyAiOutputSafety(generated.message);
  if (outputDecision !== "allowed") {
    await dependencies.audit.record({
      requestId: request.id,
      decision: "refused",
      reason: `provider_output_${outputDecision}`,
    });
    return AiCoachOutcomeSchema.parse({
      status: "refused",
      reason: outputDecision,
      escalationRecommended: true,
    });
  }
  await dependencies.audit.record({ requestId: request.id, decision: "allowed", reason: "policy_passed" });
  return AiCoachOutcomeSchema.parse({
    status: "answered",
    message: generated.message,
    hintLevel: request.hintLevel,
    citations: context.map(({ id, title, sourceUrl }) => ({ id, title, sourceUrl })),
  });
}

export async function createTrainerFeedbackDraft(
  repository: TrainerDraftRepository,
  principal: Principal,
  input: { reviewId: string; content: string; createdAt: string },
): Promise<TrainerFeedbackDraft> {
  if (!principal.permissions.includes("review.assist")) throw new AiSafetyError("ai.forbidden");
  if (!(await repository.canAccessReview({
    reviewId: input.reviewId,
    trainerId: principal.userId,
    action: "assist",
  }))) {
    throw new AiSafetyError("ai.forbidden");
  }
  if (classifyAiOutputSafety(input.content) !== "allowed") {
    throw new AiSafetyError("ai.unsafe_provider_output");
  }
  return TrainerFeedbackDraftSchema.parse(await repository.saveDraft({
    reviewId: input.reviewId,
    authorType: "ai",
    content: input.content,
    status: "requires_trainer_approval",
    approvedBy: null,
    createdAt: input.createdAt,
  }));
}

export async function approveTrainerFeedbackDraft(
  repository: TrainerDraftRepository,
  principal: Principal,
  draftInput: unknown,
): Promise<TrainerFeedbackDraft> {
  const draft = TrainerFeedbackDraftSchema.parse(draftInput);
  if (!principal.permissions.includes("review.decide")) throw new AiSafetyError("ai.forbidden");
  if (draft.status !== "requires_trainer_approval") throw new AiSafetyError("ai.trainer_approval_required");
  if (!(await repository.canAccessReview({
    reviewId: draft.reviewId,
    trainerId: principal.userId,
    action: "approve",
  }))) {
    throw new AiSafetyError("ai.forbidden");
  }
  return TrainerFeedbackDraftSchema.parse(await repository.approve({ draftId: draft.id, trainerId: principal.userId }));
}
