import type { CertificateState } from "../certificate/state-machine";
import type { CohortState } from "../cohort/state-machine";
import type { QuestionState } from "../question/state-machine";
import type { SubmissionState } from "../submission/state-machine";

export class UnknownLegacyStateError extends Error {
  constructor(readonly field: string, readonly value: unknown) {
    super(`Unknown legacy state for ${field}: ${String(value)}`);
    this.name = "UnknownLegacyStateError";
  }
}

export function mapLegacyCohortState(value: unknown): CohortState {
  if (value === null) return "waiting";
  if (value === 1) return "active";
  if (value === 0) return "completed";
  throw new UnknownLegacyStateError("group.is_active", value);
}

export function mapLegacySubmissionState(value: unknown): SubmissionState | "draft" {
  if (value === null || value === undefined) return "draft";
  if (value === 0) return "submitted";
  if (value === 1) return "accepted";
  if (value === 2) return "revision_required";
  throw new UnknownLegacyStateError("solving.solving_status", value);
}

export function mapLegacyQuestionState(
  isAnswered: unknown,
  hasOwner: boolean,
): QuestionState {
  if (isAnswered === true) return "answered";
  if (isAnswered === false) return hasOwner ? "assigned" : "open";
  throw new UnknownLegacyStateError("question.is_answered", isAnswered);
}

export function mapLegacyCertificateType(
  value: unknown,
): "course_completion" | "exam" {
  if (value === 0) return "course_completion";
  if (value === 1) return "exam";
  throw new UnknownLegacyStateError("certificate.cert_type", value);
}

export function assertCanonicalCertificateState(value: string): CertificateState {
  if (["eligible", "issued", "available", "revoked", "expired"].includes(value)) {
    return value as CertificateState;
  }
  throw new UnknownLegacyStateError("certificate.state", value);
}

