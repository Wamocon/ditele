import { describe, expect, it, vi } from "vitest";

import type { Principal } from "@/shared/auth/types";

import type { Certificate } from "./model";
import { CertificationError, issueCertificate, verifyCertificate } from "./service";

const token = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQ";
const certificate: Certificate = { id: "cert-1", learnerId: "learner-1", organizationId: "org-1", courseId: "course-1", courseTitle: "Software Testing", state: "available", publicToken: token, issuedAt: "2026-07-17T10:00:00.000Z", expiresAt: null, revokedAt: null, revocationReason: null, version: 1 };
const issuer: Principal = { userId: "admin-1", sessionId: "s1", organizationId: "org-1", primaryRole: "admin", roles: ["admin"], permissions: ["certificate.issue"], cohortIds: [] };

describe("certification", () => {
  it("requires server eligibility before issuing", async () => {
    const repository = { findByIdempotencyKey: vi.fn().mockResolvedValue(null), issue: vi.fn().mockResolvedValue(certificate), revoke: vi.fn(), findByPublicToken: vi.fn() };
    await expect(issueCertificate({ repository, eligibility: { isEligible: vi.fn().mockResolvedValue(false) } }, issuer, { learnerId: "learner-1", courseId: "course-1", organizationId: "org-1", idempotencyKey: "issue:learner-1:course-1" })).rejects.toEqual(new CertificationError("certification.not_eligible"));
    expect(repository.issue).not.toHaveBeenCalled();
  });

  it("rejects a cross-tenant issuer", async () => {
    const repository = { findByIdempotencyKey: vi.fn(), issue: vi.fn(), revoke: vi.fn(), findByPublicToken: vi.fn() };
    await expect(issueCertificate({ repository, eligibility: { isEligible: vi.fn() } }, { ...issuer, organizationId: "org-2" }, { learnerId: "learner-1", courseId: "course-1", organizationId: "org-1", idempotencyKey: "issue:learner-1:course-2" })).rejects.toEqual(new CertificationError("certification.forbidden"));
  });

  it("verifies only unexpired, non-revoked unguessable tokens", async () => {
    const repository = { findByIdempotencyKey: vi.fn(), issue: vi.fn(), revoke: vi.fn(), findByPublicToken: vi.fn().mockResolvedValue(certificate) };
    await expect(verifyCertificate(repository, "short", new Date("2026-07-17T12:00:00.000Z"))).resolves.toEqual({ status: "not_found" });
    await expect(verifyCertificate(repository, token, new Date("2026-07-17T12:00:00.000Z"))).resolves.toMatchObject({ status: "valid", certificateId: "cert-1" });
  });

  it("does not expose details for revoked certificates", async () => {
    const repository = { findByIdempotencyKey: vi.fn(), issue: vi.fn(), revoke: vi.fn(), findByPublicToken: vi.fn().mockResolvedValue({ ...certificate, state: "revoked", revokedAt: "2026-07-17T11:00:00.000Z" }) };
    await expect(verifyCertificate(repository, token, new Date("2026-07-17T12:00:00.000Z"))).resolves.toEqual({ status: "revoked", certificateId: "cert-1" });
  });
});
