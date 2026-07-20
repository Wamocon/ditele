import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { cohortManagementCopy } from "../cohort-management-copy";
import type { CohortManagementDetail } from "../cohort-management-model";
import { cohortCommandInitialState } from "../cohort-management-validation";
import { CohortManagementView } from "./cohort-management-view";

const detail: CohortManagementDetail = {
  id: "01980a30-0000-7000-8000-000000000001",
  organizationId: "01980a10-0000-7000-8000-000000000001",
  courseId: "01980a20-0000-7000-8000-000000000001",
  contentVersionId: "01980a22-0000-7000-8000-000000000001",
  courseTitle: "Praktisches Testen",
  courseTitleLocale: "de",
  courseTitleUsesFallback: false,
  publishedVersionNumber: 1,
  pinnedVersionState: "published",
  name: "Release cohort",
  state: "active",
  progressionMode: "scheduled",
  startsAt: "2026-07-18T08:00:00.000Z",
  endsAt: null,
  completedAt: null,
  capacity: 25,
  rowVersion: 2,
  updatedAt: "2026-07-18T08:00:00.000Z",
  learnerCount: 8,
  trainerCount: 2,
  canStart: false,
  canComplete: true,
  canCancel: false,
  canManageSchedules: true,
  schedules: [
    {
      id: "01980a32-0000-7000-8000-000000000001",
      taskId: "01980a26-0000-7000-8000-000000000001",
      taskTitle: "Login analysieren",
      taskTitleLocale: "de",
      taskTitleUsesFallback: false,
      taskKind: "practical",
      stageTitle: "Testanalyse",
      stageTitleLocale: "de",
      stageTitleUsesFallback: false,
      availableFrom: "2026-07-18T08:00:00.000Z",
      dueAt: "2026-07-25T18:00:00.000Z",
      changeReason: "Initial schedule",
      updatedAt: "2026-07-18T08:00:00.000Z",
      rowVersion: 1,
    },
  ],
};

const action = async () => cohortCommandInitialState;

describe("cohort management view", () => {
  it("renders trainer-authorized completion and schedule forms without cancellation", () => {
    render(
      <CohortManagementView
        detail={detail}
        labels={cohortManagementCopy.de}
        locale="de"
        notice={null}
        perspective="trainer"
        scheduleAction={action}
        transitionAction={action}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "Release cohort" }),
    ).toBeInTheDocument();
    expect(screen.getAllByText("Veröffentlichte Version 1")).toHaveLength(2);
    expect(
      screen.getByRole("button", { name: "Gruppe abschließen" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Gruppe abbrechen" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Zeitplan speichern" }),
    ).toBeInTheDocument();
  });

  it("renders an explicit stale notice and manager cancellation command", () => {
    render(
      <CohortManagementView
        detail={{ ...detail, canCancel: true }}
        labels={cohortManagementCopy.en}
        locale="en"
        notice="stale"
        perspective="admin"
        scheduleAction={action}
        transitionAction={action}
      />,
    );
    expect(screen.getByRole("status")).toHaveTextContent(
      /record changed before your command/i,
    );
    expect(
      screen.getByRole("button", { name: "Cancel cohort" }),
    ).toBeInTheDocument();
  });

  it("renders terminal cohorts without any mutation controls", () => {
    render(
      <CohortManagementView
        detail={{
          ...detail,
          state: "completed",
          completedAt: "2026-07-18T12:00:00.000Z",
          canComplete: false,
          canCancel: false,
          canManageSchedules: false,
        }}
        labels={cohortManagementCopy.ru}
        locale="ru"
        notice="completed"
        perspective="trainer"
        scheduleAction={action}
        transitionAction={action}
      />,
    );
    expect(screen.getByText(/не может быть открыта снова/i)).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
