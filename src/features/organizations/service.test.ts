import { describe, expect, it, vi } from "vitest";

import type { Principal } from "@/shared/auth/types";

import { OrganizationSchema } from "./model";
import { OrganizationError, changeOrganizationMembershipState, getSsoLoginReadiness, inviteOrganizationMember } from "./service";

const admin: Principal = { userId: "admin-1", sessionId: "s1", organizationId: "org-1", primaryRole: "organization_admin", roles: ["organization_admin"], permissions: ["organization.manage"], cohortIds: [] };
const membership = { id: "membership-1", organizationId: "org-1", userId: "learner-1", role: "member" as const, state: "invited" as const, version: 1 };

describe("organizations", () => {
  it("accepts every persisted organization lifecycle state", () => {
    for (const state of ["active", "suspended", "archived"] as const) {
      expect(OrganizationSchema.parse({
        id: "org-1",
        name: "Academy",
        slug: "academy",
        state,
        createdAt: "2026-07-17T12:00:00.000Z",
      }).state).toBe(state);
    }
  });

  it("enforces tenant isolation for invitations", async () => {
    const repository = { findInvitationByIdempotencyKey: vi.fn(), invite: vi.fn(), saveMembership: vi.fn() };
    await expect(inviteOrganizationMember(repository, { ...admin, organizationId: "org-2" }, { organizationId: "org-1", email: "learner@example.test", role: "member", idempotencyKey: "invite:learner:org-1" })).rejects.toEqual(new OrganizationError("organizations.forbidden"));
  });

  it("requires the canonical organization-management permission", async () => {
    const repository = { findInvitationByIdempotencyKey: vi.fn(), invite: vi.fn(), saveMembership: vi.fn() };
    const command = { organizationId: "org-1", email: "learner@example.test", role: "member", idempotencyKey: "invite:learner:org-1" };

    await expect(inviteOrganizationMember(
      repository,
      { ...admin, permissions: ["organization.members.manage"] },
      command,
    )).rejects.toEqual(new OrganizationError("organizations.forbidden"));
    expect(repository.findInvitationByIdempotencyKey).not.toHaveBeenCalled();
    expect(repository.invite).not.toHaveBeenCalled();
  });

  it("activates an invitation with optimistic concurrency", async () => {
    const repository = { findInvitationByIdempotencyKey: vi.fn(), invite: vi.fn(), saveMembership: vi.fn().mockImplementation((value) => value) };
    await expect(changeOrganizationMembershipState(repository, admin, membership, "active", 1)).resolves.toMatchObject({ state: "active", version: 2 });
    await expect(changeOrganizationMembershipState(repository, admin, membership, "active", 2)).rejects.toEqual(new OrganizationError("organizations.stale_version"));
  });

  it("reports OIDC readiness without inventing provider behavior", () => {
    const connection = { id: "sso-1", organizationId: "org-1", protocol: "oidc" as const, issuer: "https://id.example.test", clientId: "client-1", status: "provider_unavailable" as const, domainHint: null };
    expect(getSsoLoginReadiness(admin, connection)).toEqual({ ready: false, reason: "provider_unavailable" });
    expect(getSsoLoginReadiness({ ...admin, organizationId: "org-2" }, { ...connection, status: "ready" })).toEqual({ ready: false, reason: "forbidden" });
  });
});
