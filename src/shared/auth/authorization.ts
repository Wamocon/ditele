import { AuthorizationDeniedError } from "./errors";
import type { AppRole, Principal } from "./types";

export function hasPermission(
  principal: Principal,
  permission: string,
): boolean {
  return principal.permissions.includes(permission);
}

export function requirePermission(
  principal: Principal,
  permission: string,
): void {
  if (!hasPermission(principal, permission)) {
    throw new AuthorizationDeniedError(permission);
  }
}

export function hasRole(principal: Principal, role: AppRole): boolean {
  return principal.roles.includes(role);
}

export function canAccessCohort(
  principal: Principal,
  cohortId: string,
): boolean {
  return (
    principal.cohortIds.includes(cohortId) ||
    hasPermission(principal, "cohort.manage")
  );
}

