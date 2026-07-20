import { describe, expect, it } from "vitest";

import {
  projectCohortManagementDetail,
  type CohortManagementDetail,
} from "./cohort-management-model";

const cohortId = "01980a30-0000-7000-8000-000000000001";
const courseId = "01980a20-0000-7000-8000-000000000001";
const versionId = "01980a22-0000-7000-8000-000000000001";
const stageId = "01980a23-0000-7000-8000-000000000001";
const taskId = "01980a26-0000-7000-8000-000000000001";
const trainerId = "01980a00-0000-7000-8000-000000000002";

function project(
  overrides: {
    readonly cohort?: Record<string, unknown>;
    readonly canManage?: boolean;
    readonly canOperateAsTrainer?: boolean;
    readonly publishedVersionId?: string | null;
    readonly publishedVersionNumber?: number | null;
    readonly pinnedVersionState?: "published" | "archived" | null;
    readonly schedules?: readonly Record<string, unknown>[];
  } = {},
): CohortManagementDetail {
  return projectCohortManagementDetail({
    canManage: overrides.canManage ?? false,
    canOperateAsTrainer: overrides.canOperateAsTrainer ?? true,
    cohortInput: {
      id: cohortId,
      organization_id: "01980a10-0000-7000-8000-000000000001",
      course_id: courseId,
      content_version_id: versionId,
      name: "Release cohort",
      state: "waiting",
      progression_mode: "scheduled",
      starts_at: null,
      ends_at: null,
      capacity: 25,
      row_version: 1,
      updated_at: "2026-07-18T08:00:00.000Z",
      completed_at: null,
      ...overrides.cohort,
    },
    courseInput: {
      id: courseId,
      slug: "practical-testing",
      default_locale: "de",
    },
    courseLocalizationsInput: [
      { course_id: courseId, locale: "de", title: "Praktisches Testen" },
    ],
    locale: "ru",
    membershipsInput: [
      { user_id: trainerId, role: "trainer", state: "active" },
      {
        user_id: "01980a00-0000-7000-8000-000000000001",
        role: "learner",
        state: "active",
      },
    ],
    publishedVersionId:
      "publishedVersionId" in overrides
        ? (overrides.publishedVersionId ?? null)
        : versionId,
    publishedVersionNumber:
      "publishedVersionNumber" in overrides
        ? (overrides.publishedVersionNumber ?? null)
        : 1,
    pinnedVersionState:
      "pinnedVersionState" in overrides
        ? (overrides.pinnedVersionState ?? null)
        : "published",
    schedulesInput: overrides.schedules ?? [],
    stageLocalizationsInput: [
      { stage_id: stageId, locale: "de", title: "Testanalyse" },
    ],
    stagesInput: [{ id: stageId, position: 0 }],
    taskLocalizationsInput: [
      { task_id: taskId, locale: "de", title: "Login analysieren" },
    ],
    tasksInput: [
      {
        id: taskId,
        course_id: courseId,
        stage_id: stageId,
        content_version_id: versionId,
        position: 0,
        task_kind: "practical",
        state: "active",
      },
    ],
  });
}

describe("cohort management projection", () => {
  it("projects only the pinned task graph and models a missing schedule as CAS version zero", () => {
    const detail = project();

    expect(detail).toMatchObject({
      contentVersionId: versionId,
      publishedVersionNumber: 1,
      courseTitle: "Praktisches Testen",
      courseTitleLocale: "de",
      courseTitleUsesFallback: true,
      learnerCount: 1,
      trainerCount: 1,
      canStart: true,
      canCancel: false,
      canManageSchedules: true,
    });
    expect(detail.schedules).toEqual([
      expect.objectContaining({
        taskId,
        taskTitle: "Login analysieren",
        taskTitleUsesFallback: true,
        id: null,
        rowVersion: 0,
      }),
    ]);
  });

  it("allows a manager to cancel but never exposes commands after a terminal state", () => {
    const waiting = project({ canManage: true, canOperateAsTrainer: false });
    expect(waiting.canStart).toBe(true);
    expect(waiting.canCancel).toBe(true);

    const completed = project({
      canManage: true,
      cohort: {
        state: "completed",
        completed_at: "2026-07-18T10:00:00.000Z",
      },
    });
    expect(completed.canStart).toBe(false);
    expect(completed.canComplete).toBe(false);
    expect(completed.canCancel).toBe(false);
    expect(completed.canManageSchedules).toBe(false);
  });

  it("does not offer start or schedule commands without a valid published pin", () => {
    const detail = project({
      publishedVersionId: null,
      publishedVersionNumber: null,
      pinnedVersionState: null,
    });
    expect(detail.canStart).toBe(false);
    expect(detail.canManageSchedules).toBe(false);
  });

  it("retains an archived pinned task graph for an already active cohort", () => {
    const detail = project({
      cohort: { state: "active" },
      pinnedVersionState: "archived",
    });
    expect(detail.pinnedVersionState).toBe("archived");
    expect(detail.schedules).toHaveLength(1);
    expect(detail.canComplete).toBe(true);
    expect(detail.canManageSchedules).toBe(true);
  });

  it("rejects a content version projection that does not match the cohort pin", () => {
    expect(() =>
      project({
        publishedVersionId: "01980a22-0000-7000-8000-000000000099",
      }),
    ).toThrow("cohort_management.content_version_scope_mismatch");
  });

  it("rejects tasks from a newer version instead of silently changing the cohort graph", () => {
    expect(() =>
      projectCohortManagementDetail({
        canManage: true,
        canOperateAsTrainer: false,
        cohortInput: {
          id: cohortId,
          organization_id: "01980a10-0000-7000-8000-000000000001",
          course_id: courseId,
          content_version_id: versionId,
          name: "Pinned cohort",
          state: "active",
          progression_mode: "scheduled",
          starts_at: "2026-07-18T08:00:00.000Z",
          ends_at: null,
          capacity: null,
          row_version: 2,
          updated_at: "2026-07-18T08:00:00.000Z",
          completed_at: null,
        },
        courseInput: {
          id: courseId,
          slug: "practical-testing",
          default_locale: "en",
        },
        courseLocalizationsInput: [],
        locale: "en",
        membershipsInput: [],
        publishedVersionId: versionId,
        publishedVersionNumber: 1,
        pinnedVersionState: "published",
        schedulesInput: [],
        stageLocalizationsInput: [],
        stagesInput: [{ id: stageId, position: 0 }],
        taskLocalizationsInput: [],
        tasksInput: [
          {
            id: taskId,
            course_id: courseId,
            stage_id: stageId,
            content_version_id: "01980a22-0000-7000-8000-000000000099",
            position: 0,
            task_kind: "practical",
            state: "active",
          },
        ],
      }),
    ).toThrow("cohort_management.child_scope_mismatch");
  });
});
