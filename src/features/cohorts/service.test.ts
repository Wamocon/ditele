import { describe, expect, it, vi } from "vitest";

import type { Cohort, CohortCommandPort, CohortPrincipal } from "./model";
import { CohortService } from "./service";

function cohort(overrides: Partial<Cohort> = {}): Cohort {
  return {
    id: "cohort-1",
    organizationId: "org-1",
    courseId: "course-1",
    courseVersionId: "version-1",
    name: { en: "Cohort", de: "Kohorte", ru: "Группа" },
    state: "waiting",
    progressionMode: "legacy_date",
    version: 2,
    members: [
      { userId: "trainer-1", displayName: "Trainer", role: "trainer", status: "active", joinedAt: "2026-07-17T08:00:00.000Z", completedTaskCount: 0 },
      { userId: "learner-1", displayName: "Learner", role: "learner", status: "active", joinedAt: "2026-07-17T08:00:00.000Z", completedTaskCount: 2 },
    ],
    taskActivations: [],
    createdAt: "2026-07-17T08:00:00.000Z",
    updatedAt: "2026-07-17T08:00:00.000Z",
    ...overrides,
  };
}

const trainer: CohortPrincipal = {
  userId: "trainer-1",
  organizationId: "org-1",
  role: "trainer",
  permissions: ["cohort:read", "cohort:change_state", "cohort:change_schedule"],
  assignedCohortIds: ["cohort-1"],
};

function setup(current: Cohort, learningPathEnabled = false) {
  const port: CohortCommandPort = {
    getCohort: vi.fn(async () => current),
    changeState: vi.fn(async (command) => {
      void command;
      return { ...current, state: "active" as const };
    }),
    changeTaskActivation: vi.fn(async () => current),
    duplicate: vi.fn(async () => ({ ...current, id: "cohort-2", state: "waiting" as const })),
    changeMembership: vi.fn(async () => current),
  };
  return { port, service: new CohortService(port, { learningPathEnabled }) };
}

describe("CohortService", () => {
  it("starts an assigned cohort and requests audit plus notifications", async () => {
    const { port, service } = setup(cohort());
    await service.changeState(trainer, {
      cohortId: "cohort-1",
      expectedVersion: 2,
      toState: "active",
      idempotencyKey: "cohort-key-1",
      correlationId: "correlation-1",
    });
    expect(port.changeState).toHaveBeenCalledWith(
      expect.objectContaining({ actorId: "trainer-1", toState: "active" }),
      expect.objectContaining({
        audit: expect.objectContaining({ eventName: "cohort.active" }),
        notification: expect.objectContaining({ template: "cohort_started" }),
      }),
    );
  });

  it("rejects stale and cross-resource lifecycle mutations", async () => {
    const { service } = setup(cohort());
    await expect(service.changeState(trainer, {
      cohortId: "cohort-1",
      expectedVersion: 1,
      toState: "active",
      idempotencyKey: "cohort-key-2",
      correlationId: "correlation-2",
    })).rejects.toMatchObject({ code: "COHORT_VERSION_CONFLICT" });

    const outsider = { ...trainer, assignedCohortIds: [] };
    await expect(service.changeState(outsider, {
      cohortId: "cohort-1",
      expectedVersion: 2,
      toState: "active",
      idempotencyKey: "cohort-key-3",
      correlationId: "correlation-3",
    })).rejects.toMatchObject({ code: "COHORT_FORBIDDEN" });
  });

  it("blocks learning-path cohort activation behind the feature flag", async () => {
    const { service } = setup(cohort({ progressionMode: "learning_path" }));
    await expect(service.changeState(trainer, {
      cohortId: "cohort-1",
      expectedVersion: 2,
      toState: "active",
      idempotencyKey: "cohort-key-4",
      correlationId: "correlation-4",
    })).rejects.toMatchObject({ code: "COHORT_FEATURE_DISABLED" });
  });

  it("requires impact confirmation before removing a learner with progress", async () => {
    const current = cohort();
    const { service } = setup(current);
    const admin: CohortPrincipal = {
      userId: "admin-1",
      organizationId: "org-1",
      role: "admin",
      permissions: ["cohort:manage_members"],
      assignedCohortIds: [],
    };
    await expect(service.changeMembership(admin, {
      cohortId: "cohort-1",
      expectedVersion: 2,
      userId: "learner-1",
      role: "learner",
      operation: "remove",
      idempotencyKey: "cohort-key-5",
      correlationId: "correlation-5",
    })).rejects.toMatchObject({ code: "COHORT_IMPACT_CONFIRMATION_REQUIRED" });
  });

  it("does not remove the last trainer from an active cohort", async () => {
    const { service } = setup(cohort({ state: "active" }));
    const admin: CohortPrincipal = {
      userId: "admin-1",
      organizationId: "org-1",
      role: "admin",
      permissions: ["cohort:manage_members"],
      assignedCohortIds: [],
    };
    await expect(service.changeMembership(admin, {
      cohortId: "cohort-1",
      expectedVersion: 2,
      userId: "trainer-1",
      role: "trainer",
      operation: "remove",
      idempotencyKey: "cohort-key-6",
      correlationId: "correlation-6",
    })).rejects.toMatchObject({ code: "COHORT_INVALID_TRANSITION" });
  });
});
