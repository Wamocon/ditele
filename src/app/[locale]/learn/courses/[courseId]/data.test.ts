import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/shared/database/server", () => ({ createServerClient: vi.fn() }));

import { createServerClient } from "@/shared/database/server";

import { readLearnerCourseWorkspace } from "./data";

const ids = {
  enrollment: "01980a33-0000-7000-8000-000000000001",
  course: "01980a20-0000-7000-8000-000000000001",
  cohort: "01980a30-0000-7000-8000-000000000001",
  version: "01980a22-0000-7000-8000-000000000001",
  stage: "01980a23-0000-7000-8000-000000000001",
  task: "01980a26-0000-7000-8000-000000000001",
};

function projection(overrides: Record<string, unknown> = {}) {
  return {
    course_id: ids.course,
    enrollment_id: ids.enrollment,
    enrollment_state: "assigned",
    cohort_id: ids.cohort,
    cohort_state: "active",
    content_version_id: ids.version,
    content_version_state: "published",
    version_number: 1,
    title: "Praktisches Testen",
    summary: "Unveränderliche Kursansicht.",
    cohort_name: "Release 0",
    progression_mode: "scheduled",
    completed_activities: 0,
    total_activities: 1,
    stages: [{
      id: ids.stage,
      title: "Analyse",
      description: "Risiken analysieren.",
      position: 0,
      activities: [{
        id: ids.task,
        title: "Login testen",
        description: "Testnachweise sammeln.",
        position: 0,
        state: "available",
        lock_reasons: [],
        expected_minutes: 45,
        available_from: null,
        due_at: null,
      }],
    }],
    ...overrides,
  };
}

describe("readLearnerCourseWorkspace", () => {
  beforeEach(() => vi.mocked(createServerClient).mockReset());

  it("reads the exact pinned course projection without normalized graph queries", async () => {
    const client = {
      rpc: vi.fn().mockResolvedValue({ data: projection(), error: null }),
      from: vi.fn(() => {
        throw new Error("normalized content graph access is forbidden");
      }),
    };
    vi.mocked(createServerClient).mockResolvedValue(client as never);

    const workspace = await readLearnerCourseWorkspace(ids.course, "de");

    expect(client.rpc).toHaveBeenCalledWith("get_my_learning_course", {
      p_course_id: ids.course,
      p_locale: "de",
    });
    expect(client.from).not.toHaveBeenCalled();
    expect(workspace).toMatchObject({
      accessMode: "active",
      title: "Praktisches Testen",
      totalActivities: 1,
    });
  });

  it("returns null for inaccessible or stale content and fails closed on malformed data", async () => {
    vi.mocked(createServerClient).mockResolvedValue({
      rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
    } as never);
    await expect(
      readLearnerCourseWorkspace(ids.course, "en"),
    ).resolves.toBeNull();

    vi.mocked(createServerClient).mockResolvedValue({
      rpc: vi.fn().mockResolvedValue({
        data: projection({ content_version_state: "draft" }),
        error: null,
      }),
    } as never);
    await expect(
      readLearnerCourseWorkspace(ids.course, "en"),
    ).rejects.toThrow();

    vi.mocked(createServerClient).mockResolvedValue({
      rpc: vi.fn().mockResolvedValue({ data: null, error: { code: "PGRST001" } }),
    } as never);
    await expect(
      readLearnerCourseWorkspace(ids.course, "en"),
    ).rejects.toThrow("learning.course_workspace_read_failed");
  });
});
