import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  canRenderProtectedPage: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
  readTrainerQuestionDetail: vi.fn(),
}));

vi.mock("next/navigation", () => ({ notFound: mocks.notFound }));
vi.mock("@/app/[locale]/_data/principal", () => ({
  canRenderProtectedPage: mocks.canRenderProtectedPage,
}));
vi.mock("@/features/mentoring/server/question-workflow-data", () => ({
  readTrainerQuestionDetail: mocks.readTrainerQuestionDetail,
}));
vi.mock("@/features/mentoring/question-thread-view", () => ({
  QuestionThreadView: ({
    actions,
    question,
  }: {
    actions: ReactNode;
    question: { state: string };
  }) => (
    <div>
      <div data-testid="question-state">{question.state}</div>
      {actions}
    </div>
  ),
}));
vi.mock("@/features/mentoring/trainer-question-actions", () => ({
  ClaimQuestionAction: () => <div>claim-action</div>,
  TrainerQuestionActions: () => <div>owner-actions</div>,
}));
vi.mock("../actions", () => ({
  answerQuestionAction: vi.fn(),
  claimQuestionAction: vi.fn(),
  transferQuestionAction: vi.fn(),
}));

import { questionWorkflowCopy } from "@/features/mentoring/question-workflow-copy";

import TrainerQuestionDetailPage from "./page";

const questionId = "01980a36-0000-7000-8000-000000000001";

function workspace(state: "open" | "assigned" = "assigned") {
  return {
    question: {
      id: questionId,
      state,
      version: state === "open" ? 1 : 2,
    },
    canAct: state === "assigned",
    isOwner: state === "assigned",
    candidates: [],
  };
}

describe("TrainerQuestionDetailPage notices", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.canRenderProtectedPage.mockResolvedValue(true);
    mocks.readTrainerQuestionDetail.mockResolvedValue(workspace());
  });

  it.each(["en", "de", "ru"] as const)(
    "renders the %s claimed notice with the authoritative assigned workspace",
    async (locale) => {
      render(await TrainerQuestionDetailPage({
        params: Promise.resolve({ locale, questionId }),
        searchParams: Promise.resolve({ notice: "claimed" }),
      }));

      const copy = questionWorkflowCopy[locale].trainer;
      const status = screen.getByRole("status");
      expect(status).toHaveTextContent(copy.claimSuccessTitle);
      expect(status).toHaveTextContent(copy.claimSuccess);
      expect(status).toHaveAttribute("aria-live", "polite");
      expect(screen.getByTestId("question-state")).toHaveTextContent("assigned");
      expect(screen.getByText("owner-actions")).toBeInTheDocument();
      expect(screen.queryByText("claim-action")).not.toBeInTheDocument();
      expect(mocks.readTrainerQuestionDetail).toHaveBeenCalledWith(
        locale,
        questionId,
      );
    },
  );

  it("preserves the blocking stale-conflict alert", async () => {
    render(await TrainerQuestionDetailPage({
      params: Promise.resolve({ locale: "en", questionId }),
      searchParams: Promise.resolve({ notice: "stale" }),
    }));

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Question changed");
    expect(alert).toHaveTextContent(
      "The question changed since it was loaded. Refresh before deciding.",
    );
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("does not trust a claimed query flag when the server still reports an open question", async () => {
    mocks.readTrainerQuestionDetail.mockResolvedValueOnce(workspace("open"));

    render(await TrainerQuestionDetailPage({
      params: Promise.resolve({ locale: "en", questionId }),
      searchParams: Promise.resolve({ notice: "claimed" }),
    }));

    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.getByTestId("question-state")).toHaveTextContent("open");
    expect(screen.getByText("claim-action")).toBeInTheDocument();
    expect(screen.queryByText("owner-actions")).not.toBeInTheDocument();
  });
});
