import { z } from "zod";

import type { Locale } from "@/shared/i18n/config";

const localeSchema = z.enum(["en", "de", "ru"]);
const timestampSchema = z.string().min(1).refine(
  (value) => !Number.isNaN(Date.parse(value)),
  "Invalid database timestamp",
);
const localizationSchema = z.object({
  locale: localeSchema,
  title: z.string().trim().min(1),
});

export const adminGroupDatabaseRowSchema = z.object({
  id: z.string().uuid(),
  organization_id: z.string().uuid(),
  name: z.string().trim().min(1),
  state: z.enum(["waiting", "active", "completed", "cancelled"]),
  progression_mode: z.enum(["scheduled", "flexible"]),
  starts_at: timestampSchema.nullable(),
  ends_at: timestampSchema.nullable(),
  capacity: z.number().int().positive().nullable(),
  updated_at: timestampSchema,
  courses: z.object({
    id: z.string().uuid(),
    slug: z.string().min(1),
    course_localizations: z.array(localizationSchema),
  }),
  cohort_memberships: z.array(z.object({
    role: z.enum(["learner", "trainer"]),
    state: z.enum(["invited", "active", "suspended", "removed"]),
  })),
});

export const adminGroupDatabaseRowsSchema = z.array(adminGroupDatabaseRowSchema);

export type AdminGroupListItem = {
  readonly id: string;
  readonly name: string;
  readonly courseTitle: string;
  readonly courseResolvedLocale: Locale;
  readonly courseUsedFallback: boolean;
  readonly state: "waiting" | "active" | "completed" | "cancelled";
  readonly progressionMode: "scheduled" | "flexible";
  readonly startsAt: string | null;
  readonly endsAt: string | null;
  readonly capacity: number | null;
  readonly learnerCount: number;
  readonly trainerCount: number;
  readonly updatedAt: string;
};

function resolveTitle(
  localizations: readonly z.infer<typeof localizationSchema>[],
  locale: Locale,
  fallback: string,
) {
  const selected = localizations.find((entry) => entry.locale === locale)
    ?? localizations.find((entry) => entry.locale === "en")
    ?? localizations[0];
  return {
    title: selected?.title ?? fallback,
    resolvedLocale: selected?.locale ?? locale,
    usedFallback: selected ? selected.locale !== locale : true,
  };
}

export function projectAdminGroup(
  rowInput: unknown,
  locale: Locale,
  expectedOrganizationId: string,
): AdminGroupListItem {
  const row = adminGroupDatabaseRowSchema.parse(rowInput);
  if (row.organization_id !== expectedOrganizationId) {
    throw new Error("admin_management.group_outside_organization");
  }
  const course = resolveTitle(
    row.courses.course_localizations,
    locale,
    row.courses.slug,
  );
  const activeMemberships = row.cohort_memberships.filter(
    (membership) => membership.state === "active",
  );
  return {
    id: row.id,
    name: row.name,
    courseTitle: course.title,
    courseResolvedLocale: course.resolvedLocale,
    courseUsedFallback: course.usedFallback,
    state: row.state,
    progressionMode: row.progression_mode,
    startsAt: row.starts_at ? new Date(row.starts_at).toISOString() : null,
    endsAt: row.ends_at ? new Date(row.ends_at).toISOString() : null,
    capacity: row.capacity,
    learnerCount: activeMemberships.filter((membership) => membership.role === "learner").length,
    trainerCount: activeMemberships.filter((membership) => membership.role === "trainer").length,
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

export const organizationMembershipDatabaseRowSchema = z.object({
  id: z.string().uuid(),
  organization_id: z.string().uuid(),
  user_id: z.string().uuid(),
  state: z.enum(["invited", "active", "suspended", "removed"]),
  joined_at: timestampSchema.nullable(),
  valid_until: timestampSchema.nullable(),
  created_at: timestampSchema,
});

export const organizationMembershipDatabaseRowsSchema = z.array(
  organizationMembershipDatabaseRowSchema,
);

export const permittedProfileDatabaseRowSchema = z.object({
  user_id: z.string().uuid(),
  display_name: z.string().max(160),
  locale: localeSchema,
  state: z.enum(["draft", "active", "inactive", "archived"]),
});

export const permittedProfileDatabaseRowsSchema = z.array(
  permittedProfileDatabaseRowSchema,
);

export const organizationMemberProfileProjectionRowsSchema = z.array(
  z.object({
    user_id: z.string().uuid(),
    display_name: z.string().max(160),
    locale: localeSchema,
    timezone: z.string().min(1),
    profile_state: z.enum(["draft", "active", "inactive", "archived"]),
    membership_state: z.enum(["invited", "active", "suspended"]),
  }),
);

export const scopedRoleDatabaseRowSchema = z.object({
  user_id: z.string().uuid(),
  cohort_id: z.string().uuid().nullable(),
  valid_from: timestampSchema,
  valid_until: timestampSchema.nullable(),
  roles: z.object({
    code: z.string().regex(/^[a-z][a-z0-9_]*$/),
  }),
});

export const scopedRoleDatabaseRowsSchema = z.array(scopedRoleDatabaseRowSchema);

export type AdminUserDirectoryItem = {
  readonly membershipId: string;
  readonly userId: string;
  readonly displayName: string | null;
  readonly profileVisible: boolean;
  readonly profileLocale: Locale | null;
  readonly profileState: "draft" | "active" | "inactive" | "archived" | null;
  readonly membershipState: "invited" | "active" | "suspended" | "removed";
  readonly joinedAt: string | null;
  readonly validUntil: string | null;
  readonly createdAt: string;
  readonly roles: readonly {
    readonly code: string;
    readonly cohortScoped: boolean;
  }[];
};

export function projectAdminUserDirectory(
  membershipInputs: unknown,
  profileInputs: unknown,
  roleInputs: unknown,
  expectedOrganizationId: string,
): readonly AdminUserDirectoryItem[] {
  const memberships = organizationMembershipDatabaseRowsSchema.parse(membershipInputs);
  const profiles = permittedProfileDatabaseRowsSchema.parse(profileInputs);
  const roles = scopedRoleDatabaseRowsSchema.parse(roleInputs);
  const profilesByUser = new Map(profiles.map((profile) => [profile.user_id, profile]));
  const rolesByUser = new Map<string, { code: string; cohortScoped: boolean }[]>();
  for (const assignment of roles) {
    const values = rolesByUser.get(assignment.user_id) ?? [];
    if (!values.some((value) => value.code === assignment.roles.code && value.cohortScoped === (assignment.cohort_id !== null))) {
      values.push({ code: assignment.roles.code, cohortScoped: assignment.cohort_id !== null });
      rolesByUser.set(assignment.user_id, values);
    }
  }

  return memberships.map((membership) => {
    if (membership.organization_id !== expectedOrganizationId) {
      throw new Error("admin_management.member_outside_organization");
    }
    const profile = profilesByUser.get(membership.user_id);
    const normalizedDisplayName = profile?.display_name.trim() ?? "";
    return {
      membershipId: membership.id,
      userId: membership.user_id,
      displayName: normalizedDisplayName.length > 0 ? normalizedDisplayName : null,
      profileVisible: profile !== undefined,
      profileLocale: profile?.locale ?? null,
      profileState: profile?.state ?? null,
      membershipState: membership.state,
      joinedAt: membership.joined_at ? new Date(membership.joined_at).toISOString() : null,
      validUntil: membership.valid_until ? new Date(membership.valid_until).toISOString() : null,
      createdAt: new Date(membership.created_at).toISOString(),
      roles: rolesByUser.get(membership.user_id) ?? [],
    };
  });
}

export const organizationSettingsDatabaseRowSchema = z.object({
  id: z.string().uuid(),
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  name: z.string().trim().min(1),
  state: z.enum(["active", "suspended", "archived"]),
  data_residency_region: z.string().trim().min(1).nullable(),
  updated_at: timestampSchema,
});

const packageLabelsSchema = z.record(z.string(), z.string());

export const entitlementDatabaseRowSchema = z.object({
  id: z.string().uuid(),
  organization_id: z.string().uuid(),
  user_id: z.string().uuid().nullable(),
  capability: z.string().trim().min(1),
  valid_from: timestampSchema,
  valid_until: timestampSchema.nullable(),
  source: z.enum(["manual", "contract", "promotion", "migration"]),
  product_packages: z.object({
    code: z.string().trim().min(1),
    labels: packageLabelsSchema,
    state: z.enum(["draft", "active", "inactive", "archived"]),
  }).nullable(),
});

export const entitlementDatabaseRowsSchema = z.array(entitlementDatabaseRowSchema);

export const safeIntegrationDatabaseRowSchema = z.object({
  id: z.string().uuid(),
  organization_id: z.string().uuid(),
  provider_kind: z.enum(["eloomi", "lti", "xapi", "cmi5", "webhook", "oidc"]),
  name: z.string().trim().min(1),
  state: z.enum(["draft", "active", "inactive", "archived"]),
  updated_at: timestampSchema,
});

export const safeIntegrationDatabaseRowsSchema = z.array(safeIntegrationDatabaseRowSchema);

export type AdminOrganizationSettings = {
  readonly organization: {
    readonly id: string;
    readonly slug: string;
    readonly name: string;
    readonly state: "active" | "suspended" | "archived";
    readonly dataResidencyRegion: string | null;
    readonly updatedAt: string;
  };
  readonly entitlements: readonly {
    readonly id: string;
    readonly capability: string;
    readonly packageCode: string | null;
    readonly packageLabel: string | null;
    readonly packageState: "draft" | "active" | "inactive" | "archived" | null;
    readonly scope: "organization" | "user";
    readonly validFrom: string;
    readonly validUntil: string | null;
    readonly source: "manual" | "contract" | "promotion" | "migration";
  }[];
  readonly integrations: readonly {
    readonly id: string;
    readonly provider: "eloomi" | "lti" | "xapi" | "cmi5" | "webhook" | "oidc";
    readonly name: string;
    readonly state: "draft" | "active" | "inactive" | "archived";
    readonly updatedAt: string;
  }[];
};

function packageLabel(
  labels: Readonly<Record<string, string>>,
  locale: Locale,
): string | null {
  return labels[locale]?.trim() || labels.en?.trim() || Object.values(labels).find((value) => value.trim())?.trim() || null;
}

export function projectAdminOrganizationSettings(
  organizationInput: unknown,
  entitlementInputs: unknown,
  integrationInputs: unknown,
  locale: Locale,
  expectedOrganizationId: string,
): AdminOrganizationSettings {
  const organization = organizationSettingsDatabaseRowSchema.parse(organizationInput);
  const entitlements = entitlementDatabaseRowsSchema.parse(entitlementInputs);
  const integrations = safeIntegrationDatabaseRowsSchema.parse(integrationInputs);
  if (organization.id !== expectedOrganizationId) {
    throw new Error("admin_management.organization_outside_scope");
  }
  if (entitlements.some((row) => row.organization_id !== expectedOrganizationId)) {
    throw new Error("admin_management.entitlement_outside_organization");
  }
  if (integrations.some((row) => row.organization_id !== expectedOrganizationId)) {
    throw new Error("admin_management.integration_outside_organization");
  }
  return {
    organization: {
      id: organization.id,
      slug: organization.slug,
      name: organization.name,
      state: organization.state,
      dataResidencyRegion: organization.data_residency_region,
      updatedAt: new Date(organization.updated_at).toISOString(),
    },
    entitlements: entitlements.map((row) => ({
      id: row.id,
      capability: row.capability,
      packageCode: row.product_packages?.code ?? null,
      packageLabel: row.product_packages ? packageLabel(row.product_packages.labels, locale) : null,
      packageState: row.product_packages?.state ?? null,
      scope: row.user_id === null ? "organization" : "user",
      validFrom: new Date(row.valid_from).toISOString(),
      validUntil: row.valid_until ? new Date(row.valid_until).toISOString() : null,
      source: row.source,
    })),
    integrations: integrations.map((row) => ({
      id: row.id,
      provider: row.provider_kind,
      name: row.name,
      state: row.state,
      updatedAt: new Date(row.updated_at).toISOString(),
    })),
  };
}
