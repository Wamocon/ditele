import { describe, expect, it } from "vitest";

import {
  projectAdminGroup,
  projectAdminOrganizationSettings,
  projectAdminUserDirectory,
} from "./management-read-model";

const organizationId = "01980a10-0000-7000-8000-000000000001";

describe("administration management read projections", () => {
  it("projects localized cohort lifecycle and only active membership counts", () => {
    const group = projectAdminGroup({
      id: "01980a30-0000-7000-8000-000000000001",
      organization_id: organizationId,
      name: "Release group",
      state: "active",
      progression_mode: "scheduled",
      starts_at: "2026-07-18T08:00:00Z",
      ends_at: null,
      capacity: 25,
      updated_at: "2026-07-18T10:00:00Z",
      courses: {
        id: "01980a20-0000-7000-8000-000000000001",
        slug: "practical-testing",
        course_localizations: [{ locale: "en", title: "Practical testing" }],
      },
      cohort_memberships: [
        { role: "learner", state: "active" },
        { role: "learner", state: "suspended" },
        { role: "trainer", state: "active" },
      ],
    }, "de", organizationId);

    expect(group).toMatchObject({
      courseTitle: "Practical testing",
      courseResolvedLocale: "en",
      courseUsedFallback: true,
      learnerCount: 1,
      trainerCount: 1,
      startsAt: "2026-07-18T08:00:00.000Z",
    });
  });

  it("rejects a cohort returned outside the explicit organization scope", () => {
    expect(() => projectAdminGroup({
      id: "01980a30-0000-7000-8000-000000000001",
      organization_id: "01980a10-0000-7000-8000-000000000002",
      name: "Wrong tenant",
      state: "waiting",
      progression_mode: "flexible",
      starts_at: null,
      ends_at: null,
      capacity: null,
      updated_at: "2026-07-18T10:00:00Z",
      courses: {
        id: "01980a20-0000-7000-8000-000000000001",
        slug: "course",
        course_localizations: [],
      },
      cohort_memberships: [],
    }, "en", organizationId)).toThrow("group_outside_organization");
  });

  it("keeps profiles absent from the scoped projection unavailable instead of using identifiers as names", () => {
    const members = projectAdminUserDirectory([
      {
        id: "01980a11-0000-7000-8000-000000000001",
        organization_id: organizationId,
        user_id: "01980a00-0000-7000-8000-000000000001",
        state: "active",
        joined_at: "2026-07-18T08:00:00Z",
        valid_until: null,
        created_at: "2026-07-17T08:00:00Z",
      },
      {
        id: "01980a11-0000-7000-8000-000000000002",
        organization_id: organizationId,
        user_id: "01980a00-0000-7000-8000-000000000002",
        state: "active",
        joined_at: null,
        valid_until: null,
        created_at: "2026-07-17T09:00:00Z",
      },
    ], [
      {
        user_id: "01980a00-0000-7000-8000-000000000001",
        display_name: "Lena Learner",
        locale: "de",
        state: "active",
      },
    ], [
      {
        user_id: "01980a00-0000-7000-8000-000000000001",
        cohort_id: null,
        valid_from: "2026-07-17T08:00:00Z",
        valid_until: null,
        roles: { code: "learner" },
      },
    ], organizationId);

    expect(members[0]).toMatchObject({
      displayName: "Lena Learner",
      profileVisible: true,
      roles: [{ code: "learner", cohortScoped: false }],
    });
    expect(members[1]).toMatchObject({
      displayName: null,
      profileVisible: false,
      profileLocale: null,
    });
    expect(members[1]?.displayName).not.toBe(members[1]?.userId);
  });

  it("projects only safe organization, entitlement, and integration metadata", () => {
    const settings = projectAdminOrganizationSettings({
      id: organizationId,
      slug: "ditele-academy",
      name: "DiTeLe Academy",
      state: "active",
      data_residency_region: "eu-central",
      updated_at: "2026-07-18T10:00:00Z",
    }, [{
      id: "01980a41-0000-7000-8000-000000000001",
      organization_id: organizationId,
      user_id: null,
      capability: "learning",
      valid_from: "2026-07-18T08:00:00Z",
      valid_until: null,
      source: "contract",
      product_packages: {
        code: "academy-core",
        labels: { en: "Academy Core", de: "Academy Basis" },
        state: "active",
      },
    }], [{
      id: "01980a50-0000-7000-8000-000000000001",
      organization_id: organizationId,
      provider_kind: "oidc",
      name: "Workforce identity",
      state: "draft",
      updated_at: "2026-07-18T09:00:00Z",
    }], "de", organizationId);

    expect(settings).toMatchObject({
      organization: { name: "DiTeLe Academy" },
      entitlements: [{ packageLabel: "Academy Basis", scope: "organization" }],
      integrations: [{ provider: "oidc", name: "Workforce identity" }],
    });
    expect(JSON.stringify(settings)).not.toContain("secret_reference");
    expect(JSON.stringify(settings)).not.toContain("configuration_redacted");
  });

  it("rejects entitlement data crossing the tenant boundary", () => {
    expect(() => projectAdminOrganizationSettings({
      id: organizationId,
      slug: "ditele-academy",
      name: "DiTeLe Academy",
      state: "active",
      data_residency_region: null,
      updated_at: "2026-07-18T10:00:00Z",
    }, [{
      id: "01980a41-0000-7000-8000-000000000001",
      organization_id: "01980a10-0000-7000-8000-000000000002",
      user_id: null,
      capability: "learning",
      valid_from: "2026-07-18T08:00:00Z",
      valid_until: null,
      source: "manual",
      product_packages: null,
    }], [], "en", organizationId)).toThrow("entitlement_outside_organization");
  });
});
