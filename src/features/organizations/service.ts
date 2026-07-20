import type { Principal } from "@/shared/auth/types";

import {
  InviteOrganizationMemberInputSchema,
  OrganizationMembershipSchema,
  SsoConnectionSchema,
  type InviteOrganizationMemberInput,
  type OrganizationMembership,
  type SsoConnection,
} from "./model";

export class OrganizationError extends Error {
  constructor(readonly code: "organizations.forbidden" | "organizations.invalid_transition" | "organizations.stale_version" | "organizations.sso_unavailable") {
    super(code);
    this.name = "OrganizationError";
  }
}

export interface OrganizationRepository {
  findInvitationByIdempotencyKey(key: string): Promise<unknown | null>;
  invite(input: InviteOrganizationMemberInput & { invitedBy: string }): Promise<unknown>;
  saveMembership(membership: OrganizationMembership): Promise<unknown>;
}

function assertOrganizationAdmin(principal: Principal, organizationId: string): void {
  if (
    principal.organizationId !== organizationId
    || !principal.permissions.includes("organization.manage")
  ) {
    throw new OrganizationError("organizations.forbidden");
  }
}

export async function inviteOrganizationMember(repository: OrganizationRepository, principal: Principal, input: unknown): Promise<OrganizationMembership> {
  const command = InviteOrganizationMemberInputSchema.parse(input);
  assertOrganizationAdmin(principal, command.organizationId);
  const existing = await repository.findInvitationByIdempotencyKey(command.idempotencyKey);
  if (existing) return OrganizationMembershipSchema.parse(existing);
  return OrganizationMembershipSchema.parse(await repository.invite({ ...command, invitedBy: principal.userId }));
}

const membershipTransitions: Readonly<Record<OrganizationMembership["state"], readonly OrganizationMembership["state"][]>> = {
  invited: ["active", "removed"],
  active: ["suspended", "removed"],
  suspended: ["active", "removed"],
  removed: [],
};

export async function changeOrganizationMembershipState(
  repository: OrganizationRepository,
  principal: Principal,
  membershipInput: unknown,
  nextState: OrganizationMembership["state"],
  expectedVersion: number,
): Promise<OrganizationMembership> {
  const membership = OrganizationMembershipSchema.parse(membershipInput);
  assertOrganizationAdmin(principal, membership.organizationId);
  if (membership.version !== expectedVersion) throw new OrganizationError("organizations.stale_version");
  if (!membershipTransitions[membership.state].includes(nextState)) throw new OrganizationError("organizations.invalid_transition");
  return OrganizationMembershipSchema.parse(await repository.saveMembership({ ...membership, state: nextState, version: membership.version + 1 }));
}

export function getSsoLoginReadiness(principal: Principal | null, connectionInput: unknown): { ready: true; issuer: string; clientId: string } | { ready: false; reason: "forbidden" | "not_configured" | "provider_unavailable" } {
  const connection: SsoConnection = SsoConnectionSchema.parse(connectionInput);
  if (principal?.organizationId !== connection.organizationId) return { ready: false, reason: "forbidden" };
  if (connection.status === "provider_unavailable") return { ready: false, reason: "provider_unavailable" };
  if (connection.status !== "ready") return { ready: false, reason: "not_configured" };
  return { ready: true, issuer: connection.issuer, clientId: connection.clientId };
}
