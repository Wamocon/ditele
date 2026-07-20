import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { trainerGroupsCopy, trainerProgressCopy } from "../trainer-read-copy";
import type {
  TrainerGroupListItem,
  TrainerLearnerProgressItem,
} from "../trainer-read-model";
import { TrainerGroupsView } from "./trainer-groups-view";
import { TrainerProgressView } from "./trainer-progress-view";

const group: TrainerGroupListItem = {
  id: "01980a30-0000-7000-8000-000000000001",
  courseId: "01980a20-0000-7000-8000-000000000001",
  courseTitle: "Praktisches Testen",
  courseTitleLocale: "de",
  courseTitleUsesFallback: false,
  name: "Release cohort",
  state: "active",
  progressionMode: "scheduled",
  startsAt: "2026-07-17T08:00:00.000Z",
  endsAt: null,
  learnerCount: 1,
  trainerCount: 1,
};

const progress: TrainerLearnerProgressItem = {
  cohortId: group.id,
  cohortName: group.name,
  courseTitle: group.courseTitle,
  learnerId: "01980a00-0000-7000-8000-000000000001",
  learnerName: "Lena Learner",
  assignedAt: "2026-07-17T08:00:00.000Z",
  enrollmentStatus: "recorded",
  acceptedAttemptCount: 1,
  activeAttemptCount: 2,
  totalAttemptCount: 3,
  lastActivityAt: "2026-07-17T11:00:00.000Z",
};

describe("trainer cohort read views", () => {
  it("renders the localized group facts as semantic cards", () => {
    render(
      <TrainerGroupsView
        formatDateTime={(value) => value}
        groups={[group]}
        labels={trainerGroupsCopy.de}
        locale="de"
      />,
    );

    expect(
      screen.getByRole("heading", { name: "Zugewiesene Gruppen" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Release cohort" })).toBeInTheDocument();
    expect(screen.getByText("Praktisches Testen")).toBeInTheDocument();
    expect(screen.getByText("Ohne Enddatum")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Gruppenbereich öffnen" }),
    ).toHaveAttribute(
      "href",
      `/de/trainer/groups/${group.id}`,
    );
  });

  it("renders a localized empty group state", () => {
    render(
      <TrainerGroupsView
        formatDateTime={(value) => value}
        groups={[]}
        labels={trainerGroupsCopy.ru}
        locale="ru"
      />,
    );
    expect(
      screen.getByRole("heading", { name: "Нет назначенных групп" }),
    ).toBeInTheDocument();
  });

  it("renders real attempt counts in desktop and mobile progress projections", () => {
    render(
      <TrainerProgressView
        formatDateTime={(value) => value}
        items={[progress]}
        labels={trainerProgressCopy.en}
      />,
    );

    expect(screen.getByRole("table", { name: "Learner progress" })).toBeInTheDocument();
    expect(screen.getAllByText("Lena Learner")).toHaveLength(2);
    expect(screen.getAllByText("Enrollment recorded")).toHaveLength(2);
    expect(screen.getAllByText("3")).toHaveLength(2);
  });

  it("renders a localized empty progress state", () => {
    render(
      <TrainerProgressView
        formatDateTime={(value) => value}
        items={[]}
        labels={trainerProgressCopy.de}
      />,
    );
    expect(
      screen.getByRole("heading", { name: "Keine Lernenden-Zuweisungen" }),
    ).toBeInTheDocument();
  });
});
