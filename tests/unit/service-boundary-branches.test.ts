import { describe, expect, it, vi } from "vitest";

import type { CatalogCourseDetail, CatalogPage } from "@/features/catalog/model/catalog";
import {
  getCatalogCourse,
  listCatalog,
  type CatalogRepository,
} from "@/features/catalog/server/catalog-service";
import type { CourseContentVersion } from "@/features/content/model";
import { validateContentVersion } from "@/features/content/validation";
import type { LearnerTask } from "@/features/tasks/model/task";
import {
  getLearnerTask,
  TaskError,
  type LearnerTaskRepository,
  type TaskAccessPolicy,
  type TaskPrincipal,
} from "@/features/tasks/server/task-service";

const timestamp = "2026-07-18T08:00:00.000Z";

const catalogCourse = {
  id: "course-1",
  slug: "testing-foundations",
  version: 1,
  title: { en: "Testing foundations" },
  summary: { en: "Practical software testing" },
  durationMinutes: 90,
  taskCount: 4,
  availability: "open",
  tags: ["foundation"],
  publishedAt: timestamp,
} satisfies CatalogPage["items"][number];

const catalogDetail: CatalogCourseDetail = {
  ...catalogCourse,
  description: { en: "Practice design and evidence techniques." },
  learningOutcomes: [{ en: "Design boundary tests" }],
  prerequisites: [],
};

describe("catalog adapter boundary", () => {
  it("normalizes query defaults and validates successful repository pages", async () => {
    const repository: CatalogRepository = {
      list: vi.fn(async () => ({ items: [catalogCourse], page: 1, pageSize: 12, total: 1 })),
      getBySlug: vi.fn(async () => catalogDetail),
    };
    await expect(listCatalog(repository, { locale: "de", search: "  grenze  " })).resolves.toMatchObject({ total: 1 });
    expect(repository.list).toHaveBeenCalledWith({ locale: "de", search: "grenze", page: 1, pageSize: 12 });
  });

  it("rejects unsafe slugs before adapter access and validates detail payloads", async () => {
    const repository: CatalogRepository = {
      list: vi.fn(),
      getBySlug: vi.fn(async () => catalogDetail),
    };
    await expect(getCatalogCourse(repository, { slug: " ../admin ", locale: "en" })).rejects.toThrow("catalog.invalid_slug");
    expect(repository.getBySlug).not.toHaveBeenCalled();

    await expect(getCatalogCourse(repository, { slug: " testing-foundations ", locale: "en" })).resolves.toEqual(catalogDetail);
    expect(repository.getBySlug).toHaveBeenCalledWith("testing-foundations", "en");

    vi.mocked(repository.getBySlug).mockResolvedValueOnce({ id: 7 });
    await expect(getCatalogCourse(repository, { slug: "testing-foundations", locale: "en" })).rejects.toThrow();
  });
});

const learnerTask: LearnerTask = {
  id: "task-1",
  version: 1,
  courseId: "course-1",
  groupId: "group-1",
  stageId: "stage-1",
  title: { en: "Boundary analysis" },
  instructions: { en: "Test the documented input limits." },
  access: "available",
};

function taskDependencies({ allowed = true, result = learnerTask }: { allowed?: boolean; result?: unknown } = {}) {
  const policy: TaskAccessPolicy = { canAccess: vi.fn(async () => allowed) };
  const repository: LearnerTaskRepository = { get: vi.fn(async () => result) };
  return { policy, repository };
}

describe("learner task read boundary", () => {
  it("requires an authenticated learner before policy or repository access", async () => {
    for (const principal of [null, { id: "trainer-1", role: "trainer" } as TaskPrincipal]) {
      const dependencies = taskDependencies();
      await expect(getLearnerTask(dependencies, principal, { taskId: "task-1", groupId: "group-1" })).rejects.toBeInstanceOf(TaskError);
      expect(dependencies.policy.canAccess).not.toHaveBeenCalled();
      expect(dependencies.repository.get).not.toHaveBeenCalled();
    }
  });

  it("fails closed when resource policy denies cross-group access", async () => {
    const dependencies = taskDependencies({ allowed: false });
    await expect(
      getLearnerTask(dependencies, { id: "learner-1", role: "learner" }, { taskId: "task-1", groupId: "group-other" }),
    ).rejects.toEqual(new TaskError("tasks.forbidden"));
    expect(dependencies.policy.canAccess).toHaveBeenCalledWith({ actorId: "learner-1", taskId: "task-1", groupId: "group-other", action: "read" });
    expect(dependencies.repository.get).not.toHaveBeenCalled();
  });

  it("validates adapter output and rejects inactive or blocked tasks", async () => {
    for (const access of ["inactive", "blocked"] as const) {
      const dependencies = taskDependencies({ result: { ...learnerTask, access } });
      await expect(
        getLearnerTask(dependencies, { id: "learner-1", role: "learner" }, { taskId: "task-1", groupId: "group-1" }),
      ).rejects.toEqual(new TaskError("tasks.inactive"));
    }

    const invalid = taskDependencies({ result: { id: 7, access: "available" } });
    await expect(
      getLearnerTask(invalid, { id: "learner-1", role: "learner" }, { taskId: "task-1", groupId: "group-1" }),
    ).rejects.toThrow();
  });

  it("returns a schema-validated available task with actor-derived repository scope", async () => {
    const dependencies = taskDependencies();
    await expect(
      getLearnerTask(dependencies, { id: "learner-1", role: "learner" }, { taskId: "task-1", groupId: "group-1" }),
    ).resolves.toEqual(learnerTask);
    expect(dependencies.repository.get).toHaveBeenCalledWith({ actorId: "learner-1", taskId: "task-1", groupId: "group-1" });
  });
});

function contentVersion(overrides: Partial<CourseContentVersion> = {}): CourseContentVersion {
  const localized = { en: "Complete", de: "Vollständig", ru: "Полный" };
  return {
    id: "content-1",
    organizationId: "org-1",
    courseId: "course-1",
    versionNumber: 1,
    revision: 1,
    state: "draft",
    metadata: { name: localized, description: localized },
    stages: [{
      id: "stage-1",
      title: localized,
      position: 1,
      startMediaIds: [],
      endMediaIds: [],
      tasks: [{
        id: "task-1",
        title: localized,
        description: localized,
        expectedAnswer: localized,
        hint: localized,
        beforeMediaIds: ["media-ready"],
        afterMediaIds: [],
        bugCategoryIds: [],
        skillIds: ["skill-1"],
        prerequisiteTaskIds: [],
        test: {
          question: localized,
          answers: [
            { id: "answer-1", label: localized, isCorrect: true, position: 1 },
            { id: "answer-2", label: localized, isCorrect: false, position: 2 },
          ],
        },
        position: 1,
      }],
    }],
    media: [{ id: "media-ready", kind: "video", storageKey: "course/video.mp4", fileName: "video.mp4", mimeType: "video/mp4", sizeBytes: 100, status: "ready" }],
    bugCategories: [],
    prerequisiteCourseIds: [],
    createdBy: "admin-1",
    createdAt: timestamp,
    updatedAt: timestamp,
    ...overrides,
  };
}

describe("content publishing validation", () => {
  it("accepts a fully localized, ordered version with ready media and a valid test", () => {
    expect(validateContentVersion(contentVersion(), ["en", "de", "ru"])).toEqual([]);
  });

  it("reports missing structural requirements without hiding independent defects", () => {
    const noStages = contentVersion({ stages: [] });
    expect(validateContentVersion(noStages, ["en"]))
      .toEqual(expect.arrayContaining([expect.objectContaining({ code: "missing_stage", path: "stages" })]));

    const emptyStage = contentVersion({
      stages: [{ id: "stage-empty", title: { en: "Stage", de: "Stufe", ru: "Этап" }, position: 1, startMediaIds: [], endMediaIds: [], tasks: [] }],
    });
    expect(validateContentVersion(emptyStage, ["en"]))
      .toEqual(expect.arrayContaining([expect.objectContaining({ code: "missing_task" })]));
  });

  it("collects translation, position, media, duplicate-reference, and invalid-test failures", () => {
    const empty = { en: "", de: "", ru: "" };
    const invalid = contentVersion({
      metadata: { name: empty, description: empty },
      media: [{ id: "media-pending", kind: "video", storageKey: "pending", fileName: "pending.mp4", mimeType: "video/mp4", sizeBytes: 100, status: "uploading" }],
      stages: [{
        id: "stage-1",
        title: empty,
        position: 3,
        startMediaIds: [],
        endMediaIds: [],
        tasks: [{
          id: "task-1",
          title: empty,
          description: empty,
          expectedAnswer: empty,
          hint: empty,
          beforeMediaIds: ["media-missing"],
          afterMediaIds: ["media-pending"],
          bugCategoryIds: [],
          skillIds: ["skill-1", "skill-1"],
          prerequisiteTaskIds: ["task-0", "task-0"],
          test: {
            question: empty,
            answers: [{ id: "answer-1", label: empty, isCorrect: false, position: 1 }],
          },
          position: 4,
        }],
      }],
    });
    const issues = validateContentVersion(invalid, ["en", "de", "ru"]);
    for (const code of ["missing_translation", "invalid_position", "media_not_ready", "duplicate_reference", "invalid_test"] as const) {
      expect(issues).toEqual(expect.arrayContaining([expect.objectContaining({ code })]));
    }
    expect(issues.filter((issue) => issue.code === "media_not_ready")).toHaveLength(2);
  });
});
