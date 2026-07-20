export const APP_ROLES = [
  "learner",
  "trainer",
  "admin",
  "organization_admin",
  "content_admin",
  "support",
  "integration_admin",
  "dpo",
] as const;

export type AppRole = (typeof APP_ROLES)[number];

export interface Principal {
  userId: string;
  sessionId: string;
  organizationId: string | null;
  primaryRole: AppRole;
  roles: readonly AppRole[];
  permissions: readonly string[];
  cohortIds: readonly string[];
}

export interface AnonymousPrincipal {
  userId: null;
  sessionId: null;
  organizationId: null;
  primaryRole: "guest";
  roles: readonly [];
  permissions: readonly [];
  cohortIds: readonly [];
}

export type RequestPrincipal = Principal | AnonymousPrincipal;

export interface ExpectedVersion {
  expectedVersion: number;
}

export interface IdempotentCommand {
  idempotencyKey: string;
}

