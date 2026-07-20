import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/shared/database/server", () => ({ createServerClient: vi.fn() }));

import type { Principal } from "@/shared/auth/types";
import { createServerClient } from "@/shared/database/server";

import { readAdminMemberDetail } from "./admin-member-detail-data";

const organizationId = "01980a10-0000-7000-8000-000000000001";
const otherOrganizationId = "01980a10-0000-7000-8000-000000000002";
const userId = "01980a00-0000-7000-8000-000000000001";
const cohortId = "01980a30-0000-7000-8000-000000000001";
const courseId = "01980a20-0000-7000-8000-000000000001";

const admin: Principal = {
  userId: "01980a00-0000-7000-8000-000000000004",
  sessionId: "admin-session",
  organizationId,
  primaryRole: "admin",
  roles: ["admin"],
  permissions: ["organization.manage", "cohort.manage"],
  cohortIds: [],
};

type QueryResult = {
  readonly data: unknown;
  readonly error: unknown;
};

function result(data: unknown, error: unknown = null): QueryResult {
  return { data, error };
}

function queryBuilder(queryResult: QueryResult) {
  const builder = {
    select: vi.fn(),
    eq: vi.fn(),
    in: vi.fn(),
    is: vi.fn(),
    limit: vi.fn(),
    lte: vi.fn(),
    maybeSingle: vi.fn(async () => queryResult),
    or: vi.fn(),
    order: vi.fn(),
    then: <TResult1 = QueryResult, TResult2 = never>(
      onFulfilled?: ((value: QueryResult) => TResult1 | PromiseLike<TResult1>) | null,
      onRejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
    ) => Promise.resolve(queryResult).then(onFulfilled, onRejected),
  };
  builder.select.mockReturnValue(builder);
  builder.eq.mockReturnValue(builder);
  builder.in.mockReturnValue(builder);
  builder.is.mockReturnValue(builder);
  builder.limit.mockReturnValue(builder);
  builder.lte.mockReturnValue(builder);
  builder.or.mockReturnValue(builder);
  builder.order.mockReturnValue(builder);
  return builder;
}

function clientWithQueues(
  queues: Readonly<Record<string, readonly QueryResult[]>>,
) {
  const remaining = new Map(
    Object.entries(queues).map(([table, values]) => [table, [...values]]),
  );
  const builders = new Map<string, ReturnType<typeof queryBuilder>[]>();
  return {
    builders,
    from: vi.fn((table: string) => {
      const queue = remaining.get(table);
      const next = queue?.shift();
      if (!next) throw new Error(`Unexpected ${table} query`);
      const builder = queryBuilder(next);
      builders.set(table, [...(builders.get(table) ?? []), builder]);
      return builder;
    }),
    rpc: vi.fn(),
  };
}

const membership = {
  id: "01980a11-0000-7000-8000-000000000001",
  organization_id: organizationId,
  user_id: userId,
  state: "active",
  joined_at: "2026-07-17T08:00:00.000Z",
  valid_until: null,
  created_at: "2026-07-16T08:00:00.000Z",
};
const profile = {
  user_id: userId,
  display_name: "Lena Learner",
  locale: "de",
  timezone: "Europe/Berlin",
  state: "active",
};
const role = {
  user_id: userId,
  organization_id: organizationId,
  cohort_id: null,
  roles: { code: "learner" },
};
const cohort = {
  id: cohortId,
  organization_id: organizationId,
  course_id: courseId,
  name: "Release group",
  state: "active",
};
const enrollment = {
  id: "01980a33-0000-7000-8000-000000000001",
  organization_id: organizationId,
  learner_id: userId,
  course_id: courseId,
  cohort_id: cohortId,
  state: "assigned",
  updated_at: "2026-07-17T09:00:00.000Z",
  completed_at: null,
};
const attempt = {
  id: "01980a34-0000-7000-8000-000000000001",
  organization_id: organizationId,
  learner_id: userId,
  cohort_id: cohortId,
  state: "accepted",
  last_activity_at: "2026-07-18T09:00:00.000Z",
  accepted_at: "2026-07-18T09:00:00.000Z",
};
const certificate = {
  id: "01980a39-0000-7000-8000-000000000001",
  organization_id: organizationId,
  learner_id: userId,
  course_id: courseId,
  state: "available",
  certificate_type: "course_completion",
  issued_at: "2026-07-18T10:00:00.000Z",
  available_at: "2026-07-18T11:00:00.000Z",
  expires_at: null,
  revoked_at: null,
  created_at: "2026-07-18T10:00:00.000Z",
};
const cohortMembership = {
  cohort_id: cohortId,
  user_id: userId,
  role: "learner",
  state: "active",
  assigned_at: "2026-07-17T08:00:00.000Z",
  removed_at: null,
  cohorts: { organization_id: organizationId },
};
const course = {
  id: courseId,
  organization_id: null,
  slug: "practical-testing",
  default_locale: "en",
};
const localization = {
  course_id: courseId,
  locale: "en",
  title: "Practical testing",
};

function successQueues(overrides: Readonly<Record<string, readonly QueryResult[]>> = {}) {
  return {
    organization_memberships: [result(membership)],
    profiles: [result(profile)],
    user_roles: [result([role])],
    cohorts: [result([cohort])],
    enrollments: [result([enrollment])],
    attempts: [result([attempt])],
    certificates: [result([certificate])],
    cohort_memberships: [result([cohortMembership])],
    courses: [result([course])],
    course_localizations: [result([localization])],
    ...overrides,
  };
}

describe("admin member detail server boundary", () => {
  beforeEach(() => vi.mocked(createServerClient).mockReset());

  it.each([
    ["permission", { ...admin, permissions: [] }],
    ["organization", { ...admin, organizationId: null }],
  ])("denies a principal without an active %s before creating a client", async (_name, principal) => {
    await expect(readAdminMemberDetail(principal, "en", userId)).rejects.toMatchObject({
      code: "AUTHORIZATION_DENIED",
    });
    expect(createServerClient).not.toHaveBeenCalled();
  });

  it("returns null after the first exact membership read for an absent or cross-tenant target", async () => {
    const client = clientWithQueues({
      organization_memberships: [result(null)],
    });
    vi.mocked(createServerClient).mockResolvedValue(client as never);

    await expect(readAdminMemberDetail(admin, "en", userId)).resolves.toBeNull();
    expect(client.from).toHaveBeenCalledTimes(1);
    expect(client.from).toHaveBeenCalledWith("organization_memberships");
    const membershipBuilder = client.builders.get("organization_memberships")?.[0];
    expect(membershipBuilder?.eq).toHaveBeenNthCalledWith(1, "organization_id", organizationId);
    expect(membershipBuilder?.eq).toHaveBeenNthCalledWith(2, "user_id", userId);
    expect(client.rpc).not.toHaveBeenCalled();
  });

  it("rejects a mismatched membership response before any context read", async () => {
    const client = clientWithQueues({
      organization_memberships: [
        result({ ...membership, organization_id: otherOrganizationId }),
      ],
    });
    vi.mocked(createServerClient).mockResolvedValue(client as never);

    await expect(readAdminMemberDetail(admin, "en", userId)).rejects.toThrow(
      "target_scope_mismatch",
    );
    expect(client.from).toHaveBeenCalledTimes(1);
    expect(client.rpc).not.toHaveBeenCalled();
  });

  it("projects only the exact member and organization context", async () => {
    const client = clientWithQueues(successQueues());
    vi.mocked(createServerClient).mockResolvedValue(client as never);

    await expect(readAdminMemberDetail(admin, "de", userId)).resolves.toEqual(
      expect.objectContaining({
        profile: expect.objectContaining({ displayName: "Lena Learner" }),
        assignments: [expect.objectContaining({ cohortId, attemptTotal: 1 })],
        enrollments: [expect.objectContaining({ state: "assigned" })],
        certificates: [expect.objectContaining({ state: "available" })],
      }),
    );

    expect(client.from.mock.calls.map(([table]) => table)).toEqual([
      "organization_memberships",
      "profiles",
      "user_roles",
      "cohort_memberships",
      "enrollments",
      "attempts",
      "certificates",
      "cohorts",
      "courses",
      "course_localizations",
    ]);
    expect(client.builders.get("profiles")?.[0]?.eq).toHaveBeenCalledWith(
      "user_id",
      userId,
    );
    expect(client.rpc).not.toHaveBeenCalled();
    for (const table of ["user_roles", "enrollments", "attempts", "certificates"] as const) {
      const builder = client.builders.get(table)?.[0];
      expect(builder?.eq).toHaveBeenCalledWith("organization_id", organizationId);
    }
    for (const table of ["enrollments", "attempts", "certificates"] as const) {
      const builder = client.builders.get(table)?.[0];
      expect(builder?.eq).toHaveBeenCalledWith("learner_id", userId);
    }
  });

  it("fails atomically when a parallel context read fails", async () => {
    const client = clientWithQueues(
      successQueues({ attempts: [result(null, { message: "attempts unavailable" })] }),
    );
    vi.mocked(createServerClient).mockResolvedValue(client as never);

    await expect(readAdminMemberDetail(admin, "en", userId)).rejects.toThrow(
      "context_read_failed",
    );
    expect(client.from.mock.calls.map(([table]) => table)).not.toContain("cohorts");
    expect(client.from.mock.calls.map(([table]) => table)).not.toContain("courses");
  });

  it("fails atomically on assignment and course-context read errors", async () => {
    const assignmentClient = clientWithQueues(successQueues({
      cohort_memberships: [result(null, { message: "assignment unavailable" })],
    }));
    vi.mocked(createServerClient).mockResolvedValueOnce(assignmentClient as never);
    await expect(readAdminMemberDetail(admin, "en", userId)).rejects.toThrow(
      "context_read_failed",
    );
    expect(assignmentClient.from.mock.calls.map(([table]) => table)).not.toContain("courses");

    const courseClient = clientWithQueues(
      successQueues({ courses: [result(null, { message: "course unavailable" })] }),
    );
    vi.mocked(createServerClient).mockResolvedValueOnce(courseClient as never);
    await expect(readAdminMemberDetail(admin, "en", userId)).rejects.toThrow(
      "course_context_read_failed",
    );
  });

  it("rejects a cross-tenant child even if a provider violates query filters", async () => {
    const client = clientWithQueues(successQueues({
      certificates: [
        result([{ ...certificate, organization_id: otherOrganizationId }]),
      ],
    }));
    vi.mocked(createServerClient).mockResolvedValue(client as never);

    await expect(readAdminMemberDetail(admin, "en", userId)).rejects.toThrow(
      "certificate_scope_mismatch",
    );
  });
});
