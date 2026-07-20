import { render, screen } from "@testing-library/react";
import type { Route } from "next";
import { describe, expect, it } from "vitest";

import { CourseWorkspace, type CourseWorkspaceLabels } from "./course-workspace";

const labels: CourseWorkspaceLabels = {
  backToDashboard: "Back",
  cohort: "Cohort",
  progress: "Course progress",
  completed: (value, total) => `${value} of ${total}`,
  progression: { scheduled: "Scheduled", flexible: "Flexible" },
  states: {
    available: "Available",
    in_progress: "In progress",
    submitted: "Submitted",
    revision_required: "Revision required",
    accepted: "Accepted",
    locked: "Locked",
  },
  lockedBecause: "Why this task is locked",
  lockReasons: {
    schedule: "Outside its schedule.",
    entitlement: "Entitlement required.",
    configuration: "Invalid progression rule.",
    required_task: "Complete the earlier task.",
    history: "History is read only.",
    requiredSkill: (current, minimum) =>
      `Need ${minimum}%; current ${current}%.`,
  },
  availableFrom: "Available from",
  dueAt: "Due",
  expectedTimeLabel: "Expected time",
  expectedTime: (value) => `${value} minutes`,
  openTask: "Open task",
  historyTitle: "Completed course history",
  historyDescription: "This record is read only.",
  emptyTitle: "No activities",
  emptyDescription: "Nothing is available.",
};

describe("CourseWorkspace", () => {
  it("renders progression and only links activities that may be opened", () => {
    render(
      <CourseWorkspace
        course={{
          courseId: "01980a20-0000-7000-8000-000000000001",
          enrollmentId: "01980a33-0000-7000-8000-000000000001",
          cohortId: "01980a30-0000-7000-8000-000000000001",
          accessMode: "active",
          title: "Practical testing",
          summary: "Practice real workflows.",
          cohortName: "Release 0",
          progressionMode: "scheduled",
          completedActivities: 1,
          totalActivities: 3,
          stages: [{
            id: "01980a23-0000-7000-8000-000000000001",
            title: "Analysis",
            description: "Analyze risks.",
            position: 0,
            activities: [
              {
                id: "01980a26-0000-7000-8000-000000000001",
                title: "Login flow",
                description: "Design tests.",
                position: 0,
                state: "accepted",
                lockReasons: [],
                expectedMinutes: 45,
              },
              {
                id: "01980a26-0000-7000-8000-000000000002",
                title: "Available task",
                description: "Start testing.",
                position: 1,
                state: "available",
                lockReasons: [],
              },
              {
                id: "01980a26-0000-7000-8000-000000000003",
                title: "Locked task",
                description: "Wait for activation.",
                position: 2,
                state: "locked",
                lockReasons: [{
                  code: "required_skill",
                  current_basis_points: 3500,
                  minimum_basis_points: 6000,
                }],
              },
            ],
          }],
        }}
        dashboardHref={"/en/learn" as Route}
        formatDateTime={(value) => value}
        labels={labels}
        taskHref={(taskId) => `/en/learn/tasks/${taskId}` as Route}
      />,
    );

    expect(screen.getByRole("heading", { name: "Practical testing" })).toBeInTheDocument();
    expect(screen.getByRole("progressbar")).toHaveAttribute("value", "1");
    expect(screen.getAllByRole("link", { name: "Open task" })).toHaveLength(1);
    expect(screen.getByRole("link", { name: "Open task" })).toHaveAttribute(
      "href",
      "/en/learn/tasks/01980a26-0000-7000-8000-000000000002",
    );
    expect(screen.getByText("Accepted")).toBeInTheDocument();
    expect(screen.getByText("Locked")).toBeInTheDocument();
    expect(screen.getByText("Why this task is locked")).toBeInTheDocument();
    expect(screen.getByText("Need 60%; current 35%.")).toBeInTheDocument();
  });

  it("renders completed history as read-only and suppresses every task-entry link", () => {
    render(
      <CourseWorkspace
        course={{
          courseId: "01980a20-0000-7000-8000-000000000001",
          enrollmentId: "01980a33-0000-7000-8000-000000000001",
          cohortId: "01980a30-0000-7000-8000-000000000001",
          accessMode: "history",
          title: "Completed testing",
          summary: "Immutable history.",
          cohortName: "Release 0",
          progressionMode: "scheduled",
          completedActivities: 1,
          totalActivities: 1,
          stages: [{
            id: "01980a23-0000-7000-8000-000000000001",
            title: "Analysis",
            description: "Historical stage.",
            position: 0,
            activities: [{
              id: "01980a26-0000-7000-8000-000000000001",
              title: "Accepted task",
              description: "Historical task.",
              position: 0,
              state: "accepted",
              lockReasons: [],
            }],
          }],
        }}
        dashboardHref={"/en/learn" as Route}
        formatDateTime={(value) => value}
        labels={labels}
        taskHref={(taskId) => `/en/learn/tasks/${taskId}` as Route}
      />,
    );

    expect(screen.getByRole("note")).toHaveAccessibleName("Completed course history");
    expect(screen.getByText("This record is read only.")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Open task" })).not.toBeInTheDocument();
    expect(screen.getByText("Accepted")).toBeInTheDocument();
  });

  it("renders an explicit empty state", () => {
    render(
      <CourseWorkspace
        course={{
          courseId: "01980a20-0000-7000-8000-000000000001",
          enrollmentId: "01980a33-0000-7000-8000-000000000001",
          cohortId: "01980a30-0000-7000-8000-000000000001",
          accessMode: "active",
          title: "Empty course",
          summary: "",
          cohortName: "Release 0",
          progressionMode: "flexible",
          completedActivities: 0,
          totalActivities: 0,
          stages: [],
        }}
        dashboardHref={"/en/learn" as Route}
        formatDateTime={(value) => value}
        labels={labels}
        taskHref={(taskId) => `/en/learn/tasks/${taskId}` as Route}
      />,
    );
    expect(screen.getByRole("heading", { name: "No activities" })).toBeInTheDocument();
  });
});
