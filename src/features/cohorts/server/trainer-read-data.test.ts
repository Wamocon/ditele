import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/shared/database/server", () => ({ createServerClient: vi.fn() }));

import type { Principal } from "@/shared/auth/types";
import { createServerClient } from "@/shared/database/server";

import {
  readAuthorizedTrainerCohortContexts,
  readTrainerGroups,
  readTrainerLearnerProgress,
} from "./trainer-read-data";

const organizationId = "01980a10-0000-7000-8000-000000000001";
const cohortId = "01980a30-0000-7000-8000-000000000001";
const courseId = "01980a20-0000-7000-8000-000000000001";
const learnerId = "01980a00-0000-7000-8000-000000000001";
const trainerId = "01980a00-0000-7000-8000-000000000002";
const enrollmentId = "01980a33-0000-7000-8000-000000000001";

const trainer: Principal = {
  userId: trainerId,
  sessionId: "trainer-session",
  organizationId,
  primaryRole: "trainer",
  roles: ["trainer"],
  permissions: ["cohort.read", "review.manage"],
  cohortIds: [cohortId],
};

const cohort = {
  id: cohortId,
  course_id: courseId,
  name: "Release cohort",
  state: "active",
  progression_mode: "scheduled",
  starts_at: "2026-07-17T08:00:00.000Z",
  ends_at: null,
};
const course = {
  id: courseId,
  slug: "practical-testing",
  default_locale: "de",
};
const localization = {
  course_id: courseId,
  locale: "de",
  title: "Praktisches Testen",
};
const trainerMembership = {
  cohort_id: cohortId,
  user_id: trainerId,
  role: "trainer",
  state: "active",
  assigned_at: "2026-07-17T08:00:00.000Z",
};
const learnerMembership = {
  cohort_id: cohortId,
  user_id: learnerId,
  role: "learner",
  state: "active",
  assigned_at: "2026-07-17T08:15:00.000Z",
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
    then: <TResult1 = QueryResult, TResult2 = never>(
      onFulfilled?: ((value: QueryResult) => TResult1 | PromiseLike<TResult1>) | null,
      onRejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
    ) => Promise.resolve(queryResult).then(onFulfilled, onRejected),
  };
  builder.select.mockReturnValue(builder);
  builder.eq.mockReturnValue(builder);
  builder.in.mockReturnValue(builder);
  builder.order.mockReturnValue(builder);
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

function contextQueues(overrides: {
  readonly assignment?: QueryResult;
  readonly cohorts?: QueryResult;
  readonly courses?: QueryResult;
  readonly localizations?: QueryResult;
} = {}) {
  return {
    cohort_memberships: [
      overrides.assignment ?? result([trainerMembership]),
    ],
    cohorts: [overrides.cohorts ?? result([cohort])],
    courses: [overrides.courses ?? result([course])],
    course_localizations: [
      overrides.localizations ?? result([localization]),
    ],
  };
}

describe("trainer server read boundaries", () => {
  beforeEach(() => vi.mocked(createServerClient).mockReset());

  it("denies a role without trainer read permission before opening a database client", async () => {
    await expect(
      readTrainerGroups({ ...trainer, permissions: [] }, "en"),
    ).rejects.toMatchObject({ code: "AUTHORIZATION_DENIED" });
    expect(createServerClient).not.toHaveBeenCalled();
  });

  it("returns an empty authorized context when the trainer has no active assignments", async () => {
    const client = clientWithQueues({
      cohort_memberships: [result([])],
    });
    vi.mocked(createServerClient).mockResolvedValue(client as never);

    await expect(
      readAuthorizedTrainerCohortContexts(trainer, "en"),
    ).resolves.toEqual({ client, cohorts: [] });
    expect(client.from).toHaveBeenCalledTimes(1);
  });

  it("maps assigned cohorts and localized group membership counts", async () => {
    const client = clientWithQueues({
      ...contextQueues(),
      cohort_memberships: [
        result([trainerMembership]),
        result([trainerMembership, learnerMembership]),
      ],
    });
    vi.mocked(createServerClient).mockResolvedValue(client as never);

    await expect(readTrainerGroups(trainer, "ru")).resolves.toEqual([
      expect.objectContaining({
        id: cohortId,
        courseTitle: "Praktisches Testen",
        courseTitleLocale: "de",
        courseTitleUsesFallback: true,
        learnerCount: 1,
        trainerCount: 1,
      }),
    ]);
  });

  it("lets a platform manager read visible cohorts without a trainer-membership scope query", async () => {
    const admin: Principal = {
      ...trainer,
      userId: "01980a00-0000-7000-8000-000000000004",
      primaryRole: "admin",
      roles: ["admin"],
      permissions: ["cohort.read", "cohort.manage"],
      cohortIds: [],
    };
    const client = clientWithQueues({
      cohorts: [result([cohort])],
      courses: [result([course])],
      course_localizations: [result([localization])],
    });
    vi.mocked(createServerClient).mockResolvedValue(client as never);

    const context = await readAuthorizedTrainerCohortContexts(admin, "de");
    expect(context.cohorts).toHaveLength(1);
    expect(client.from.mock.calls.map(([table]) => table)).not.toContain(
      "cohort_memberships",
    );
  });

  it("rejects a database cohort outside the principal resource scope", async () => {
    const client = clientWithQueues(contextQueues());
    vi.mocked(createServerClient).mockResolvedValue(client as never);

    await expect(
      readAuthorizedTrainerCohortContexts(
        { ...trainer, cohortIds: [] },
        "en",
      ),
    ).rejects.toMatchObject({ code: "AUTHORIZATION_DENIED" });
  });

  it.each([
    [
      "assignment",
      contextQueues({
        assignment: result(null, { message: "membership unavailable" }),
      }),
      "trainer_read.cohort_scope_read_failed",
    ],
    [
      "cohort",
      contextQueues({ cohorts: result(null, { message: "cohort unavailable" }) }),
      "trainer_read.cohort_read_failed",
    ],
    [
      "course context",
      contextQueues({ courses: result(null, { message: "course unavailable" }) }),
      "trainer_read.course_context_read_failed",
    ],
  ])("maps a %s read failure to its stable boundary error", async (_label, queues, message) => {
    const client = clientWithQueues(queues);
    vi.mocked(createServerClient).mockResolvedValue(client as never);
    await expect(
      readAuthorizedTrainerCohortContexts(trainer, "en"),
    ).rejects.toThrow(message);
  });

  it("maps a group-membership failure after authorized context resolution", async () => {
    const client = clientWithQueues({
      ...contextQueues(),
      cohort_memberships: [
        result([trainerMembership]),
        result(null, { message: "group membership unavailable" }),
      ],
    });
    vi.mocked(createServerClient).mockResolvedValue(client as never);

    await expect(readTrainerGroups(trainer, "en")).rejects.toThrow(
      "trainer_read.group_membership_read_failed",
    );
  });

  it("projects learner progress from authorized memberships, attempts, enrollments and profiles", async () => {
    const client = clientWithQueues({
      ...contextQueues(),
      cohort_memberships: [
        result([trainerMembership]),
        result([learnerMembership]),
      ],
      attempts: [
        result([
          {
            id: "01980a34-0000-7000-8000-000000000001",
            cohort_id: cohortId,
            learner_id: learnerId,
            enrollment_id: enrollmentId,
            state: "accepted",
            last_activity_at: "2026-07-17T10:00:00.000Z",
          },
        ]),
      ],
      enrollments: [
        result([
          {
            id: enrollmentId,
            cohort_id: cohortId,
            learner_id: learnerId,
            state: "assigned",
            updated_at: "2026-07-17T09:00:00.000Z",
          },
        ]),
      ],
      profiles: [
        result([{ user_id: learnerId, display_name: "Lena Learner" }]),
      ],
    });
    vi.mocked(createServerClient).mockResolvedValue(client as never);

    await expect(readTrainerLearnerProgress(trainer, "en")).resolves.toEqual([
      expect.objectContaining({
        learnerId,
        learnerName: "Lena Learner",
        enrollmentStatus: "assigned",
        acceptedAttemptCount: 1,
      }),
    ]);
  });

  it("does not query profiles when an authorized cohort has no learners", async () => {
    const client = clientWithQueues({
      ...contextQueues(),
      cohort_memberships: [result([trainerMembership]), result([])],
      attempts: [result([])],
      enrollments: [result([])],
    });
    vi.mocked(createServerClient).mockResolvedValue(client as never);

    await expect(
      readTrainerLearnerProgress(trainer, "en"),
    ).resolves.toEqual([]);
    expect(client.from.mock.calls.map(([table]) => table)).not.toContain(
      "profiles",
    );
  });

  it("maps progress and profile query failures without returning partial data", async () => {
    const progressClient = clientWithQueues({
      ...contextQueues(),
      cohort_memberships: [
        result([trainerMembership]),
        result(null, { message: "memberships unavailable" }),
      ],
      attempts: [result([])],
      enrollments: [result([])],
    });
    vi.mocked(createServerClient).mockResolvedValue(progressClient as never);
    await expect(
      readTrainerLearnerProgress(trainer, "en"),
    ).rejects.toThrow("trainer_read.progress_read_failed");

    const profileClient = clientWithQueues({
      ...contextQueues(),
      cohort_memberships: [
        result([trainerMembership]),
        result([learnerMembership]),
      ],
      attempts: [result([])],
      enrollments: [result([])],
      profiles: [result(null, { message: "profiles unavailable" })],
    });
    vi.mocked(createServerClient).mockResolvedValue(profileClient as never);
    await expect(
      readTrainerLearnerProgress(trainer, "en"),
    ).rejects.toThrow("trainer_read.progress_profile_read_failed");
  });
});
