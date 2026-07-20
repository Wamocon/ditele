import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/[locale]/_data/principal", () => ({ getPrincipal: vi.fn() }));
vi.mock("@/shared/database/server", () => ({ createServerClient: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn(() => {
    throw new Error("NEXT_REDIRECT");
  }),
}));

import { getPrincipal } from "@/app/[locale]/_data/principal";
import type { Principal } from "@/shared/auth/types";
import { createServerClient } from "@/shared/database/server";
import { redirect } from "next/navigation";

import { cohortCommandInitialState } from "../cohort-management-validation";
import {
  transitionCohortAction,
  updateTaskScheduleAction,
} from "./cohort-command-actions";

const cohortId = "01980a30-0000-7000-8000-000000000001";
const courseId = "01980a20-0000-7000-8000-000000000001";
const contentVersionId = "01980a22-0000-7000-8000-000000000001";
const taskId = "01980a26-0000-7000-8000-000000000001";

const trainer: Principal = {
  userId: "01980a00-0000-7000-8000-000000000002",
  sessionId: "session",
  organizationId: "01980a10-0000-7000-8000-000000000001",
  primaryRole: "trainer",
  roles: ["trainer"],
  permissions: ["cohort.read"],
  cohortIds: [cohortId],
};

function queryBuilder(data: unknown) {
  const builder = {
    select: vi.fn(),
    eq: vi.fn(),
    maybeSingle: vi.fn().mockResolvedValue({ data, error: null }),
  };
  builder.select.mockReturnValue(builder);
  builder.eq.mockReturnValue(builder);
  return builder;
}

function clientFixture({
  rpcError = null,
  task = { id: taskId },
}: {
  readonly rpcError?: unknown;
  readonly task?: unknown;
} = {}) {
  const rows: Record<string, unknown> = {
    cohorts: {
      id: cohortId,
      organization_id: trainer.organizationId,
      course_id: courseId,
      content_version_id: contentVersionId,
    },
    cohort_memberships: { id: "01980a31-0000-7000-8000-000000000002" },
    tasks: task,
    task_schedules: null,
  };
  return {
    from: vi.fn((table: string) => queryBuilder(rows[table] ?? null)),
    rpc: vi.fn().mockResolvedValue({ data: {}, error: rpcError }),
  };
}

function transitionForm(targetState: "active" | "completed" | "cancelled") {
  const form = new FormData();
  form.set("cohortId", cohortId);
  form.set("expectedVersion", "1");
  form.set("targetState", targetState);
  form.set("reason", "Verified lifecycle decision");
  form.set("idempotencyKey", "cohort-action-test-0001");
  form.set("locale", "en");
  form.set("perspective", "trainer");
  return form;
}

function scheduleForm() {
  const form = new FormData();
  form.set("cohortId", cohortId);
  form.set("taskId", taskId);
  form.set("expectedVersion", "0");
  form.set("availableFrom", "");
  form.set("dueAt", "");
  form.set("reason", "Create the initial task schedule");
  form.set("idempotencyKey", "schedule-action-test-0001");
  form.set("locale", "de");
  form.set("perspective", "trainer");
  return form;
}

describe("cohort command server actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getPrincipal).mockResolvedValue(trainer);
  });

  it("rejects invalid lifecycle input before reading the session", async () => {
    const form = transitionForm("active");
    form.set("reason", "x");
    await expect(
      transitionCohortAction(cohortCommandInitialState, form),
    ).resolves.toMatchObject({ status: "error" });
    expect(getPrincipal).not.toHaveBeenCalled();
    expect(createServerClient).not.toHaveBeenCalled();
  });

  it("does not let an assigned trainer invoke manager-only cancellation", async () => {
    const client = clientFixture();
    vi.mocked(createServerClient).mockResolvedValue(client as never);
    await expect(
      transitionCohortAction(
        cohortCommandInitialState,
        transitionForm("cancelled"),
      ),
    ).resolves.toMatchObject({
      status: "error",
      message: expect.stringMatching(/not authorized/i),
    });
    expect(client.rpc).not.toHaveBeenCalled();
  });

  it("passes explicit CAS and idempotency to the lifecycle RPC", async () => {
    const client = clientFixture();
    vi.mocked(createServerClient).mockResolvedValue(client as never);
    await expect(
      transitionCohortAction(
        cohortCommandInitialState,
        transitionForm("completed"),
      ),
    ).rejects.toThrow("NEXT_REDIRECT");
    expect(client.rpc).toHaveBeenCalledWith(
      "transition_cohort",
      expect.objectContaining({
        p_cohort_id: cohortId,
        p_expected_version: 1,
        p_target_state: "completed",
        p_idempotency_key: "cohort-action-test-0001",
      }),
    );
    expect(redirect).toHaveBeenCalledWith(
      `/en/trainer/groups/${cohortId}?notice=completed`,
    );
  });

  it("allows schedule creation and sends null boundaries through the audited RPC", async () => {
    const client = clientFixture();
    vi.mocked(createServerClient).mockResolvedValue(client as never);
    await expect(
      updateTaskScheduleAction(cohortCommandInitialState, scheduleForm()),
    ).rejects.toThrow("NEXT_REDIRECT");
    expect(client.rpc).toHaveBeenCalledWith(
      "update_task_schedule",
      expect.objectContaining({
        p_cohort_id: cohortId,
        p_task_id: taskId,
        p_expected_version: 0,
        p_available_from: null,
        p_due_at: null,
        p_idempotency_key: "schedule-action-test-0001",
      }),
    );
    expect(redirect).toHaveBeenCalledWith(
      `/de/trainer/groups/${cohortId}?notice=schedule_saved`,
    );
  });

  it("maps an RPC CAS conflict to the fresh stale-detail redirect", async () => {
    const client = clientFixture({
      rpcError: { code: "40001", message: "stale", details: "", hint: "" },
    });
    vi.mocked(createServerClient).mockResolvedValue(client as never);
    await expect(
      transitionCohortAction(
        cohortCommandInitialState,
        transitionForm("completed"),
      ),
    ).rejects.toThrow("NEXT_REDIRECT");
    expect(redirect).toHaveBeenCalledWith(
      `/en/trainer/groups/${cohortId}?notice=stale`,
    );
  });
});
