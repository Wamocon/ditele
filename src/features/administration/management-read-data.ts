import "server-only";

import { hasPermission } from "@/shared/auth/authorization";
import { AuthorizationDeniedError } from "@/shared/auth/errors";
import type { Principal } from "@/shared/auth/types";
import { createServerClient } from "@/shared/database/server";
import type { Locale } from "@/shared/i18n/config";

import {
  adminGroupDatabaseRowsSchema,
  organizationMemberProfileProjectionRowsSchema,
  organizationMembershipDatabaseRowsSchema,
  permittedProfileDatabaseRowsSchema,
  projectAdminGroup,
  projectAdminOrganizationSettings,
  projectAdminUserDirectory,
  safeIntegrationDatabaseRowsSchema,
  scopedRoleDatabaseRowsSchema,
  type AdminGroupListItem,
  type AdminOrganizationSettings,
  type AdminUserDirectoryItem,
} from "./management-read-model";

export const ADMIN_GROUPS_PAGE_SIZE = 18;
export const ADMIN_USERS_PAGE_SIZE = 24;
export const ADMIN_SETTINGS_ITEM_LIMIT = 100;

function requireOrganizationPermission(
  principal: Principal,
  permission: "cohort.manage" | "organization.manage",
): string {
  if (!principal.organizationId || !hasPermission(principal, permission)) {
    throw new AuthorizationDeniedError(permission);
  }
  return principal.organizationId;
}

function requirePositivePage(page: number): void {
  if (!Number.isSafeInteger(page) || page < 1) {
    throw new Error("admin_management.invalid_page");
  }
}

export async function readAdminGroups(
  principal: Principal,
  locale: Locale,
  page: number,
): Promise<{
  readonly items: readonly AdminGroupListItem[];
  readonly page: number;
  readonly total: number;
  readonly totalPages: number;
}> {
  const organizationId = requireOrganizationPermission(principal, "cohort.manage");
  requirePositivePage(page);
  const client = await createServerClient();
  const offset = (page - 1) * ADMIN_GROUPS_PAGE_SIZE;
  const { count, data, error } = await client
    .from("cohorts")
    .select(
      `
        id,
        organization_id,
        name,
        state,
        progression_mode,
        starts_at,
        ends_at,
        capacity,
        updated_at,
        courses!inner(id, slug, course_localizations(locale, title)),
        cohort_memberships(role, state)
      `,
      { count: "exact" },
    )
    .eq("organization_id", organizationId)
    .order("updated_at", { ascending: false })
    .range(offset, offset + ADMIN_GROUPS_PAGE_SIZE - 1);
  if (error) throw new Error("admin_management.groups_read_failed", { cause: error });
  if (count === null) throw new Error("admin_management.groups_count_missing");
  const rows = adminGroupDatabaseRowsSchema.parse(data);
  return {
    items: rows.map((row) => projectAdminGroup(row, locale, organizationId)),
    page,
    total: count,
    totalPages: Math.max(1, Math.ceil(count / ADMIN_GROUPS_PAGE_SIZE)),
  };
}

export async function readAdminUsers(
  principal: Principal,
  page: number,
): Promise<{
  readonly items: readonly AdminUserDirectoryItem[];
  readonly page: number;
  readonly total: number;
  readonly totalPages: number;
}> {
  const organizationId = requireOrganizationPermission(principal, "organization.manage");
  requirePositivePage(page);
  const client = await createServerClient();
  const offset = (page - 1) * ADMIN_USERS_PAGE_SIZE;
  const { count, data, error } = await client
    .from("organization_memberships")
    .select(
      "id, organization_id, user_id, state, joined_at, valid_until, created_at",
      { count: "exact" },
    )
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false })
    .range(offset, offset + ADMIN_USERS_PAGE_SIZE - 1);
  if (error) throw new Error("admin_management.users_read_failed", { cause: error });
  if (count === null) throw new Error("admin_management.users_count_missing");
  const memberships = organizationMembershipDatabaseRowsSchema.parse(data);
  if (memberships.length === 0) {
    return { items: [], page, total: count, totalPages: Math.max(1, Math.ceil(count / ADMIN_USERS_PAGE_SIZE)) };
  }

  const userIds = memberships.map((membership) => membership.user_id);
  const now = new Date().toISOString();
  const [profileResult, roleResult] = await Promise.all([
    client.rpc("list_organization_member_profiles", {
      p_organization_id: organizationId,
    }),
    client
      .from("user_roles")
      .select("user_id, cohort_id, valid_from, valid_until, roles!inner(code)")
      .eq("organization_id", organizationId)
      .in("user_id", userIds)
      .is("revoked_at", null)
      .lte("valid_from", now)
      .or(`valid_until.is.null,valid_until.gt.${now}`),
  ]);
  if (profileResult.error || roleResult.error) {
    throw new Error("admin_management.user_context_read_failed", {
      cause: profileResult.error ?? roleResult.error,
    });
  }
  const pageUserIds = new Set(userIds);
  const profiles = permittedProfileDatabaseRowsSchema.parse(
    organizationMemberProfileProjectionRowsSchema
      .parse(profileResult.data)
      .filter((profile) => pageUserIds.has(profile.user_id))
      .map((profile) => ({
        user_id: profile.user_id,
        display_name: profile.display_name,
        locale: profile.locale,
        state: profile.profile_state,
      })),
  );
  const roles = scopedRoleDatabaseRowsSchema.parse(roleResult.data);
  return {
    items: projectAdminUserDirectory(memberships, profiles, roles, organizationId),
    page,
    total: count,
    totalPages: Math.max(1, Math.ceil(count / ADMIN_USERS_PAGE_SIZE)),
  };
}

export async function readAdminOrganizationSettings(
  principal: Principal,
  locale: Locale,
): Promise<{
  readonly settings: AdminOrganizationSettings;
  readonly canReadIntegrations: boolean;
  readonly entitlementTotal: number;
  readonly integrationTotal: number;
  readonly itemLimit: number;
}> {
  const organizationId = requireOrganizationPermission(principal, "organization.manage");
  const canReadIntegrations = hasPermission(principal, "integration.replay");
  const client = await createServerClient();
  const organizationPromise = client
    .from("organizations")
    .select("id, slug, name, state, data_residency_region, updated_at")
    .eq("id", organizationId)
    .maybeSingle();
  const entitlementPromise = client
    .from("entitlements")
    .select(
      "id, organization_id, user_id, capability, valid_from, valid_until, source, product_packages(code, labels, state)",
      { count: "exact" },
    )
    .eq("organization_id", organizationId)
    .order("valid_from", { ascending: false })
    .range(0, ADMIN_SETTINGS_ITEM_LIMIT - 1);
  const integrationPromise = canReadIntegrations
    ? client
      .from("integration_connections")
      .select(
        "id, organization_id, provider_kind, name, state, updated_at",
        { count: "exact" },
      )
      .eq("organization_id", organizationId)
      .order("updated_at", { ascending: false })
      .range(0, ADMIN_SETTINGS_ITEM_LIMIT - 1)
    : Promise.resolve({ data: [], error: null, count: 0 });

  const [organizationResult, entitlementResult, integrationResult] = await Promise.all([
    organizationPromise,
    entitlementPromise,
    integrationPromise,
  ]);
  if (organizationResult.error || !organizationResult.data) {
    throw new Error("admin_management.organization_read_failed", {
      cause: organizationResult.error ?? undefined,
    });
  }
  if (entitlementResult.error || entitlementResult.count === null) {
    throw new Error("admin_management.entitlements_read_failed", {
      cause: entitlementResult.error ?? undefined,
    });
  }
  if (integrationResult.error || integrationResult.count === null) {
    throw new Error("admin_management.integrations_read_failed", {
      cause: integrationResult.error ?? undefined,
    });
  }
  const integrations = safeIntegrationDatabaseRowsSchema.parse(integrationResult.data);
  return {
    settings: projectAdminOrganizationSettings(
      organizationResult.data,
      entitlementResult.data,
      integrations,
      locale,
      organizationId,
    ),
    canReadIntegrations,
    entitlementTotal: entitlementResult.count,
    integrationTotal: integrationResult.count,
    itemLimit: ADMIN_SETTINGS_ITEM_LIMIT,
  };
}
