import { z } from "zod";

import { AdministrationError } from "./errors";
import type {
  AdministrationAuditRequest,
  AdministrationCommandPort,
  AdministrationPermission,
  AdministrationPrincipal,
  EnrollmentApplication,
  ExportJob,
  SupportIssue,
} from "./model";

const baseSchema = z.object({
  id: z.string().min(1),
  expectedVersion: z.number().int().nonnegative(),
  idempotencyKey: z.string().min(8).max(200),
  correlationId: z.string().min(8).max(200),
});
const applicationSchema = baseSchema.extend({
  decision: z.enum(["accepted", "rejected"]),
  comment: z.string().trim().min(3).max(2_000),
});
const issueSchema = baseSchema.extend({
  toState: z.enum(["open", "in_progress", "resolved", "closed"]),
  resolution: z.string().trim().min(3).max(5_000),
});
const certificateSchema = z.object({
  learnerId: z.string().min(1),
  courseId: z.string().min(1),
  idempotencyKey: z.string().min(8).max(200),
  correlationId: z.string().min(8).max(200),
});
const exportSchema = z.object({
  kind: z.enum(["learners", "cohort_progress", "certificates", "reviews", "issues"]),
  filters: z.record(z.string(), z.string()).default({}),
  idempotencyKey: z.string().min(8).max(200),
  correlationId: z.string().min(8).max(200),
});

function assertAdmin(principal: AdministrationPrincipal, permission: AdministrationPermission): void {
  if (!principal.roles.includes("admin") || !principal.permissions.includes(permission)) {
    throw new AdministrationError("ADMIN_FORBIDDEN", "The administration action is not allowed.");
  }
}

function assertOrganization(
  principal: AdministrationPrincipal,
  resourceOrganizationId: string,
): void {
  if (principal.organizationId !== resourceOrganizationId) {
    throw new AdministrationError("ADMIN_FORBIDDEN", "The administration resource is outside scope.");
  }
}

function audit(input: {
  readonly principal: AdministrationPrincipal;
  readonly eventName: string;
  readonly resourceType: AdministrationAuditRequest["resourceType"];
  readonly resourceId: string;
  readonly correlationId: string;
  readonly metadata: Readonly<Record<string, string | number | boolean>>;
}): AdministrationAuditRequest {
  return {
    eventName: input.eventName,
    actorId: input.principal.userId,
    organizationId: input.principal.organizationId,
    resourceType: input.resourceType,
    resourceId: input.resourceId,
    correlationId: input.correlationId,
    metadata: input.metadata,
  };
}

export class AdministrationOperationsService {
  constructor(private readonly port: AdministrationCommandPort) {}

  async processEnrollment(
    principal: AdministrationPrincipal,
    rawInput: unknown,
  ): Promise<EnrollmentApplication> {
    assertAdmin(principal, "enrollment:process");
    const input = applicationSchema.safeParse(rawInput);
    if (!input.success) {
      throw new AdministrationError("ADMIN_INVALID_INPUT", "The application decision is invalid.");
    }
    const application = await this.port.getEnrollmentApplication(input.data.id);
    if (!application) {
      throw new AdministrationError("ADMIN_NOT_FOUND", "The application does not exist.");
    }
    assertOrganization(principal, application.organizationId);
    if (application.version !== input.data.expectedVersion) {
      throw new AdministrationError("ADMIN_VERSION_CONFLICT", "The application changed after loading.");
    }
    if (application.state !== "pending") {
      throw new AdministrationError("ADMIN_INVALID_STATE", "The application was already processed.");
    }
    return this.port.processEnrollmentApplication(
      {
        id: application.id,
        expectedVersion: input.data.expectedVersion,
        decision: input.data.decision,
        comment: input.data.comment,
        actorId: principal.userId,
        idempotencyKey: input.data.idempotencyKey,
      },
      audit({
        principal,
        eventName: `enrollment.${input.data.decision}`,
        resourceType: "enrollment_application",
        resourceId: application.id,
        correlationId: input.data.correlationId,
        metadata: { expectedVersion: input.data.expectedVersion },
      }),
    );
  }

  async changeIssueState(
    principal: AdministrationPrincipal,
    rawInput: unknown,
  ): Promise<SupportIssue> {
    assertAdmin(principal, "issues:manage");
    const input = issueSchema.safeParse(rawInput);
    if (!input.success) {
      throw new AdministrationError("ADMIN_INVALID_INPUT", "The issue update is invalid.");
    }
    const issue = await this.port.getIssue(input.data.id);
    if (!issue) {
      throw new AdministrationError("ADMIN_NOT_FOUND", "The issue does not exist.");
    }
    assertOrganization(principal, issue.organizationId);
    if (issue.version !== input.data.expectedVersion) {
      throw new AdministrationError("ADMIN_VERSION_CONFLICT", "The issue changed after loading.");
    }
    if (issue.state === "closed") {
      throw new AdministrationError("ADMIN_INVALID_STATE", "A closed issue cannot be changed.");
    }
    return this.port.changeIssueState(
      {
        id: issue.id,
        expectedVersion: input.data.expectedVersion,
        toState: input.data.toState,
        resolution: input.data.resolution,
        actorId: principal.userId,
        idempotencyKey: input.data.idempotencyKey,
      },
      audit({
        principal,
        eventName: "issue.state_changed",
        resourceType: "issue",
        resourceId: issue.id,
        correlationId: input.data.correlationId,
        metadata: { fromState: issue.state, toState: input.data.toState },
      }),
    );
  }

  async issueCertificate(
    principal: AdministrationPrincipal,
    rawInput: unknown,
  ): Promise<{ readonly certificateId: string }> {
    assertAdmin(principal, "certificates:issue");
    const input = certificateSchema.safeParse(rawInput);
    if (!input.success) {
      throw new AdministrationError("ADMIN_INVALID_INPUT", "The certificate request is invalid.");
    }
    const eligibility = await this.port.getCertificateEligibility(
      input.data.learnerId,
      input.data.courseId,
    );
    assertOrganization(principal, eligibility.organizationId);
    if (!eligibility.eligible) {
      throw new AdministrationError(
        "ADMIN_NOT_ELIGIBLE",
        "The server eligibility rule does not permit certificate issuance.",
        { reasonCode: eligibility.reasonCode ?? "unknown" },
      );
    }
    return this.port.issueCertificate(
      {
        learnerId: input.data.learnerId,
        courseId: input.data.courseId,
        eligibilityVersion: eligibility.eligibilityVersion,
        actorId: principal.userId,
        idempotencyKey: input.data.idempotencyKey,
      },
      audit({
        principal,
        eventName: "certificate.issued",
        resourceType: "certificate",
        resourceId: `${input.data.learnerId}:${input.data.courseId}`,
        correlationId: input.data.correlationId,
        metadata: { eligibilityVersion: eligibility.eligibilityVersion },
      }),
    );
  }

  async createExport(principal: AdministrationPrincipal, rawInput: unknown): Promise<ExportJob> {
    assertAdmin(principal, "exports:create");
    const input = exportSchema.safeParse(rawInput);
    if (!input.success) {
      throw new AdministrationError("ADMIN_INVALID_INPUT", "The export request is invalid.");
    }
    return this.port.createExport(
      {
        kind: input.data.kind,
        filters: input.data.filters,
        actorId: principal.userId,
        idempotencyKey: input.data.idempotencyKey,
      },
      audit({
        principal,
        eventName: "export.requested",
        resourceType: "export",
        resourceId: `${principal.userId}:${input.data.idempotencyKey}`,
        correlationId: input.data.correlationId,
        metadata: { kind: input.data.kind },
      }),
    );
  }
}
