import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { adminTasksCopy } from "./copy";
import type { AdminTaskListItem } from "./model";
import { TaskInventoryView } from "./views";

const task: AdminTaskListItem = {
  id: "01980a26-0000-7000-8000-000000000001",
  title: "Analyze login risks",
  resolvedLocale: "en",
  usedFallback: false,
  completeLocales: ["en", "de", "ru"],
  state: "active",
  kind: "practical",
  position: 0,
  stagePosition: 0,
  stageTitle: "Risk analysis",
  courseId: "01980a20-0000-7000-8000-000000000001",
  courseTitle: "Practical testing",
  versionNumber: 1,
  versionState: "published",
  expectedMinutes: 45,
  hasTarget: true,
  hasAssessment: true,
  optionCount: 2,
  hintCount: 1,
  rowVersion: 1,
  updatedAt: "2026-07-18T10:00:00.000Z",
};

describe("TaskInventoryView", () => {
  it("renders a real task projection and course navigation without fake edit actions", () => {
    render(
      <TaskInventoryView
        items={[task]}
        labels={adminTasksCopy.en}
        locale="en"
        page={1}
        total={1}
        totalPages={1}
      />,
    );
    expect(screen.getByRole("heading", { name: task.title })).toBeInTheDocument();
    expect(screen.getByText("Testing target configured")).toBeInTheDocument();
    expect(screen.getByText("Assessment configured")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open course" })).toHaveAttribute(
      "href",
      `/en/admin/courses/${task.courseId}`,
    );
    expect(screen.queryByRole("button", { name: /edit/i })).not.toBeInTheDocument();
  });

  it("renders explicit empty, pagination, and read-only capability states", () => {
    render(
      <TaskInventoryView
        items={[]}
        labels={adminTasksCopy.en}
        locale="en"
        page={1}
        total={0}
        totalPages={1}
      />,
    );
    expect(screen.getByRole("heading", { name: "No tasks available" })).toBeInTheDocument();
    expect(screen.getByText("Page 1 of 1")).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("heading", { name: "Task commands remain version-controlled" })).toBeInTheDocument();
  });
});
