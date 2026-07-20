import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/shared/database/server", () => ({ createServerClient: vi.fn() }));

import { AuthenticationRequiredError } from "@/shared/auth/errors";
import { requirePrincipal } from "@/shared/auth/principal";
import { createServerClient } from "@/shared/database/server";

type QueryResult = { data: unknown; error: unknown };

type Profile = {
  state: "draft" | "active" | "inactive" | "archived";
  deactivated_at: string | null;
};

type RoleAssignment = {
  organization_id: string | null;
  cohort_id: string | null;
  valid_until: string | null;
  roles: {
    code: string;
    role_permissions: Array<{ permissions: { code: string } }>;
  };
};

type CohortMembership = {
  cohort_id: string;
  role: "learner" | "trainer";
  state: "invited" | "active" | "suspended" | "removed";
  removed_at: string | null;
  cohorts: {
    organization_id: string;
    state: "waiting" | "active" | "completed" | "cancelled";
  };
};

type OrganizationMembership = {
  organization_id: string;
  state: "invited" | "active" | "suspended" | "removed";
  valid_until: string | null;
  removed_at: string | null;
  organizations: {
    state: "active" | "suspended" | "archived";
    archived_at: string | null;
  };
};

function queryBuilder(result: QueryResult) {
  const builder = {
    select: vi.fn(),
    eq: vi.fn(),
    is: vi.fn(),
    lte: vi.fn(),
    maybeSingle: vi.fn(),
    then: vi.fn(),
  };
  builder.select.mockReturnValue(builder);
  builder.eq.mockReturnValue(builder);
  builder.is.mockReturnValue(builder);
  builder.lte.mockResolvedValue(result);
  builder.maybeSingle.mockResolvedValue(result);
  builder.then.mockImplementation((resolve, reject) =>
    Promise.resolve(result).then(resolve, reject),
  );
  return builder;
}

function clientFixture({
  user = { id: "user-1", aud: "authenticated" },
  userError = null,
  profile = { state: "active", deactivated_at: null },
  profileError = null,
  roles = [],
  roleError = null,
  cohorts = [],
  cohortError = null,
  organizations = [],
  organizationError = null,
}: {
  user?: { id: string; aud: string } | null;
  userError?: unknown;
  profile?: Profile | null;
  profileError?: unknown;
  roles?: RoleAssignment[];
  roleError?: unknown;
  cohorts?: CohortMembership[];
  cohortError?: unknown;
  organizations?: OrganizationMembership[];
  organizationError?: unknown;
} = {}) {
  const builders = {
    profiles: queryBuilder({ data: profile, error: profileError }),
    user_roles: queryBuilder({ data: roles, error: roleError }),
    cohort_memberships: queryBuilder({ data: cohorts, error: cohortError }),
    organization_memberships: queryBuilder({
      data: organizations,
      error: organizationError,
    }),
  };
  return {
    auth: { getUser: vi.fn(async () => ({ data: { user }, error: userError })) },
    from: vi.fn((table: keyof typeof builders) => builders[table]),
    builders,
  };
}

function cohortMembership(
  cohortId: string,
  options: {
    organizationId?: string;
    role?: CohortMembership["role"];
    state?: CohortMembership["state"];
    removedAt?: string | null;
    cohortState?: CohortMembership["cohorts"]["state"];
  } = {},
): CohortMembership {
  return {
    cohort_id: cohortId,
    role: options.role ?? "learner",
    state: options.state ?? "active",
    removed_at: options.removedAt ?? null,
    cohorts: {
      organization_id: options.organizationId ?? "org-1",
      state: options.cohortState ?? "active",
    },
  };
}

function organizationMembership(
  organizationId: string,
  options: {
    state?: OrganizationMembership["state"];
    validUntil?: string | null;
    removedAt?: string | null;
    organizationState?: OrganizationMembership["organizations"]["state"];
    archivedAt?: string | null;
  } = {},
): OrganizationMembership {
  return {
    organization_id: organizationId,
    state: options.state ?? "active",
    valid_until: options.validUntil ?? null,
    removed_at: options.removedAt ?? null,
    organizations: {
      state: options.organizationState ?? "active",
      archived_at: options.archivedAt ?? null,
    },
  };
}

function assignment(
  code: string,
  permissions: string[],
  options: {
    organizationId?: string | null;
    cohortId?: string | null;
    validUntil?: string | null;
  } = {},
): RoleAssignment {
  return {
    organization_id: options.organizationId ?? null,
    cohort_id: options.cohortId ?? null,
    valid_until: options.validUntil ?? null,
    roles: {
      code,
      role_permissions: permissions.map((permission) => ({
        permissions: { code: permission },
      })),
    },
  };
}

describe("requirePrincipal", () => {
  beforeEach(() => {
    vi.mocked(createServerClient).mockReset();
  });

  it("rejects provider errors and absent users before authorization reads", async () => {
    const providerFailure = clientFixture({
      userError: new Error("session expired"),
    });
    vi.mocked(createServerClient).mockResolvedValue(providerFailure as never);
    await expect(requirePrincipal()).rejects.toBeInstanceOf(
      AuthenticationRequiredError,
    );
    expect(providerFailure.from).not.toHaveBeenCalled();

    const noUser = clientFixture({ user: null });
    vi.mocked(createServerClient).mockResolvedValue(noUser as never);
    await expect(requirePrincipal()).rejects.toBeInstanceOf(
      AuthenticationRequiredError,
    );
    expect(noUser.from).not.toHaveBeenCalled();
  });

  it.each([
    ["profile", { profileError: new Error("profile unavailable") }],
    ["roles", { roleError: new Error("roles unavailable") }],
    ["cohorts", { cohortError: new Error("cohorts unavailable") }],
    ["organization", { organizationError: new Error("membership unavailable") }],
  ])("fails closed when the %s authorization query fails", async (_name, errors) => {
    const client = clientFixture({
      roles: [assignment("support", ["support.read"])],
      ...errors,
    });
    vi.mocked(createServerClient).mockResolvedValue(client as never);
    await expect(requirePrincipal()).rejects.toBeInstanceOf(
      AuthenticationRequiredError,
    );
  });

  it.each([
    ["missing", null],
    ["inactive", { state: "inactive", deactivated_at: null }],
    [
      "deactivated",
      { state: "active", deactivated_at: "2026-01-01T00:00:00.000Z" },
    ],
  ] as const)("rejects a %s profile", async (_name, profile) => {
    const client = clientFixture({
      profile,
      roles: [assignment("support", ["support.read"])],
    });
    vi.mocked(createServerClient).mockResolvedValue(client as never);

    await expect(requirePrincipal()).rejects.toBeInstanceOf(
      AuthenticationRequiredError,
    );
  });

  it("deduplicates retained roles, permissions, and same-tenant cohort memberships", async () => {
    const client = clientFixture({
      roles: [
        assignment("learner", ["task.read", "task.read"], {
          organizationId: "org-1",
        }),
        assignment("learner", ["question.create"], {
          organizationId: "org-1",
        }),
        assignment("trainer", ["submission.review"], {
          organizationId: "org-1",
          validUntil: "2000-01-01T00:00:00.000Z",
        }),
        assignment("legacy_superuser", ["dangerous.permission"], {
          validUntil: "2999-01-01T00:00:00.000Z",
        }),
      ],
      cohorts: [
        cohortMembership("cohort-1"),
        cohortMembership("cohort-1"),
        cohortMembership("cohort-2"),
        cohortMembership("cohort-removed", {
          removedAt: "2026-01-01T00:00:00.000Z",
        }),
        cohortMembership("cohort-other", { organizationId: "org-2" }),
      ],
      organizations: [
        organizationMembership("org-1"),
        organizationMembership("org-2"),
      ],
    });
    vi.mocked(createServerClient).mockResolvedValue(client as never);

    await expect(requirePrincipal()).resolves.toEqual({
      userId: "user-1",
      sessionId: "authenticated:user-1",
      organizationId: "org-1",
      primaryRole: "learner",
      roles: ["learner"],
      permissions: ["task.read", "question.create"],
      cohortIds: ["cohort-1", "cohort-2"],
    });
    expect(client.from).toHaveBeenCalledWith("profiles");
    expect(client.from).toHaveBeenCalledWith("user_roles");
    expect(client.from).toHaveBeenCalledWith("cohort_memberships");
    expect(client.from).toHaveBeenCalledWith("organization_memberships");
    expect(client.builders.cohort_memberships.select).toHaveBeenCalledWith(
      expect.stringContaining("cohorts!inner(organization_id, state)"),
    );
    expect(client.builders.organization_memberships.select).toHaveBeenCalledWith(
      expect.stringContaining("organizations!inner(state, archived_at)"),
    );
  });

  it.each([
    ["learner", ["catalog.read", "enrollment.request"]],
    ["trainer", ["cohort.read"]],
  ] as const)(
    "retains an organization-scoped %s before any cohort assignment",
    async (role, permissions) => {
      const client = clientFixture({
        roles: [
          assignment(role, [...permissions], {
            organizationId: "org-1",
            cohortId: null,
          }),
        ],
        cohorts: [],
        organizations: [organizationMembership("org-1")],
      });
      vi.mocked(createServerClient).mockResolvedValue(client as never);

      await expect(requirePrincipal()).resolves.toMatchObject({
        organizationId: "org-1",
        primaryRole: role,
        roles: [role],
        permissions: [...permissions],
        cohortIds: [],
      });
    },
  );

  it("requires active memberships in an active, unarchived organization", async () => {
    const client = clientFixture({
      roles: [
        assignment("organization_admin", ["organization.manage"], {
          organizationId: "org-active",
        }),
        assignment("content_admin", ["content.expired"], {
          organizationId: "org-expired",
        }),
        assignment("admin", ["admin.removed"], {
          organizationId: "org-removed",
        }),
        assignment("integration_admin", ["integration.suspended"], {
          organizationId: "org-suspended",
        }),
        assignment("dpo", ["privacy.archived"], {
          organizationId: "org-archived",
        }),
        assignment("support", ["support.read"]),
      ],
      organizations: [
        organizationMembership("org-active"),
        organizationMembership("org-expired", {
          validUntil: "2000-01-01T00:00:00.000Z",
        }),
        organizationMembership("org-removed", {
          removedAt: "2026-01-01T00:00:00.000Z",
        }),
        organizationMembership("org-suspended", {
          organizationState: "suspended",
        }),
        organizationMembership("org-archived", {
          organizationState: "active",
          archivedAt: "2026-01-01T00:00:00.000Z",
        }),
      ],
    });
    vi.mocked(createServerClient).mockResolvedValue(client as never);

    await expect(requirePrincipal()).resolves.toMatchObject({
      organizationId: "org-active",
      primaryRole: "organization_admin",
      roles: ["organization_admin", "support"],
      permissions: ["organization.manage", "support.read"],
      cohortIds: [],
    });
  });

  it.each([
    ["suspended", { organizationState: "suspended" }],
    ["archived", { archivedAt: "2026-01-01T00:00:00.000Z" }],
  ] as const)("rejects a principal scoped only to an %s organization", async (_name, options) => {
    const client = clientFixture({
      roles: [
        assignment("organization_admin", ["organization.manage"], {
          organizationId: "org-1",
        }),
      ],
      organizations: [organizationMembership("org-1", options)],
    });
    vi.mocked(createServerClient).mockResolvedValue(client as never);

    await expect(requirePrincipal()).rejects.toBeInstanceOf(
      AuthenticationRequiredError,
    );
  });

  it("rejects a cross-organization cohort assignment", async () => {
    const client = clientFixture({
      roles: [
        assignment("learner", ["task.read"], {
          organizationId: "org-1",
          cohortId: "cohort-cross-tenant",
        }),
      ],
      cohorts: [
        cohortMembership("cohort-cross-tenant", {
          organizationId: "org-2",
          role: "learner",
        }),
      ],
      organizations: [
        organizationMembership("org-1"),
        organizationMembership("org-2"),
      ],
    });
    vi.mocked(createServerClient).mockResolvedValue(client as never);

    await expect(requirePrincipal()).rejects.toBeInstanceOf(
      AuthenticationRequiredError,
    );
  });

  it.each([
    ["learner", "trainer"],
    ["trainer", "learner"],
  ] as const)(
    "rejects %s scope backed by a %s membership",
    async (assignmentRole, membershipRole) => {
      const client = clientFixture({
        roles: [
          assignment(assignmentRole, [`${assignmentRole}.permission`], {
            organizationId: "org-1",
            cohortId: "cohort-1",
          }),
        ],
        cohorts: [
          cohortMembership("cohort-1", { role: membershipRole }),
        ],
        organizations: [organizationMembership("org-1")],
      });
      vi.mocked(createServerClient).mockResolvedValue(client as never);

      await expect(requirePrincipal()).rejects.toBeInstanceOf(
        AuthenticationRequiredError,
      );
    },
  );

  it("omits active cohort memberships from unrelated tenants and roles", async () => {
    const client = clientFixture({
      roles: [
        assignment("learner", ["task.read"], { organizationId: "org-1" }),
      ],
      cohorts: [
        cohortMembership("cohort-learner", {
          organizationId: "org-1",
          role: "learner",
        }),
        cohortMembership("cohort-trainer", {
          organizationId: "org-1",
          role: "trainer",
        }),
        cohortMembership("cohort-other-tenant", {
          organizationId: "org-2",
          role: "learner",
        }),
      ],
      organizations: [
        organizationMembership("org-1"),
        organizationMembership("org-2"),
      ],
    });
    vi.mocked(createServerClient).mockResolvedValue(client as never);

    await expect(requirePrincipal()).resolves.toMatchObject({
      organizationId: "org-1",
      roles: ["learner"],
      cohortIds: ["cohort-learner"],
    });
  });

  it("does not expand a cohort-specific assignment to sibling cohorts", async () => {
    const client = clientFixture({
      roles: [
        assignment("learner", ["task.read"], {
          organizationId: "org-1",
          cohortId: "cohort-1",
        }),
      ],
      cohorts: [
        cohortMembership("cohort-1"),
        cohortMembership("cohort-2"),
      ],
      organizations: [organizationMembership("org-1")],
    });
    vi.mocked(createServerClient).mockResolvedValue(client as never);

    await expect(requirePrincipal()).resolves.toMatchObject({
      cohortIds: ["cohort-1"],
    });
  });

  it.each(["learner", "trainer", "organization_admin"])(
    "rejects the globally scoped %s role",
    async (role) => {
      const client = clientFixture({
        roles: [assignment(role, [`${role}.permission`])],
        cohorts: [
          cohortMembership("cohort-learner", { role: "learner" }),
          cohortMembership("cohort-trainer", { role: "trainer" }),
        ],
        organizations: [organizationMembership("org-1")],
      });
      vi.mocked(createServerClient).mockResolvedValue(client as never);

      await expect(requirePrincipal()).rejects.toBeInstanceOf(
        AuthenticationRequiredError,
      );
    },
  );

  it("retains only explicit platform roles globally without inheriting tenant context", async () => {
    const client = clientFixture({
      roles: [
        assignment("support", ["support.read"]),
        assignment("admin", ["admin.read"]),
      ],
      cohorts: [cohortMembership("cohort-1")],
      organizations: [organizationMembership("org-1")],
    });
    vi.mocked(createServerClient).mockResolvedValue(client as never);

    await expect(requirePrincipal()).resolves.toMatchObject({
      organizationId: null,
      primaryRole: "admin",
      roles: ["admin", "support"],
      permissions: ["support.read", "admin.read"],
      cohortIds: [],
    });
  });

  it("orders retained roles by the canonical application role order", async () => {
    const client = clientFixture({
      roles: [
        assignment("admin", ["admin.read"]),
        assignment("trainer", ["submission.review"], {
          organizationId: "org-1",
        }),
        assignment("learner", ["task.read"], { organizationId: "org-1" }),
      ],
      cohorts: [
        cohortMembership("cohort-trainer", { role: "trainer" }),
        cohortMembership("cohort-learner", { role: "learner" }),
      ],
      organizations: [organizationMembership("org-1")],
    });
    vi.mocked(createServerClient).mockResolvedValue(client as never);

    await expect(requirePrincipal()).resolves.toMatchObject({
      organizationId: "org-1",
      primaryRole: "learner",
      roles: ["learner", "trainer", "admin"],
      cohortIds: ["cohort-learner", "cohort-trainer"],
    });
  });

  it("fails closed when retained tenant assignments span multiple organizations", async () => {
    const client = clientFixture({
      roles: [
        assignment("trainer", ["submission.review"], {
          organizationId: "org-1",
        }),
        assignment("organization_admin", ["organization.manage"], {
          organizationId: "org-2",
        }),
      ],
      cohorts: [
        cohortMembership("cohort-trainer", {
          organizationId: "org-1",
          role: "trainer",
        }),
      ],
      organizations: [
        organizationMembership("org-1"),
        organizationMembership("org-2"),
      ],
    });
    vi.mocked(createServerClient).mockResolvedValue(client as never);

    await expect(requirePrincipal()).rejects.toBeInstanceOf(
      AuthenticationRequiredError,
    );
  });

  it("rejects sessions with no recognized retained application role", async () => {
    const client = clientFixture({
      roles: [assignment("legacy_superuser", ["dangerous.permission"])],
    });
    vi.mocked(createServerClient).mockResolvedValue(client as never);

    await expect(requirePrincipal()).rejects.toBeInstanceOf(
      AuthenticationRequiredError,
    );
  });
});
