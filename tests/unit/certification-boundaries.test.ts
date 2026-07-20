import { describe, expect, it, vi } from "vitest";

import type { Certificate } from "@/features/certification/model";
import {
  CertificationError,
  issueCertificate,
  revokeCertificate,
  verifyCertificate,
  type CertificateEligibilityPolicy,
  type CertificateRepository,
} from "@/features/certification/service";
import type { Principal } from "@/shared/auth/types";

const timestamp = "2026-07-18T08:00:00.000Z";
const token = "c".repeat(43);
const certificate: Certificate = {
  id: "certificate-1",
  learnerId: "learner-1",
  organizationId: "org-1",
  courseId: "course-1",
  courseTitle: "Testing foundations",
  state: "available",
  publicToken: token,
  issuedAt: timestamp,
  expiresAt: null,
  revokedAt: null,
  revocationReason: null,
  version: 1,
};
const issuer: Principal = {
  userId: "admin-1",
  sessionId: "session-1",
  organizationId: "org-1",
  primaryRole: "admin",
  roles: ["admin"],
  permissions: ["certificate.issue"],
  cohortIds: [],
};

function repositoryFixture(existing: unknown | null = null): CertificateRepository {
  return {
    findByIdempotencyKey: vi.fn(async () => existing),
    issue: vi.fn(async () => certificate),
    revoke: vi.fn(async () => ({ ...certificate, state: "revoked", revokedAt: timestamp, revocationReason: "Incorrect learner identity", version: 2 })),
    findByPublicToken: vi.fn(async () => certificate),
  };
}

const eligible: CertificateEligibilityPolicy = { isEligible: vi.fn(async () => true) };

describe("certificate command authorization and idempotency", () => {
  it("requires the certificate permission even inside the matching tenant", async () => {
    const repository = repositoryFixture();
    await expect(
      issueCertificate(
        { repository, eligibility: eligible },
        { ...issuer, permissions: [] },
        { learnerId: "learner-1", courseId: "course-1", organizationId: "org-1", idempotencyKey: "certificate-issue-0001" },
      ),
    ).rejects.toEqual(new CertificationError("certification.forbidden"));
    expect(repository.findByIdempotencyKey).not.toHaveBeenCalled();
  });

  it("allows explicitly permitted global issuance and returns a validated idempotent result", async () => {
    const globalCertificate = { ...certificate, organizationId: null };
    const repository = repositoryFixture(globalCertificate);
    await expect(
      issueCertificate(
        { repository, eligibility: eligible },
        { ...issuer, organizationId: "org-other" },
        { learnerId: "learner-1", courseId: "course-1", organizationId: null, idempotencyKey: "certificate-issue-0002" },
      ),
    ).resolves.toEqual(globalCertificate);
    expect(eligible.isEligible).not.toHaveBeenCalled();
    expect(repository.issue).not.toHaveBeenCalled();
  });

  it("issues an eligible certificate with actor-derived issuer identity", async () => {
    const repository = repositoryFixture();
    const eligibility: CertificateEligibilityPolicy = { isEligible: vi.fn(async () => true) };
    await expect(
      issueCertificate(
        { repository, eligibility },
        issuer,
        { learnerId: "learner-1", courseId: "course-1", organizationId: "org-1", idempotencyKey: "certificate-issue-0003" },
      ),
    ).resolves.toEqual(certificate);
    expect(repository.issue).toHaveBeenCalledWith(expect.objectContaining({ issuedBy: "admin-1" }));
  });

  it("rejects mismatched certificate id and stale version before revocation persistence", async () => {
    for (const input of [
      { certificateId: "certificate-other", expectedVersion: 1 },
      { certificateId: certificate.id, expectedVersion: 2 },
    ]) {
      const repository = repositoryFixture();
      await expect(
        revokeCertificate(repository, issuer, certificate, {
          ...input,
          reason: "Incorrect learner identity",
          idempotencyKey: `certificate-revoke-${input.expectedVersion}001`,
        }),
      ).rejects.toEqual(new CertificationError("certification.stale_version"));
      expect(repository.revoke).not.toHaveBeenCalled();
    }
  });

  it("deduplicates and then executes valid revocation commands", async () => {
    const revoked = { ...certificate, state: "revoked" as const, revokedAt: timestamp, revocationReason: "Incorrect learner identity", version: 2 };
    const replay = repositoryFixture(revoked);
    await expect(
      revokeCertificate(replay, issuer, certificate, {
        certificateId: certificate.id,
        reason: "Incorrect learner identity",
        expectedVersion: 1,
        idempotencyKey: "certificate-revoke-replay",
      }),
    ).resolves.toEqual(revoked);
    expect(replay.revoke).not.toHaveBeenCalled();

    const repository = repositoryFixture();
    await expect(
      revokeCertificate(repository, issuer, certificate, {
        certificateId: certificate.id,
        reason: "Incorrect learner identity",
        expectedVersion: 1,
        idempotencyKey: "certificate-revoke-valid",
      }),
    ).resolves.toEqual(revoked);
    expect(repository.revoke).toHaveBeenCalledWith(expect.objectContaining({ revokedBy: "admin-1" }));
  });
});

describe("public certificate verification states", () => {
  it("returns not-found for a valid-looking token missing from persistence", async () => {
    const repository = repositoryFixture();
    vi.mocked(repository.findByPublicToken).mockResolvedValueOnce(null);
    await expect(verifyCertificate(repository, token, new Date(timestamp))).resolves.toEqual({ status: "not_found" });
  });

  it("treats revoked timestamps as authoritative even before state reconciliation", async () => {
    const repository = repositoryFixture();
    vi.mocked(repository.findByPublicToken).mockResolvedValueOnce({ ...certificate, revokedAt: timestamp });
    await expect(verifyCertificate(repository, token, new Date(timestamp))).resolves.toEqual({ status: "revoked", certificateId: certificate.id });
  });

  it("recognizes explicit and time-derived expiry without returning learner details", async () => {
    const explicit = repositoryFixture();
    vi.mocked(explicit.findByPublicToken).mockResolvedValueOnce({ ...certificate, state: "expired" });
    await expect(verifyCertificate(explicit, token, new Date(timestamp))).resolves.toEqual({ status: "expired", certificateId: certificate.id });

    const timed = repositoryFixture();
    vi.mocked(timed.findByPublicToken).mockResolvedValueOnce({ ...certificate, expiresAt: "2026-07-18T07:59:59.000Z" });
    await expect(verifyCertificate(timed, token, new Date(timestamp))).resolves.toEqual({ status: "expired", certificateId: certificate.id });
  });

  it("returns a valid projection for a future-expiring certificate", async () => {
    const repository = repositoryFixture();
    vi.mocked(repository.findByPublicToken).mockResolvedValueOnce({ ...certificate, expiresAt: "2026-07-19T08:00:00.000Z" });
    await expect(verifyCertificate(repository, token, new Date(timestamp))).resolves.toEqual({
      status: "valid",
      certificateId: certificate.id,
      courseTitle: certificate.courseTitle,
      issuedAt: certificate.issuedAt,
      expiresAt: "2026-07-19T08:00:00.000Z",
    });
  });
});
