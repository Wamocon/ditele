export const APP_ROLES = ["student", "trainer", "admin"] as const;

export type AppRole = (typeof APP_ROLES)[number];

/** The authenticated actor. Role lives on `profiles`; no orgs/cohorts/permissions. */
export interface Principal {
  userId: string;
  role: AppRole;
  email: string | null;
  displayName: string;
}

export interface AnonymousPrincipal {
  userId: null;
  role: "guest";
}

export type RequestPrincipal = Principal | AnonymousPrincipal;

export interface ExpectedVersion {
  expectedVersion: number;
}

export interface IdempotentCommand {
  idempotencyKey: string;
}
