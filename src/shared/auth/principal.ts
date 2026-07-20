import "server-only";

import { createServerClient } from "@/shared/database/server";

import { AuthenticationRequiredError } from "./errors";
import { APP_ROLES, type AppRole, type Principal } from "./types";

const appRoleSet = new Set<string>(APP_ROLES);
const platformGlobalRoles = new Set<AppRole>([
  "admin",
  "content_admin",
  "support",
  "integration_admin",
  "dpo",
]);
const accessibleCohortStates = new Set(["waiting", "active", "completed"]);

function isAppRole(value: string): value is AppRole {
  return appRoleSet.has(value);
}

function isCohortRole(role: AppRole): role is "learner" | "trainer" {
  return role === "learner" || role === "trainer";
}

function isUnexpired(validUntil: string | null, now: number): boolean {
  return validUntil === null || Date.parse(validUntil) > now;
}

export async function requirePrincipal(): Promise<Principal> {
  const client = await createServerClient();
  const { data: userData, error: userError } = await client.auth.getUser();

  if (userError || !userData.user) {
    throw new AuthenticationRequiredError();
  }

  const userId = userData.user.id;
  const now = new Date().toISOString();
  const nowTimestamp = Date.parse(now);

  const [profileResult, roleResult, cohortResult, organizationResult] =
    await Promise.all([
      client
        .from("profiles")
        .select("state, deactivated_at")
        .eq("user_id", userId)
        .maybeSingle(),
      client
        .from("user_roles")
        .select("organization_id, cohort_id, valid_until, roles!inner(code, role_permissions(permissions!inner(code)))")
        .eq("user_id", userId)
        .is("revoked_at", null)
        .lte("valid_from", now),
      client
        .from("cohort_memberships")
        .select(
          "cohort_id, role, state, removed_at, cohorts!inner(organization_id, state)",
        )
        .eq("user_id", userId)
        .eq("state", "active")
        .is("removed_at", null),
      client
        .from("organization_memberships")
        .select(
          "organization_id, state, valid_until, removed_at, organizations!inner(state, archived_at)",
        )
        .eq("user_id", userId)
        .eq("state", "active")
        .is("removed_at", null),
    ]);

  if (
    profileResult.error ||
    roleResult.error ||
    cohortResult.error ||
    organizationResult.error ||
    !profileResult.data ||
    profileResult.data.state !== "active" ||
    profileResult.data.deactivated_at !== null ||
    !roleResult.data ||
    !cohortResult.data ||
    !organizationResult.data
  ) {
    throw new AuthenticationRequiredError();
  }

  const activeOrganizationIds = new Set(
    organizationResult.data
      .filter(
        (membership) =>
          membership.state === "active" &&
          membership.removed_at === null &&
          isUnexpired(membership.valid_until, nowTimestamp) &&
          membership.organizations.state === "active" &&
          membership.organizations.archived_at === null,
      )
      .map((membership) => membership.organization_id),
  );
  const activeCohortMemberships = cohortResult.data.filter(
    (membership) =>
      membership.state === "active" &&
      membership.removed_at === null &&
      accessibleCohortStates.has(membership.cohorts.state),
  );
  const retainedAssignments = roleResult.data.filter((assignment) => {
    const role = assignment.roles.code;
    if (
      !isAppRole(role) ||
      !isUnexpired(assignment.valid_until, nowTimestamp)
    ) {
      return false;
    }

    if (assignment.organization_id === null) {
      return assignment.cohort_id === null && platformGlobalRoles.has(role);
    }
    if (!activeOrganizationIds.has(assignment.organization_id)) {
      return false;
    }

    if (assignment.cohort_id === null) return true;

    return activeCohortMemberships.some(
      (membership) =>
        membership.cohorts.organization_id === assignment.organization_id &&
        membership.cohort_id === assignment.cohort_id &&
        (!isCohortRole(role) || membership.role === role),
    );
  });
  const retainedOrganizationIds = new Set(
    retainedAssignments.flatMap((assignment) =>
      assignment.organization_id === null ? [] : [assignment.organization_id],
    ),
  );

  if (retainedOrganizationIds.size > 1) {
    throw new AuthenticationRequiredError();
  }

  const roles = APP_ROLES.filter((role) =>
    retainedAssignments.some((assignment) => assignment.roles.code === role),
  );
  const primaryRole = roles[0];

  if (!primaryRole) {
    throw new AuthenticationRequiredError();
  }

  const permissions = retainedAssignments.flatMap((assignment) =>
    assignment.roles.role_permissions.map(
      (rolePermission) => rolePermission.permissions.code,
    ),
  );
  const organizationId =
    retainedOrganizationIds.values().next().value ?? null;
  const retainedCohortRoleScopes = retainedAssignments.flatMap((assignment) => {
    const role = assignment.roles.code;
    if (
      organizationId === null ||
      assignment.organization_id !== organizationId ||
      !isAppRole(role) ||
      !isCohortRole(role)
    ) {
      return [];
    }
    return [{ cohortId: assignment.cohort_id, role }];
  });
  const cohortIds = activeCohortMemberships
    .filter(
      (membership) =>
        membership.cohorts.organization_id === organizationId &&
        retainedCohortRoleScopes.some(
          (scope) =>
            scope.role === membership.role &&
            (scope.cohortId === null || scope.cohortId === membership.cohort_id),
        ),
    )
    .map((membership) => membership.cohort_id);

  return {
    userId,
    sessionId: userData.user.aud + ":" + userData.user.id,
    organizationId,
    primaryRole,
    roles,
    permissions: [...new Set(permissions)],
    cohortIds: [...new Set(cohortIds)].sort(),
  };
}
