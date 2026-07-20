import type { Principal } from "@/shared/auth/types";

import {
  CertificateSchema,
  CertificateVerificationSchema,
  IssueCertificateInputSchema,
  RevokeCertificateInputSchema,
  type Certificate,
  type CertificateVerification,
  type IssueCertificateInput,
  type RevokeCertificateInput,
} from "./model";

export class CertificationError extends Error {
  constructor(readonly code: "certification.forbidden" | "certification.not_eligible" | "certification.stale_version") {
    super(code);
    this.name = "CertificationError";
  }
}

export interface CertificateRepository {
  findByIdempotencyKey(key: string): Promise<unknown | null>;
  issue(input: IssueCertificateInput & { issuedBy: string }): Promise<unknown>;
  revoke(input: RevokeCertificateInput & { revokedBy: string }): Promise<unknown>;
  findByPublicToken(token: string): Promise<unknown | null>;
}

export interface CertificateEligibilityPolicy {
  isEligible(input: { learnerId: string; courseId: string; organizationId: string | null }): Promise<boolean>;
}

function canManage(principal: Principal, organizationId: string | null): boolean {
  const tenantMatches = organizationId === null || principal.organizationId === organizationId;
  return tenantMatches && principal.permissions.includes("certificate.issue");
}

export async function issueCertificate(
  dependencies: { repository: CertificateRepository; eligibility: CertificateEligibilityPolicy },
  principal: Principal,
  input: unknown,
): Promise<Certificate> {
  const command = IssueCertificateInputSchema.parse(input);
  if (!canManage(principal, command.organizationId)) throw new CertificationError("certification.forbidden");
  const existing = await dependencies.repository.findByIdempotencyKey(command.idempotencyKey);
  if (existing) return CertificateSchema.parse(existing);
  if (!(await dependencies.eligibility.isEligible(command))) throw new CertificationError("certification.not_eligible");
  return CertificateSchema.parse(await dependencies.repository.issue({ ...command, issuedBy: principal.userId }));
}

export async function revokeCertificate(
  repository: CertificateRepository,
  principal: Principal,
  certificate: Certificate,
  input: unknown,
): Promise<Certificate> {
  const command = RevokeCertificateInputSchema.parse(input);
  if (!canManage(principal, certificate.organizationId)) throw new CertificationError("certification.forbidden");
  if (certificate.id !== command.certificateId || certificate.version !== command.expectedVersion) {
    throw new CertificationError("certification.stale_version");
  }
  const existing = await repository.findByIdempotencyKey(command.idempotencyKey);
  if (existing) return CertificateSchema.parse(existing);
  return CertificateSchema.parse(await repository.revoke({ ...command, revokedBy: principal.userId }));
}

export async function verifyCertificate(
  repository: CertificateRepository,
  publicToken: string,
  now: Date,
): Promise<CertificateVerification> {
  if (!/^[A-Za-z0-9_-]{43,128}$/.test(publicToken)) return { status: "not_found" };
  const raw = await repository.findByPublicToken(publicToken);
  if (!raw) return { status: "not_found" };
  const certificate = CertificateSchema.parse(raw);
  if (certificate.state === "revoked" || certificate.revokedAt) {
    return CertificateVerificationSchema.parse({ status: "revoked", certificateId: certificate.id });
  }
  if (certificate.state === "expired" || (certificate.expiresAt && Date.parse(certificate.expiresAt) <= now.getTime())) {
    return CertificateVerificationSchema.parse({ status: "expired", certificateId: certificate.id });
  }
  return CertificateVerificationSchema.parse({
    status: "valid",
    certificateId: certificate.id,
    courseTitle: certificate.courseTitle,
    issuedAt: certificate.issuedAt,
    expiresAt: certificate.expiresAt,
  });
}
