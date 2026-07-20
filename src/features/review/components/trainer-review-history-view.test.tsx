import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { Route } from "next";

import { trainerHistoryCopy } from "../trainer-history-copy";
import type { TrainerReviewHistoryItem } from "../trainer-history-model";
import { TrainerReviewHistoryView } from "./trainer-review-history-view";

const item: TrainerReviewHistoryItem = {
  id: "01980a38-0000-7000-8000-000000000001",
  submissionId: "01980a35-0000-7000-8000-000000000001",
  learnerName: "Lena Learner",
  cohortName: "Release cohort",
  courseTitle: "Практическое тестирование ПО",
  taskTitle: "Анализ входа",
  decision: "accepted",
  comment: "Доказательства проверены.",
  decidedAt: "2026-07-17T11:00:00.000Z",
};

describe("TrainerReviewHistoryView", () => {
  it("renders an accessible localized immutable history record", () => {
    render(
      <TrainerReviewHistoryView
        formatDateTime={(value) => value}
        items={[item]}
        labels={trainerHistoryCopy.ru}
        limit={100}
        submissionHref={(id) => `/ru/trainer/submissions/${id}` as Route}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "История проверок" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Задание: Анализ входа" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Доказательства проверены.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Открыть запись работы" })).toHaveAttribute(
      "href",
      `/ru/trainer/submissions/${item.submissionId}`,
    );
  });

  it("renders the localized empty state", () => {
    render(
      <TrainerReviewHistoryView
        formatDateTime={(value) => value}
        items={[]}
        labels={trainerHistoryCopy.en}
        limit={100}
        submissionHref={(id) => `/en/trainer/submissions/${id}` as Route}
      />,
    );
    expect(
      screen.getByRole("heading", { name: "No completed reviews" }),
    ).toBeInTheDocument();
  });
});
