import { describe, expect, it, vi } from "vitest";

import type {
  AdministrationCommandPort,
  AdministrationPrincipal,
  EnrollmentApplication,
  SupportIssue,
} from "@/features/administration/model";
import { AdministrationOperationsService } from "@/features/administration/operations-service";

const admin: AdministrationPrincipal = {
  userId: "admin-1",
  organizationId: "org-1",
  roles: ["admin"],
  permissions: ["enrollment:process", "issues:manage", "certificates:issue", "exports:create"],
  sessionId: "session-1",
};
const application: EnrollmentApplication = {
  id: "application-1",
  organizationId: "org-1",
  learnerId: "learner-1",
  courseId: "course-1",
  state: "pending",
  version: 2,
};
const issue: SupportIssue = {
  id: "issue-1",
  organizationId: "org-1",
  state: "open",
  version: 3,
};

function setup() {
  const port: AdministrationCommandPort = {
    getEnrollmentApplication: vi.fn(async () => application),
    processEnrollmentApplication: vi.fn(async (command) => ({ ...application, state: command.decision, version: 3 })),
    getIssue: vi.fn(async () => issue),
    changeIssueState: vi.fn(async (command) => ({ ...issue, state: command.toState, version: 4 })),
    getCertificateEligibility: vi.fn(async (learnerId, courseId) => ({ learnerId, courseId, organizationId: "org-1", eligible: true, eligibilityVersion: 5 })),
    issueCertificate: vi.fn(async () => ({ certificateId: "certificate-1" })),
    createExport: vi.fn(async (command) => ({ id: "export-1", organizationId: "org-1", kind: command.kind, state: "queued" as const, requestedBy: "admin-1", createdAt: "2026-07-18T08:00:00.000Z" })),
  };
  return { port, service: new AdministrationOperationsService(port) };
}

const applicationInput = {
  id: application.id,
  expectedVersion: application.version,
  decision: "accepted" as const,
  comment: "Approved for the July cohort.",
  idempotencyKey: "application-command-1",
  correlationId: "correlation-application-1",
};
const issueInput = {
  id: issue.id,
  expectedVersion: issue.version,
  toState: "resolved" as const,
  resolution: "The learner-facing link was corrected.",
  idempotencyKey: "issue-command-1",
  correlationId: "correlation-issue-1",
};

describe("administration operation authorization", () => {
  it("requires both the admin role and the action-specific permission", async () => {
    for (const principal of [
      { ...admin, roles: ["support"] },
      { ...admin, permissions: [] },
    ]) {
      const { port, service } = setup();
      await expect(service.processEnrollment(principal, applicationInput)).rejects.toMatchObject({ code: "ADMIN_FORBIDDEN" });
      expect(port.getEnrollmentApplication).not.toHaveBeenCalled();
    }
  });
});

describe("enrollment decision guards", () => {
  it("rejects invalid commands and missing applications before mutation", async () => {
    const invalid = setup();
    await expect(invalid.service.processEnrollment(admin, { ...applicationInput, comment: "" })).rejects.toMatchObject({ code: "ADMIN_INVALID_INPUT" });
    expect(invalid.port.getEnrollmentApplication).not.toHaveBeenCalled();

    const missing = setup();
    vi.mocked(missing.port.getEnrollmentApplication).mockResolvedValueOnce(null);
    await expect(missing.service.processEnrollment(admin, applicationInput)).rejects.toMatchObject({ code: "ADMIN_NOT_FOUND" });
    expect(missing.port.processEnrollmentApplication).not.toHaveBeenCalled();
  });

  it("rejects cross-tenant, stale, and already-decided applications", async () => {
    for (const [projection, code] of [
      [{ ...application, organizationId: "org-other" }, "ADMIN_FORBIDDEN"],
      [{ ...application, version: 3 }, "ADMIN_VERSION_CONFLICT"],
      [{ ...application, state: "accepted" as const }, "ADMIN_INVALID_STATE"],
    ] as const) {
      const suite = setup();
      vi.mocked(suite.port.getEnrollmentApplication).mockResolvedValueOnce(projection);
      await expect(suite.service.processEnrollment(admin, applicationInput)).rejects.toMatchObject({ code });
      expect(suite.port.processEnrollmentApplication).not.toHaveBeenCalled();
    }
  });
});

describe("support issue state guards", () => {
  it("handles invalid, missing, cross-tenant, stale, and terminal issue projections", async () => {
    const invalid = setup();
    await expect(invalid.service.changeIssueState(admin, { ...issueInput, resolution: "" })).rejects.toMatchObject({ code: "ADMIN_INVALID_INPUT" });
    expect(invalid.port.getIssue).not.toHaveBeenCalled();

    for (const [projection, code] of [
      [null, "ADMIN_NOT_FOUND"],
      [{ ...issue, organizationId: "org-other" }, "ADMIN_FORBIDDEN"],
      [{ ...issue, version: 4 }, "ADMIN_VERSION_CONFLICT"],
      [{ ...issue, state: "closed" as const }, "ADMIN_INVALID_STATE"],
    ] as const) {
      const suite = setup();
      vi.mocked(suite.port.getIssue).mockResolvedValueOnce(projection);
      await expect(suite.service.changeIssueState(admin, issueInput)).rejects.toMatchObject({ code });
      expect(suite.port.changeIssueState).not.toHaveBeenCalled();
    }
  });

  it("writes a valid issue transition with actor and before/after audit context", async () => {
    const suite = setup();
    await expect(suite.service.changeIssueState(admin, issueInput)).resolves.toMatchObject({ state: "resolved", version: 4 });
    expect(suite.port.changeIssueState).toHaveBeenCalledWith(
      expect.objectContaining({ actorId: "admin-1", expectedVersion: 3, toState: "resolved" }),
      expect.objectContaining({ eventName: "issue.state_changed", metadata: { fromState: "open", toState: "resolved" } }),
    );
  });
});

describe("certificate and export command guards", () => {
  const certificateInput = {
    learnerId: "learner-1",
    courseId: "course-1",
    idempotencyKey: "certificate-command-1",
    correlationId: "correlation-certificate-1",
  };

  it("validates certificate requests and tenant-scopes server eligibility", async () => {
    const invalid = setup();
    await expect(invalid.service.issueCertificate(admin, { learnerId: "" })).rejects.toMatchObject({ code: "ADMIN_INVALID_INPUT" });
    expect(invalid.port.getCertificateEligibility).not.toHaveBeenCalled();

    const crossTenant = setup();
    vi.mocked(crossTenant.port.getCertificateEligibility).mockResolvedValueOnce({ learnerId: "learner-1", courseId: "course-1", organizationId: "org-other", eligible: true, eligibilityVersion: 1 });
    await expect(crossTenant.service.issueCertificate(admin, certificateInput)).rejects.toMatchObject({ code: "ADMIN_FORBIDDEN" });
    expect(crossTenant.port.issueCertificate).not.toHaveBeenCalled();
  });

  it("preserves an unknown ineligibility reason and issues only eligible certificates", async () => {
    const ineligible = setup();
    vi.mocked(ineligible.port.getCertificateEligibility).mockResolvedValueOnce({ learnerId: "learner-1", courseId: "course-1", organizationId: "org-1", eligible: false, eligibilityVersion: 5 });
    await expect(ineligible.service.issueCertificate(admin, certificateInput)).rejects.toMatchObject({ code: "ADMIN_NOT_ELIGIBLE", details: { reasonCode: "unknown" } });

    const eligible = setup();
    await expect(eligible.service.issueCertificate(admin, certificateInput)).resolves.toEqual({ certificateId: "certificate-1" });
    expect(eligible.port.issueCertificate).toHaveBeenCalledWith(
      expect.objectContaining({ actorId: "admin-1", eligibilityVersion: 5 }),
      expect.objectContaining({ eventName: "certificate.issued" }),
    );
  });

  it("rejects malformed exports and applies an empty-filter default to valid jobs", async () => {
    const suite = setup();
    await expect(suite.service.createExport(admin, { kind: "secrets" })).rejects.toMatchObject({ code: "ADMIN_INVALID_INPUT" });
    expect(suite.port.createExport).not.toHaveBeenCalled();

    await expect(suite.service.createExport(admin, {
      kind: "learners",
      idempotencyKey: "export-command-1",
      correlationId: "correlation-export-1",
    })).resolves.toMatchObject({ state: "queued", kind: "learners" });
    expect(suite.port.createExport).toHaveBeenCalledWith(
      expect.objectContaining({ filters: {}, actorId: "admin-1" }),
      expect.objectContaining({ eventName: "export.requested", metadata: { kind: "learners" } }),
    );
  });
});
