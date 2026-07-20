import type { Principal } from "@/shared/auth/types";
import { privacyRequestTransitions } from "@/entities/privacy/state-machine";
import { canTransition } from "@/entities/common/state-machine";

import {
  CreatePrivacyRequestInputSchema,
  PrivacyRequestSchema,
  RetentionCandidateSchema,
  RetentionPolicySchema,
  type CreatePrivacyRequestInput,
  type PrivacyRequest,
  type RetentionCandidate,
  type RetentionPolicy,
} from "./model";

export class PrivacyError extends Error {
  constructor(readonly code: "privacy.forbidden" | "privacy.invalid_transition" | "privacy.stale_request" | "privacy.legal_hold") {
    super(code);
    this.name = "PrivacyError";
  }
}

export interface PrivacyRequestRepository {
  findByIdempotencyKey(key: string): Promise<unknown | null>;
  create(input: CreatePrivacyRequestInput): Promise<unknown>;
  save(request: PrivacyRequest): Promise<unknown>;
}

function canAccessRequest(principal: Principal, subjectId: string, organizationId: string | null): boolean {
  const owns = principal.userId === subjectId;
  const dpoScope = principal.permissions.includes("privacy.manage")
    && principal.organizationId === organizationId;
  return owns || dpoScope;
}

export async function createPrivacyRequest(repository: PrivacyRequestRepository, principal: Principal, input: unknown): Promise<PrivacyRequest> {
  const command = CreatePrivacyRequestInputSchema.parse(input);
  if (!canAccessRequest(principal, command.subjectId, command.organizationId)) throw new PrivacyError("privacy.forbidden");
  const existing = await repository.findByIdempotencyKey(command.idempotencyKey);
  if (existing) return PrivacyRequestSchema.parse(existing);
  return PrivacyRequestSchema.parse(await repository.create(command));
}

export async function transitionPrivacyRequest(
  repository: PrivacyRequestRepository,
  principal: Principal,
  requestInput: unknown,
  nextState: PrivacyRequest["state"],
  expectedVersion: number,
): Promise<PrivacyRequest> {
  const request = PrivacyRequestSchema.parse(requestInput);
  if (!canAccessRequest(principal, request.subjectId, request.organizationId)) throw new PrivacyError("privacy.forbidden");
  const administrativeState = nextState !== "cancelled";
  if (administrativeState && !principal.permissions.includes("privacy.manage")) throw new PrivacyError("privacy.forbidden");
  if (request.version !== expectedVersion) throw new PrivacyError("privacy.stale_request");
  if (!canTransition<PrivacyRequest["state"]>(privacyRequestTransitions, request.state, nextState)) throw new PrivacyError("privacy.invalid_transition");
  return PrivacyRequestSchema.parse(await repository.save({ ...request, state: nextState, version: request.version + 1 }));
}

export function retentionDisposition(candidateInput: unknown, policyInput: unknown, now: Date): "retain" | "legal_hold" | "delete" | "anonymize" {
  const candidate: RetentionCandidate = RetentionCandidateSchema.parse(candidateInput);
  const policy: RetentionPolicy = RetentionPolicySchema.parse(policyInput);
  if (candidate.entityType !== policy.entityType) return "retain";
  if (candidate.legalHold) return "legal_hold";
  const eligibleAt = Date.parse(candidate.referenceDate) + policy.retentionDays * 86_400_000;
  return eligibleAt <= now.getTime() ? policy.action : "retain";
}
