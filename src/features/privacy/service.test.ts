import { describe, expect, it, vi } from "vitest";

import type { Principal } from "@/shared/auth/types";

import { PrivacyError, createPrivacyRequest, retentionDisposition, transitionPrivacyRequest } from "./service";

const principal: Principal = { userId: "learner-1", sessionId: "s1", organizationId: "org-1", primaryRole: "learner", roles: ["learner"], permissions: [], cohortIds: [] };
const request = { id: "privacy-1", subjectId: "learner-1", organizationId: "org-1", type: "export" as const, state: "requested" as const, version: 1, requestedAt: "2026-07-17T12:00:00.000Z", completedAt: null, failureCode: null, idempotencyKey: "export:learner-1:one" };

describe("privacy workflows", () => {
  it("allows a subject to request an idempotent export", async () => {
    const repository = { findByIdempotencyKey: vi.fn().mockResolvedValue(request), create: vi.fn(), save: vi.fn() };
    await expect(createPrivacyRequest(repository, principal, { subjectId: "learner-1", organizationId: "org-1", type: "export", requestedAt: request.requestedAt, idempotencyKey: request.idempotencyKey })).resolves.toEqual(request);
    expect(repository.create).not.toHaveBeenCalled();
  });

  it("requires DPO permission for processing transitions", async () => {
    const repository = { findByIdempotencyKey: vi.fn(), create: vi.fn(), save: vi.fn() };
    await expect(transitionPrivacyRequest(repository, principal, request, "processing", 1)).rejects.toEqual(new PrivacyError("privacy.forbidden"));
    const dpo = { ...principal, userId: "dpo-1", primaryRole: "dpo" as const, roles: ["dpo" as const], permissions: ["privacy.manage"] };
    repository.save.mockImplementation((value) => value);
    await expect(transitionPrivacyRequest(repository, dpo, request, "processing", 1)).resolves.toMatchObject({ state: "processing", version: 2 });
    await expect(transitionPrivacyRequest(
      repository,
      { ...dpo, organizationId: "org-2" },
      request,
      "processing",
      1,
    )).rejects.toEqual(new PrivacyError("privacy.forbidden"));
  });

  it("allows self-cancellation but reserves processing and rejection for the scoped DPO", async () => {
    const repository = {
      findByIdempotencyKey: vi.fn(),
      create: vi.fn(),
      save: vi.fn().mockImplementation((value) => value),
    };
    await expect(transitionPrivacyRequest(
      repository,
      principal,
      request,
      "cancelled",
      1,
    )).resolves.toMatchObject({ state: "cancelled", version: 2 });
    await expect(transitionPrivacyRequest(
      repository,
      principal,
      request,
      "rejected",
      1,
    )).rejects.toEqual(new PrivacyError("privacy.forbidden"));
  });

  it("never deletes records under legal hold and honors policy age", () => {
    const policy = { entityType: "ai_conversation", retentionDays: 30, action: "delete" as const };
    expect(retentionDisposition({ id: "a1", entityType: "ai_conversation", referenceDate: "2026-01-01T00:00:00.000Z", legalHold: true }, policy, new Date("2026-07-17T00:00:00.000Z"))).toBe("legal_hold");
    expect(retentionDisposition({ id: "a2", entityType: "ai_conversation", referenceDate: "2026-01-01T00:00:00.000Z", legalHold: false }, policy, new Date("2026-07-17T00:00:00.000Z"))).toBe("delete");
  });
});
