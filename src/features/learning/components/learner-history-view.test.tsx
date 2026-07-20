import type { Route } from "next";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { learnerHistoryCopy } from "../learner-history-copy";
import type { LearnerHistoryPage } from "../model/learner-history";
import { LearnerHistoryView } from "./learner-history-view";

const history: LearnerHistoryPage = {
  page: 2,
  hasPreviousPage: true,
  hasNextPage: true,
  reachedPageLimit: false,
  snapshotAt: "2026-07-18T12:00:00.000Z",
  items: [
    {
      id: "review_accepted:01980a38-0000-7000-8000-000000000001",
      kind: "review_accepted",
      occurredAt: "2026-07-17T11:00:00.000Z",
      courseTitle: "Практическое тестирование ПО",
      taskTitle: "Анализ входа",
      ordinal: null,
      target: {
        type: "course",
        id: "01980a20-0000-7000-8000-000000000001",
      },
    },
    {
      id: "task_resubmitted:01980a36-0000-7000-8000-000000000001",
      kind: "task_resubmitted",
      occurredAt: "2026-07-16T11:00:00.000Z",
      courseTitle: "Практическое тестирование ПО",
      taskTitle: null,
      ordinal: 2,
      target: null,
    },
  ],
};

describe("LearnerHistoryView", () => {
  it("renders a localized semantic timeline, privacy notice, context, and stable links", () => {
    render(
      <LearnerHistoryView
        formatDateTime={(value) => value}
        history={history}
        labels={learnerHistoryCopy.ru}
        pageHref={(page, snapshot) =>
          `/ru/learn/history?page=${page}&snapshot=${encodeURIComponent(snapshot)}` as Route
        }
        targetHref={(target) =>
          target.type === "course"
            ? `/ru/learn/courses/${target.id}` as Route
            : "/ru/learn/certificates" as Route
        }
      />,
    );

    expect(
      screen.getByRole("heading", { name: "История обучения" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Минимизация персональных данных" }),
    ).toBeInTheDocument();
    const list = screen.getByRole("list");
    expect(within(list).getAllByRole("listitem")).toHaveLength(2);
    expect(screen.getByText("Работа принята")).toBeInTheDocument();
    expect(screen.getByText("Анализ входа")).toBeInTheDocument();
    expect(screen.getByText("Название задания недоступно")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Открыть связанную запись" }),
    ).toHaveAttribute(
      "href",
      "/ru/learn/courses/01980a20-0000-7000-8000-000000000001",
    );
    expect(
      screen.getByRole("link", { name: "Предыдущая страница" }),
    ).toHaveAttribute(
      "href",
      "/ru/learn/history?page=1&snapshot=2026-07-18T12%3A00%3A00.000Z",
    );
    expect(
      screen.getByRole("link", { name: "Следующая страница" }),
    ).toHaveAttribute(
      "href",
      "/ru/learn/history?page=3&snapshot=2026-07-18T12%3A00%3A00.000Z",
    );
  });

  it("renders the localized empty state and disabled pagination boundaries", () => {
    render(
      <LearnerHistoryView
        formatDateTime={(value) => value}
        history={{
          ...history,
          page: 1,
          hasPreviousPage: false,
          hasNextPage: false,
          items: [],
        }}
        labels={learnerHistoryCopy.de}
        pageHref={() => "/de/learn/history" as Route}
        targetHref={() => "/de/learn" as Route}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "Noch kein Lernverlauf" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
    expect(screen.getByText("Vorherige Seite")).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    expect(screen.getByText("Nächste Seite")).toHaveAttribute(
      "aria-disabled",
      "true",
    );
  });

  it("never renders authored learner, trainer, or contact content from its event contract", () => {
    const { container } = render(
      <LearnerHistoryView
        formatDateTime={(value) => value}
        history={history}
        labels={learnerHistoryCopy.en}
        pageHref={() => "/en/learn/history" as Route}
        targetHref={() => "/en/learn" as Route}
      />,
    );
    expect(container.textContent).not.toContain("learner@example.test");
    expect(container.textContent).not.toContain("Trainer private comment");
    expect(container.textContent).not.toContain("My submitted answer");
  });
});
