export type AdministrationPermission =
  | "impersonation:start"
  | "impersonation:end"
  | "users:manage"
  | "enrollment:process"
  | "certificates:issue"
  | "reports:read"
  | "issues:manage"
  | "notifications:send"
  | "exports:create";

export interface AdministrationPrincipal {
  readonly userId: string;
  readonly organizationId: string;
  readonly roles: readonly string[];
  readonly permissions: readonly AdministrationPermission[];
  readonly sessionId: string;
}

export interface AdministrationAuditRequest {
  readonly eventName: string;
  readonly actorId: string;
  readonly organizationId: string;
  readonly resourceType:
    | "impersonation_session"
    | "user"
    | "enrollment_application"
    | "certificate"
    | "issue"
    | "notification"
    | "export";
  readonly resourceId: string;
  readonly correlationId: string;
  readonly metadata: Readonly<Record<string, string | number | boolean>>;
}

export interface ImpersonationTarget {
  readonly userId: string;
  readonly organizationId: string;
  readonly displayName: string;
  readonly role: "learner" | "trainer" | "organization_admin";
  readonly active: boolean;
}

export interface ImpersonationSession {
  readonly id: string;
  readonly administratorId: string;
  readonly administratorSessionId: string;
  readonly organizationId: string;
  readonly target: ImpersonationTarget;
  readonly reason: string;
  readonly state: "active" | "ended" | "expired";
  readonly startedAt: string;
  readonly expiresAt: string;
  readonly endedAt?: string;
}

export interface StartImpersonationCommand {
  readonly administratorId: string;
  readonly administratorSessionId: string;
  readonly targetUserId: string;
  readonly reason: string;
  readonly expiresAt: string;
  readonly idempotencyKey: string;
}

export interface EndImpersonationCommand {
  readonly impersonationSessionId: string;
  readonly administratorId: string;
  readonly administratorSessionId: string;
  readonly idempotencyKey: string;
}

export interface ImpersonationPort {
  getTarget(targetUserId: string): Promise<ImpersonationTarget | null>;
  getSession(sessionId: string): Promise<ImpersonationSession | null>;
  start(
    command: StartImpersonationCommand,
    audit: AdministrationAuditRequest,
  ): Promise<ImpersonationSession>;
  end(
    command: EndImpersonationCommand,
    audit: AdministrationAuditRequest,
  ): Promise<ImpersonationSession>;
}

export type ExportKind =
  | "learners"
  | "cohort_progress"
  | "certificates"
  | "reviews"
  | "issues";

export interface ExportJob {
  readonly id: string;
  readonly organizationId: string;
  readonly kind: ExportKind;
  readonly state: "queued" | "running" | "ready" | "failed" | "expired";
  readonly requestedBy: string;
  readonly createdAt: string;
  readonly expiresAt?: string;
  readonly downloadUrl?: string;
  readonly errorCode?: string;
}

export interface EnrollmentApplication {
  readonly id: string;
  readonly organizationId: string;
  readonly learnerId: string;
  readonly courseId: string;
  readonly state: "pending" | "accepted" | "rejected";
  readonly version: number;
}

export interface SupportIssue {
  readonly id: string;
  readonly organizationId: string;
  readonly state: "open" | "in_progress" | "resolved" | "closed";
  readonly version: number;
}

export interface CertificateEligibility {
  readonly learnerId: string;
  readonly courseId: string;
  readonly organizationId: string;
  readonly eligible: boolean;
  readonly eligibilityVersion: number;
  readonly reasonCode?: string;
}

export interface AdministrationCommandPort {
  getEnrollmentApplication(id: string): Promise<EnrollmentApplication | null>;
  processEnrollmentApplication(
    command: {
      readonly id: string;
      readonly expectedVersion: number;
      readonly decision: "accepted" | "rejected";
      readonly comment: string;
      readonly actorId: string;
      readonly idempotencyKey: string;
    },
    audit: AdministrationAuditRequest,
  ): Promise<EnrollmentApplication>;
  getIssue(id: string): Promise<SupportIssue | null>;
  changeIssueState(
    command: {
      readonly id: string;
      readonly expectedVersion: number;
      readonly toState: SupportIssue["state"];
      readonly resolution: string;
      readonly actorId: string;
      readonly idempotencyKey: string;
    },
    audit: AdministrationAuditRequest,
  ): Promise<SupportIssue>;
  getCertificateEligibility(learnerId: string, courseId: string): Promise<CertificateEligibility>;
  issueCertificate(
    command: {
      readonly learnerId: string;
      readonly courseId: string;
      readonly eligibilityVersion: number;
      readonly actorId: string;
      readonly idempotencyKey: string;
    },
    audit: AdministrationAuditRequest,
  ): Promise<{ readonly certificateId: string }>;
  createExport(
    command: {
      readonly kind: ExportKind;
      readonly filters: Readonly<Record<string, string>>;
      readonly actorId: string;
      readonly idempotencyKey: string;
    },
    audit: AdministrationAuditRequest,
  ): Promise<ExportJob>;
}
