import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/shared/database/server", () => ({ createServerClient: vi.fn() }));

import type { Principal } from "@/shared/auth/types";
import { createServerClient } from "@/shared/database/server";

import {
  readLearnerHistory,
  resolveLearnerHistorySnapshot,
} from "./learner-history-data";

const USER_ID = "01980a00-0000-7000-8000-000000000001";
const ORGANIZATION_ID = "01980a10-0000-7000-8000-000000000001";
const OTHER_ORGANIZATION_ID = "01980a10-0000-7000-8000-000000000099";
const COHORT_ID = "01980a30-0000-7000-8000-000000000001";
const HISTORICAL_COHORT_ID = "01980a30-0000-7000-8000-000000000099";
const COURSE_ID = "01980a20-0000-7000-8000-000000000001";
const TASK_ID = "01980a28-0000-7000-8000-000000000001";

const learner: Principal = {
  userId: USER_ID,
  sessionId: "session",
  organizationId: ORGANIZATION_ID,
  primaryRole: "learner",
  roles: ["learner"],
  permissions: ["cohort.read", "learning.submit"],
  cohortIds: [COHORT_ID],
};

type RpcArgs = {
  p_locale: string;
  p_snapshot_at: string;
  p_before_occurred_at?: string;
  p_before_event_id?: string;
  p_limit: number;
};

type RpcResult = { data: unknown; error: unknown };

function fakeClient(
  handler: (args: RpcArgs, callIndex: number) => RpcResult,
) {
  const calls: Array<{ name: string; args: RpcArgs }> = [];
  return {
    calls,
    client: {
      rpc: vi.fn(async (name: string, args: RpcArgs) => {
        calls.push({ name, args });
        return handler(args, calls.length - 1);
      }),
    },
  };
}

function historyRow(overrides: Record<string, unknown> = {}) {
  return {
    event_id: `attempt_started:01980a34-0000-7000-8000-000000000001`,
    event_kind: "attempt_started",
    occurred_at: "2026-07-10T09:00:00.000Z",
    organization_id: ORGANIZATION_ID,
    course_id: COURSE_ID,
    cohort_id: COHORT_ID,
    task_id: TASK_ID,
    question_id: null,
    ordinal: 1,
    course_title: "Practical software testing",
    task_title: "Analyze the login flow",
    ...overrides,
  };
}

function requestedRow(index: number) {
  const seconds = String(59 - index).padStart(2, "0");
  return historyRow({
    event_id: `course_requested:event-${String(index).padStart(3, "0")}`,
    event_kind: "course_requested",
    occurred_at: `2026-07-10T08:59:${seconds}.000Z`,
    cohort_id: null,
    task_id: null,
    ordinal: null,
    course_title: null,
    task_title: null,
  });
}

describe("learner history RPC boundary", () => {
  beforeEach(() => vi.mocked(createServerClient).mockReset());

  it("rejects role, permission, organization, page, and snapshot failures before opening a client", async () => {
    await expect(readLearnerHistory({
      ...learner,
      primaryRole: "trainer",
      roles: ["trainer"],
    }, "en", 1)).rejects.toMatchObject({ code: "AUTHORIZATION_DENIED" });
    await expect(readLearnerHistory({
      ...learner,
      permissions: ["learning.submit"],
    }, "en", 1)).rejects.toMatchObject({ code: "AUTHORIZATION_DENIED" });
    await expect(readLearnerHistory({
      ...learner,
      organizationId: null,
    }, "en", 1)).rejects.toMatchObject({ code: "AUTHORIZATION_DENIED" });
    await expect(readLearnerHistory(learner, "en", 0)).rejects.toThrow();
    await expect(readLearnerHistory(
      learner,
      "en",
      1,
      "not-a-timestamp",
    )).rejects.toThrow();
    expect(createServerClient).not.toHaveBeenCalled();
  });

  it("canonicalizes stable snapshots and rejects a materially future boundary", () => {
    const now = new Date("2026-07-18T12:00:00.000Z");
    expect(resolveLearnerHistorySnapshot(undefined, now)).toBe(
      "2026-07-18T12:00:00.000Z",
    );
    expect(resolveLearnerHistorySnapshot(
      "2026-07-18T11:00:00+00:00",
      now,
    )).toBe("2026-07-18T11:00:00.000Z");
    expect(() => resolveLearnerHistorySnapshot(
      "2026-07-18T12:06:00.000Z",
      now,
    )).toThrow("learner_history.snapshot_is_in_the_future");
  });

  it("uses only the actor-derived immutable RPC and projects exact localized context", async () => {
    const rows = [
      historyRow(),
      historyRow({
        event_id: "course_assigned:01980a32-0000-7000-8000-000000000001",
        event_kind: "course_assigned",
        occurred_at: "2026-07-02T08:00:00.000Z",
        task_id: null,
        ordinal: null,
        task_title: null,
      }),
      historyRow({
        event_id: "course_requested:01980a32-0000-7000-8000-000000000001",
        event_kind: "course_requested",
        occurred_at: "2026-07-01T08:00:00.000Z",
        cohort_id: null,
        task_id: null,
        ordinal: null,
        course_title: null,
        task_title: null,
      }),
    ];
    const fake = fakeClient(() => ({ data: rows, error: null }));
    vi.mocked(createServerClient).mockResolvedValue(fake.client as never);

    const history = await readLearnerHistory(
      learner,
      "de",
      1,
      "2026-07-18T12:00:00.000Z",
    );

    expect(history.items.map((item) => item.kind)).toEqual([
      "attempt_started",
      "course_assigned",
      "course_requested",
    ]);
    expect(history.items[0]).toMatchObject({
      courseTitle: "Practical software testing",
      taskTitle: "Analyze the login flow",
      target: { type: "course", id: COURSE_ID },
    });
    expect(fake.calls).toEqual([{
      name: "list_my_learning_history",
      args: {
        p_locale: "de",
        p_snapshot_at: "2026-07-18T12:00:00.000Z",
        p_limit: 21,
      },
    }]);
    expect(JSON.stringify(history)).not.toMatch(
      /answer_text|comment|message|evidence|email|phone|token/i,
    );
  });

  it("retains cancelled history outside the principal's current cohort list", async () => {
    const cancelled = historyRow({
      event_id: "course_cancelled:01980a32-0000-7000-8000-000000000099",
      event_kind: "course_cancelled",
      cohort_id: HISTORICAL_COHORT_ID,
      task_id: null,
      ordinal: null,
      task_title: null,
    });
    const fake = fakeClient(() => ({ data: [cancelled], error: null }));
    vi.mocked(createServerClient).mockResolvedValue(fake.client as never);

    const history = await readLearnerHistory(
      { ...learner, cohortIds: [] },
      "en",
      1,
      "2026-07-18T12:00:00.000Z",
    );

    expect(history.items).toEqual([
      expect.objectContaining({
        kind: "course_cancelled",
        courseTitle: "Practical software testing",
        target: null,
      }),
    ]);
  });

  it("uses bounded keyset calls for deep numbered pages", async () => {
    const rows = Array.from({ length: 121 }, (_, index) => {
      const occurredAt = new Date(
        Date.parse("2026-07-10T09:00:00.000Z") - index * 1_000,
      ).toISOString();
      return {
        ...requestedRow(0),
        event_id: `course_requested:event-${String(index).padStart(3, "0")}`,
        occurred_at: occurredAt,
      };
    });
    rows[99] = {
      ...rows[99]!,
      occurred_at: "2026-07-10T08:58:21.123456+00:00",
    };
    const fake = fakeClient((_args, callIndex) => ({
      data: callIndex === 0 ? rows.slice(0, 100) : rows.slice(100),
      error: null,
    }));
    vi.mocked(createServerClient).mockResolvedValue(fake.client as never);

    const history = await readLearnerHistory(
      learner,
      "en",
      6,
      "2026-07-18T12:00:00.000Z",
    );

    expect(history.items).toHaveLength(20);
    expect(history.items[0]?.id).toBe("course_requested:event-100");
    expect(history.items.at(-1)?.id).toBe("course_requested:event-119");
    expect(history.hasNextPage).toBe(true);
    expect(fake.calls.map(({ args }) => args.p_limit)).toEqual([100, 21]);
    expect(fake.calls[1]?.args).toMatchObject({
      p_before_occurred_at: rows[99]?.occurred_at,
      p_before_event_id: rows[99]?.event_id,
    });
  });

  it("fails closed on provider errors, malformed rows, foreign tenants, and unstable ordering", async () => {
    const failed = fakeClient(() => ({
      data: null,
      error: { message: "timeout" },
    }));
    vi.mocked(createServerClient).mockResolvedValue(failed.client as never);
    await expect(readLearnerHistory(
      learner,
      "en",
      1,
      "2026-07-18T12:00:00.000Z",
    )).rejects.toThrow("learner_history.read_failed");

    const malformed = fakeClient(() => ({
      data: [{ ...historyRow(), answer_text: "must never cross the boundary" }],
      error: null,
    }));
    vi.mocked(createServerClient).mockResolvedValue(malformed.client as never);
    await expect(readLearnerHistory(
      learner,
      "en",
      1,
      "2026-07-18T12:00:00.000Z",
    )).rejects.toThrow();

    const foreign = fakeClient(() => ({
      data: [historyRow({ organization_id: OTHER_ORGANIZATION_ID })],
      error: null,
    }));
    vi.mocked(createServerClient).mockResolvedValue(foreign.client as never);
    await expect(readLearnerHistory(
      learner,
      "en",
      1,
      "2026-07-18T12:00:00.000Z",
    )).rejects.toThrow("learner_history.organization_scope_mismatch");

    const unordered = fakeClient(() => ({
      data: [
        historyRow(),
        historyRow({
          event_id: "attempt_started:01980a34-0000-7000-8000-000000000002",
          occurred_at: "2026-07-11T09:00:00.000Z",
        }),
      ],
      error: null,
    }));
    vi.mocked(createServerClient).mockResolvedValue(unordered.client as never);
    await expect(readLearnerHistory(
      learner,
      "en",
      1,
      "2026-07-18T12:00:00.000Z",
    )).rejects.toThrow("learner_history.order_mismatch");
  });
});
