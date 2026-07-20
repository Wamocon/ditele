import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/shared/database/server", () => ({ createServerClient: vi.fn() }));

import type { Principal } from "@/shared/auth/types";
import { createServerClient } from "@/shared/database/server";

import { readCohortManagementDetail } from "./cohort-management-data";

const organizationId = "01980a10-0000-7000-8000-000000000001";
const cohortId = "01980a30-0000-7000-8000-000000000001";
const courseId = "01980a20-0000-7000-8000-000000000001";
const versionId = "01980a22-0000-7000-8000-000000000001";
const stageId = "01980a23-0000-7000-8000-000000000001";
const taskId = "01980a26-0000-7000-8000-000000000001";
const trainerId = "01980a00-0000-7000-8000-000000000002";

const trainer: Principal = {
  userId: trainerId,
  sessionId: "trainer-session",
  organizationId,
  primaryRole: "trainer",
  roles: ["trainer"],
  permissions: ["cohort.read"],
  cohortIds: [cohortId],
};

const cohort = {
  id: cohortId,
  organization_id: organizationId,
  course_id: courseId,
  content_version_id: versionId,
  name: "Release cohort",
  state: "waiting",
  progression_mode: "scheduled",
  starts_at: null,
  ends_at: null,
  capacity: 20,
  row_version: 1,
  updated_at: "2026-07-18T08:00:00.000Z",
  completed_at: null,
};
const course = {
  id: courseId,
  slug: "practical-testing",
  default_locale: "de",
};
const version = {
  id: versionId,
  course_id: courseId,
  version_number: 1,
  state: "published",
};
const task = {
  id: taskId,
  course_id: courseId,
  stage_id: stageId,
  content_version_id: versionId,
  position: 0,
  task_kind: "practical",
  state: "active",
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
    order: vi.fn(),
    limit: vi.fn(),
    maybeSingle: vi.fn(),
    then: <TResult1 = QueryResult, TResult2 = never>(
      onFulfilled?: ((value: QueryResult) => TResult1 | PromiseLike<TResult1>) | null,
      onRejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
    ) => Promise.resolve(queryResult).then(onFulfilled, onRejected),
  };
  builder.select.mockReturnValue(builder);
  builder.eq.mockReturnValue(builder);
  builder.in.mockReturnValue(builder);
  builder.order.mockReturnValue(builder);
  builder.limit.mockReturnValue(builder);
  builder.maybeSingle.mockReturnValue(builder);
  return builder;
}

function clientWithQueues(queues: Readonly<Record<string, readonly QueryResult[]>>) {
  const remaining = new Map(
    Object.entries(queues).map(([table, results]) => [table, [...results]]),
  );
  return {
    from: vi.fn((table: string) => {
      const queue = remaining.get(table);
      const next = queue?.shift();
      if (!next) throw new Error(`Unexpected ${table} query`);
      return queryBuilder(next);
    }),
  };
}

function fullQueues(overrides: Readonly<Record<string, QueryResult>> = {}) {
  const defaults: Readonly<Record<string, QueryResult>> = {
    cohorts: result(cohort),
    content_versions: result(version),
    tasks: result([task]),
    courses: result(course),
    course_localizations: result([
      { course_id: courseId, locale: "de", title: "Praktisches Testen" },
    ]),
    cohort_memberships: result([
      { user_id: trainerId, role: "trainer", state: "active" },
      {
        user_id: "01980a00-0000-7000-8000-000000000001",
        role: "learner",
        state: "active",
      },
    ]),
    organization_memberships: result({ state: "active", valid_until: null }),
    organizations: result({ state: "active" }),
    profiles: result({ state: "active", deactivated_at: null }),
    task_schedules: result([]),
    task_localizations: result([
      { task_id: taskId, locale: "de", title: "Login analysieren" },
    ]),
    stages: result([{ id: stageId, position: 0 }]),
    stage_localizations: result([
      { stage_id: stageId, locale: "de", title: "Testanalyse" },
    ]),
  };
  return Object.fromEntries(
    Object.entries({ ...defaults, ...overrides }).map(([table, value]) => [
      table,
      [value],
    ]),
  );
}

describe("cohort management server read boundary", () => {
  beforeEach(() => vi.mocked(createServerClient).mockReset());

  it("denies an unauthorized perspective before creating a database client", async () => {
    await expect(
      readCohortManagementDetail(
        { ...trainer, permissions: [] },
        "en",
        cohortId,
        "trainer",
      ),
    ).rejects.toThrow("cohort_management.perspective_forbidden");
    expect(createServerClient).not.toHaveBeenCalled();
  });

  it("returns null for an RLS-invisible cohort without querying child context", async () => {
    const client = clientWithQueues({ cohorts: [result(null)] });
    vi.mocked(createServerClient).mockResolvedValue(client as never);

    await expect(
      readCohortManagementDetail(trainer, "en", cohortId, "trainer"),
    ).resolves.toBeNull();
    expect(client.from).toHaveBeenCalledTimes(1);
  });

  it("maps a cohort query failure to a stable boundary error", async () => {
    const client = clientWithQueues({
      cohorts: [result(null, { message: "cohort unavailable" })],
    });
    vi.mocked(createServerClient).mockResolvedValue(client as never);

    await expect(
      readCohortManagementDetail(trainer, "en", cohortId, "trainer"),
    ).rejects.toThrow("cohort_management.cohort_read_failed");
  });

  it("projects a pinned localized task graph for an active trainer", async () => {
    const client = clientWithQueues(fullQueues());
    vi.mocked(createServerClient).mockResolvedValue(client as never);

    await expect(
      readCohortManagementDetail(trainer, "ru", cohortId, "trainer"),
    ).resolves.toMatchObject({
      id: cohortId,
      courseTitle: "Praktisches Testen",
      courseTitleUsesFallback: true,
      publishedVersionNumber: 1,
      learnerCount: 1,
      trainerCount: 1,
      canStart: true,
      canManageSchedules: true,
      schedules: [
        expect.objectContaining({
          taskId,
          taskTitle: "Login analysieren",
          stageTitle: "Testanalyse",
        }),
      ],
    });
  });

  it("permits a tenant manager with an active tenant membership", async () => {
    const manager: Principal = {
      ...trainer,
      userId: "01980a00-0000-7000-8000-000000000004",
      primaryRole: "organization_admin",
      roles: ["organization_admin"],
      permissions: ["cohort.manage"],
      cohortIds: [],
    };
    const client = clientWithQueues(
      fullQueues({
        cohort_memberships: result([]),
      }),
    );
    vi.mocked(createServerClient).mockResolvedValue(client as never);

    await expect(
      readCohortManagementDetail(manager, "de", cohortId, "admin"),
    ).resolves.toMatchObject({ canCancel: true, canManageSchedules: true });
  });

  it("lets a valid global platform manager operate without tenant membership", async () => {
    const admin: Principal = {
      ...trainer,
      userId: "01980a00-0000-7000-8000-000000000005",
      organizationId: null,
      primaryRole: "admin",
      roles: ["admin"],
      permissions: ["cohort.manage"],
      cohortIds: [],
    };
    const client = clientWithQueues(
      fullQueues({
        cohort_memberships: result([]),
        organization_memberships: result(null),
      }),
    );
    vi.mocked(createServerClient).mockResolvedValue(client as never);

    await expect(
      readCohortManagementDetail(admin, "en", cohortId, "admin"),
    ).resolves.toMatchObject({ canCancel: true });
  });

  it.each([
    ["inactive profile", { profiles: result({ state: "inactive", deactivated_at: null }) }],
    ["deactivated profile", { profiles: result({ state: "active", deactivated_at: "2026-07-18T07:00:00.000Z" }) }],
    ["suspended organization", { organizations: result({ state: "suspended" }) }],
    ["expired tenant membership", { organization_memberships: result({ state: "active", valid_until: "2020-01-01T00:00:00.000Z" }) }],
    ["missing trainer membership", { cohort_memberships: result([]) }],
  ])("returns no trainer detail for an %s", async (_label, overrides) => {
    const client = clientWithQueues(fullQueues(overrides));
    vi.mocked(createServerClient).mockResolvedValue(client as never);

    await expect(
      readCohortManagementDetail(trainer, "en", cohortId, "trainer"),
    ).resolves.toBeNull();
  });

  it("returns a safe no-pin detail without querying mutable task children", async () => {
    const noPinCohort = { ...cohort, content_version_id: null };
    const queues = fullQueues({
      cohorts: result(noPinCohort),
      cohort_memberships: result([
        { user_id: trainerId, role: "trainer", state: "active" },
      ]),
    });
    delete queues.content_versions;
    delete queues.tasks;
    delete queues.task_localizations;
    delete queues.stages;
    delete queues.stage_localizations;
    const client = clientWithQueues(queues);
    vi.mocked(createServerClient).mockResolvedValue(client as never);

    const detail = await readCohortManagementDetail(
      trainer,
      "en",
      cohortId,
      "trainer",
    );
    expect(detail).toMatchObject({
      contentVersionId: null,
      publishedVersionNumber: null,
      canStart: false,
      canManageSchedules: false,
      schedules: [],
    });
    expect(client.from.mock.calls.map(([table]) => table)).not.toContain(
      "tasks",
    );
  });

  it("returns null when required parent context is not visible", async () => {
    const client = clientWithQueues(fullQueues({ courses: result(null) }));
    vi.mocked(createServerClient).mockResolvedValue(client as never);

    await expect(
      readCohortManagementDetail(trainer, "en", cohortId, "trainer"),
    ).resolves.toBeNull();
  });

  it("maps parent and task-context failures without returning partial details", async () => {
    const parentClient = clientWithQueues(
      fullQueues({ courses: result(null, { message: "course unavailable" }) }),
    );
    vi.mocked(createServerClient).mockResolvedValue(parentClient as never);
    await expect(
      readCohortManagementDetail(trainer, "en", cohortId, "trainer"),
    ).rejects.toThrow("cohort_management.context_read_failed");

    const childClient = clientWithQueues(
      fullQueues({
        task_localizations: result(null, {
          message: "task localization unavailable",
        }),
      }),
    );
    vi.mocked(createServerClient).mockResolvedValue(childClient as never);
    await expect(
      readCohortManagementDetail(trainer, "en", cohortId, "trainer"),
    ).rejects.toThrow("cohort_management.task_context_read_failed");
  });
});
