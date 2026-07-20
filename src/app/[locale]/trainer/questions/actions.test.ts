import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createServerClient: vi.fn(),
  getPrincipal: vi.fn(),
  redirect: vi.fn(() => {
    throw new Error("NEXT_REDIRECT");
  }),
  revalidatePath: vi.fn(),
}));

vi.mock("@/app/[locale]/_data/principal", () => ({
  getPrincipal: mocks.getPrincipal,
}));
vi.mock("@/shared/database/server", () => ({
  createServerClient: mocks.createServerClient,
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));

import { questionActionInitialState } from "@/features/mentoring/question-workflow-validation";
import type { Principal } from "@/shared/auth/types";

import { claimQuestionAction } from "./actions";

const questionId = "01980a36-0000-7000-8000-000000000001";
const cohortId = "01980a30-0000-7000-8000-000000000001";

const trainer: Principal = {
  userId: "01980a00-0000-7000-8000-000000000002",
  sessionId: "trainer-session",
  organizationId: "01980a10-0000-7000-8000-000000000001",
  primaryRole: "trainer",
  roles: ["trainer"],
  permissions: ["question.manage"],
  cohortIds: [cohortId],
};

function claimForm() {
  const form = new FormData();
  form.set("questionId", questionId);
  form.set("expectedVersion", "1");
  form.set("idempotencyKey", "question-claim:test-0001");
  return form;
}

function clientFixture({
  question = {
    id: questionId,
    cohort_id: cohortId,
    state: "open",
    row_version: 1,
  },
  rpcError = null,
}: {
  readonly question?: unknown;
  readonly rpcError?: unknown;
} = {}) {
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    maybeSingle: vi.fn().mockResolvedValue({ data: question, error: null }),
  };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  return {
    from: vi.fn(() => query),
    rpc: vi.fn().mockResolvedValue({ data: {}, error: rpcError }),
  };
}

describe("claimQuestionAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getPrincipal.mockResolvedValue(trainer);
  });

  it("redirects a committed claim to a changed URL after invalidating every reader", async () => {
    const client = clientFixture();
    mocks.createServerClient.mockResolvedValue(client);

    await expect(
      claimQuestionAction("en", questionActionInitialState, claimForm()),
    ).rejects.toThrow("NEXT_REDIRECT");

    expect(client.rpc).toHaveBeenCalledWith(
      "claim_question",
      expect.objectContaining({
        p_expected_version: 1,
        p_idempotency_key: "question-claim:test-0001",
        p_question_id: questionId,
      }),
    );
    expect(mocks.revalidatePath).toHaveBeenCalledWith(
      `/en/trainer/questions/${questionId}`,
    );
    expect(mocks.redirect).toHaveBeenCalledWith(
      `/en/trainer/questions/${questionId}?notice=claimed`,
    );
  });

  it("preserves the stale redirect when the preflight snapshot has changed", async () => {
    const client = clientFixture({
      question: {
        id: questionId,
        cohort_id: cohortId,
        state: "assigned",
        row_version: 2,
      },
    });
    mocks.createServerClient.mockResolvedValue(client);

    await expect(
      claimQuestionAction("en", questionActionInitialState, claimForm()),
    ).rejects.toThrow("NEXT_REDIRECT");

    expect(client.rpc).not.toHaveBeenCalled();
    expect(mocks.redirect).toHaveBeenCalledWith(
      `/en/trainer/questions/${questionId}?notice=stale`,
    );
  });

  it("preserves the stale redirect for an RPC compare-and-swap conflict", async () => {
    const client = clientFixture({ rpcError: { code: "40001" } });
    mocks.createServerClient.mockResolvedValue(client);

    await expect(
      claimQuestionAction("de", questionActionInitialState, claimForm()),
    ).rejects.toThrow("NEXT_REDIRECT");

    expect(mocks.redirect).toHaveBeenCalledWith(
      `/de/trainer/questions/${questionId}?notice=stale`,
    );
  });
});
