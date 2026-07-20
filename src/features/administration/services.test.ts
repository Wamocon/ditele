import { describe, expect, it, vi } from "vitest";

import type {
  AdministrationCommandPort,
  AdministrationPrincipal,
  ImpersonationPort,
  ImpersonationSession,
} from "./model";
import { ImpersonationService } from "./impersonation-service";
import { AdministrationOperationsService } from "./operations-service";

const admin: AdministrationPrincipal = {
  userId: "admin-1",
  organizationId: "org-1",
  roles: ["admin"],
  permissions: [
    "impersonation:start",
    "impersonation:end",
    "enrollment:process",
    "certificates:issue",
    "issues:manage",
    "exports:create",
  ],
  sessionId: "session-admin-1",
};

function impersonationSetup() {
  const activeSession: ImpersonationSession = {
    id: "impersonation-1",
    administratorId: "admin-1",
    administratorSessionId: "session-admin-1",
    organizationId: "org-1",
    target: {
      userId: "learner-1",
      organizationId: "org-1",
      displayName: "Learner",
      role: "learner",
      active: true,
    },
    reason: "Verify learner workflow",
    state: "active",
    startedAt: "2026-07-17T09:00:00.000Z",
    expiresAt: "2026-07-17T09:30:00.000Z",
  };
  const port: ImpersonationPort = {
    getTarget: vi.fn(async () => activeSession.target),
    getSession: vi.fn(async () => activeSession),
    start: vi.fn(async () => activeSession),
    end: vi.fn(async () => ({ ...activeSession, state: "ended" as const })),
  };
  return {
    port,
    service: new ImpersonationService(
      port,
      30,
      () => new Date("2026-07-17T09:00:00.000Z"),
    ),
  };
}

describe("ImpersonationService", () => {
  it("starts a bounded, reasoned, audited role-view session", async () => {
    const { port, service } = impersonationSetup();
    await service.start(admin, {
      targetUserId: "learner-1",
      reason: "Verify learner workflow",
      durationMinutes: 30,
      idempotencyKey: "impersonation-key-1",
      correlationId: "correlation-1",
    });
    expect(port.start).toHaveBeenCalledWith(
      expect.objectContaining({
        administratorId: "admin-1",
        administratorSessionId: "session-admin-1",
        expiresAt: "2026-07-17T09:30:00.000Z",
      }),
      expect.objectContaining({ eventName: "impersonation.started" }),
    );
  });

  it("rejects excessive duration and cross-tenant targets", async () => {
    const { service } = impersonationSetup();
    await expect(service.start(admin, {
      targetUserId: "learner-1",
      reason: "Verify learner workflow",
      durationMinutes: 31,
      idempotencyKey: "impersonation-key-2",
      correlationId: "correlation-2",
    })).rejects.toMatchObject({ code: "ADMIN_INVALID_INPUT" });

    const { service: crossTenantService } = impersonationSetup();
    const crossTenantPort = (crossTenantService as unknown as { port: ImpersonationPort }).port;
    vi.mocked(crossTenantPort.getTarget).mockResolvedValue({
      userId: "learner-2",
      organizationId: "org-2",
      displayName: "Other Learner",
      role: "learner",
      active: true,
    });
    await expect(crossTenantService.start(admin, {
      targetUserId: "learner-2",
      reason: "Verify learner workflow",
      durationMinutes: 10,
      idempotencyKey: "impersonation-key-3",
      correlationId: "correlation-3",
    })).rejects.toMatchObject({ code: "ADMIN_FORBIDDEN" });
  });

  it("ends only the administrator's active server session", async () => {
    const { port, service } = impersonationSetup();
    await service.end(admin, {
      impersonationSessionId: "impersonation-1",
      idempotencyKey: "impersonation-key-4",
      correlationId: "correlation-4",
    });
    expect(port.end).toHaveBeenCalledWith(
      expect.objectContaining({ administratorSessionId: "session-admin-1" }),
      expect.objectContaining({ eventName: "impersonation.ended" }),
    );
  });
});

function operationsSetup() {
  const port: AdministrationCommandPort = {
    getEnrollmentApplication: vi.fn(async () => ({
      id: "application-1",
      organizationId: "org-1",
      learnerId: "learner-1",
      courseId: "course-1",
      state: "pending" as const,
      version: 2,
    })),
    processEnrollmentApplication: vi.fn(async (command) => {
      void command;
      return {
        id: "application-1",
        organizationId: "org-1",
        learnerId: "learner-1",
        courseId: "course-1",
        state: "accepted" as const,
        version: 3,
      };
    }),
    getIssue: vi.fn(async () => null),
    changeIssueState: vi.fn(),
    getCertificateEligibility: vi.fn(async () => ({
      learnerId: "learner-1",
      courseId: "course-1",
      organizationId: "org-1",
      eligible: false,
      eligibilityVersion: 3,
      reasonCode: "tasks_incomplete",
    })),
    issueCertificate: vi.fn(async () => ({ certificateId: "certificate-1" })),
    createExport: vi.fn(async (command) => {
      void command;
      return {
        id: "export-1",
        organizationId: "org-1",
        kind: "reviews" as const,
        state: "queued" as const,
        requestedBy: "admin-1",
        createdAt: "2026-07-17T09:00:00.000Z",
      };
    }),
  };
  return { port, service: new AdministrationOperationsService(port) };
}

describe("AdministrationOperationsService", () => {
  it("processes a pending application with version and audit context", async () => {
    const { port, service } = operationsSetup();
    await service.processEnrollment(admin, {
      id: "application-1",
      expectedVersion: 2,
      decision: "accepted",
      comment: "Assigned to cohort.",
      idempotencyKey: "application-key-1",
      correlationId: "correlation-5",
    });
    expect(port.processEnrollmentApplication).toHaveBeenCalledWith(
      expect.objectContaining({ actorId: "admin-1", expectedVersion: 2 }),
      expect.objectContaining({ eventName: "enrollment.accepted" }),
    );
  });

  it("does not invent or bypass certificate eligibility rules", async () => {
    const { port, service } = operationsSetup();
    await expect(service.issueCertificate(admin, {
      learnerId: "learner-1",
      courseId: "course-1",
      idempotencyKey: "certificate-key-1",
      correlationId: "correlation-6",
    })).rejects.toMatchObject({ code: "ADMIN_NOT_ELIGIBLE" });
    expect(port.issueCertificate).not.toHaveBeenCalled();
  });

  it("creates an audited asynchronous export job", async () => {
    const { port, service } = operationsSetup();
    await service.createExport(admin, {
      kind: "reviews",
      filters: { cohortId: "cohort-1" },
      idempotencyKey: "export-key-1",
      correlationId: "correlation-7",
    });
    expect(port.createExport).toHaveBeenCalledWith(
      expect.objectContaining({ actorId: "admin-1", kind: "reviews" }),
      expect.objectContaining({ eventName: "export.requested" }),
    );
  });
});
