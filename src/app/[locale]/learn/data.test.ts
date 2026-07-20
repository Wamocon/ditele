import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/shared/database/server", () => ({ createServerClient: vi.fn() }));

import { createServerClient } from "@/shared/database/server";

import { readLearnerDashboard } from "./data";

const ids = {
  enrollment: "01980a33-0000-7000-8000-000000000001",
  course: "01980a20-0000-7000-8000-000000000001",
  cohort: "01980a30-0000-7000-8000-000000000001",
  version: "01980a22-0000-7000-8000-000000000001",
  task: "01980a26-0000-7000-8000-000000000001",
};

function projectionRow() {
  return {
    enrollment_id: ids.enrollment,
    enrollment_state: "assigned",
    course_id: ids.course,
    cohort_id: ids.cohort,
    cohort_state: "active",
    content_version_id: ids.version,
    content_version_state: "published",
    version_number: 2,
    title: "Sicheres Testen",
    progression_mode: "scheduled",
    completed_activities: 0,
    total_activities: 1,
    next_task_id: ids.task,
    next_task_title: "Login testen",
    next_task_state: "available",
  };
}

describe("readLearnerDashboard", () => {
  beforeEach(() => vi.mocked(createServerClient).mockReset());

  it("reads only the actor-derived immutable learner projection", async () => {
    const client = {
      rpc: vi.fn().mockResolvedValue({ data: [projectionRow()], error: null }),
      from: vi.fn(() => {
        throw new Error("normalized table access is forbidden");
      }),
    };
    vi.mocked(createServerClient).mockResolvedValue(client as never);

    const dashboard = await readLearnerDashboard("de");

    expect(client.rpc).toHaveBeenCalledWith("list_my_learning_courses", {
      p_locale: "de",
    });
    expect(client.from).not.toHaveBeenCalled();
    expect(dashboard.activeCourses[0]?.title).toBe("Sicheres Testen");
    expect(dashboard.nextAction?.title).toBe("Login testen");
  });

  it("returns a stable empty dashboard and fails closed on RPC or payload errors", async () => {
    vi.mocked(createServerClient).mockResolvedValue({
      rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
    } as never);
    await expect(readLearnerDashboard("en")).resolves.toEqual({
      activeCourses: [],
      completedCourses: [],
      requestedCourses: [],
      nextAction: null,
    });

    vi.mocked(createServerClient).mockResolvedValue({
      rpc: vi.fn().mockResolvedValue({ data: null, error: { code: "42501" } }),
    } as never);
    await expect(readLearnerDashboard("en")).rejects.toThrow(
      "learning.dashboard_read_failed",
    );

    vi.mocked(createServerClient).mockResolvedValue({
      rpc: vi.fn().mockResolvedValue({
        data: [{ ...projectionRow(), object_key: "private/answer" }],
        error: null,
      }),
    } as never);
    await expect(readLearnerDashboard("en")).rejects.toThrow();
  });
});
