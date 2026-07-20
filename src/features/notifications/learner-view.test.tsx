import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { learnerNotificationCopy } from "./learner-copy";
import { learnerNotificationActionInitialState } from "./learner-model";
import { LearnerNotificationCenterView } from "./learner-view";

const action = vi.fn().mockResolvedValue(learnerNotificationActionInitialState);
const preferences = ["enrollment", "review", "question", "submission", "certificate"].flatMap(
  (eventFamily) => ["in_app", "email", "push"].map((channel) => ({
    eventFamily,
    channel,
    enabled: channel !== "push",
    rowVersion: 0,
  })),
) as Parameters<typeof LearnerNotificationCenterView>[0]["center"]["preferences"];

describe("LearnerNotificationCenterView", () => {
  it.each([
    ["en", "Cohort started", "Task schedule updated"],
    ["de", "Lerngruppe gestartet", "Aufgabenzeitplan geändert"],
    ["ru", "Обучение в группе началось", "Расписание задания изменено"],
  ] as const)(
    "provides dedicated %s copy for lifecycle and schedule events",
    (locale, lifecycleTitle, scheduleTitle) => {
      expect(learnerNotificationCopy[locale].kinds.cohort_started)
        .toBe(lifecycleTitle);
      expect(learnerNotificationCopy[locale].kinds.task_schedule_updated)
        .toBe(scheduleTitle);
      expect(learnerNotificationCopy[locale].kindDescriptions.cohort_started)
        .not.toBe(learnerNotificationCopy[locale].kindDescriptions.unknown);
      expect(learnerNotificationCopy[locale].kindDescriptions.task_schedule_updated)
        .not.toBe(learnerNotificationCopy[locale].kindDescriptions.unknown);
    },
  );

  it("renders known updates, safe fallback, real read controls, and provider status", () => {
    render(
      <LearnerNotificationCenterView
        center={{
          items: [
            {
              id: "01980c10-0000-7000-8000-000000000001",
              kind: "question_answered",
              readAt: null,
              createdAt: "2026-07-18T10:00:00.000Z",
              rowVersion: 1,
              target: {
                type: "question",
                id: "01980c11-0000-7000-8000-000000000001",
              },
              enrollmentState: null,
              reviewDecision: null,
              cohortState: null,
            },
            {
              id: "01980c10-0000-7000-8000-000000000002",
              kind: "unknown",
              readAt: "2026-07-18T11:00:00.000Z",
              createdAt: "2026-07-18T09:00:00.000Z",
              rowVersion: 2,
              target: null,
              enrollmentState: null,
              reviewDecision: null,
              cohortState: null,
            },
          ],
          preferences,
          page: 1,
          total: 22,
          totalPages: 2,
          unreadCount: 1,
          snapshotAt: "2026-07-18T12:00:00.000Z",
          timezone: "Europe/Berlin",
        }}
        idempotencyKeys={{
          markAll: "notification-read-all-test-0001",
          markRead: {
            "01980c10-0000-7000-8000-000000000001":
              "notification-read-test-0001",
            "01980c10-0000-7000-8000-000000000002":
              "notification-read-test-0002",
          },
          preferences: {
            enrollment: "notification-pref-enrollment-0001",
            review: "notification-pref-review-0001",
            question: "notification-pref-question-0001",
            submission: "notification-pref-submission-0001",
            certificate: "notification-pref-certificate-0001",
          },
        }}
        labels={learnerNotificationCopy.en}
        locale="en"
        markAllAction={action}
        markReadAction={action}
        preferenceAction={action}
      />,
    );

    expect(screen.getByRole("heading", { name: "Question answered" }))
      .toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Account update" }))
      .toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open update" }))
      .toHaveAttribute(
        "href",
        "/en/learn/questions/01980c11-0000-7000-8000-000000000001",
      );
    expect(screen.getAllByRole("button", { name: "Mark as read" }))
      .toHaveLength(1);
    expect(screen.getByRole("button", { name: "Mark all as read" }))
      .toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Delivery availability" }))
      .toBeInTheDocument();
    expect(screen.getAllByRole("group")).toHaveLength(5);
    expect(screen.getAllByRole("button", { name: "Save preferences" }))
      .toHaveLength(5);
    expect(screen.getByRole("link", { name: "Next page" })).toHaveAttribute(
      "href",
      "/en/learn/notifications?page=2&snapshot=2026-07-18T12%3A00%3A00.000Z",
    );
  });

  it("renders localized cohort and schedule copy with only proven-safe course actions", () => {
    render(
      <LearnerNotificationCenterView
        center={{
          items: [
            {
              id: "01980c10-0000-7000-8000-000000000011",
              kind: "cohort_started",
              readAt: "2026-07-18T11:00:00.000Z",
              createdAt: "2026-07-18T10:00:00.000Z",
              rowVersion: 2,
              target: {
                type: "course",
                id: "01980c12-0000-7000-8000-000000000001",
              },
              enrollmentState: null,
              reviewDecision: null,
              cohortState: "active",
            },
            {
              id: "01980c10-0000-7000-8000-000000000012",
              kind: "cohort_completed",
              readAt: "2026-07-18T11:00:00.000Z",
              createdAt: "2026-07-18T09:00:00.000Z",
              rowVersion: 3,
              target: null,
              enrollmentState: null,
              reviewDecision: null,
              cohortState: "completed",
            },
            {
              id: "01980c10-0000-7000-8000-000000000013",
              kind: "cohort_cancelled",
              readAt: "2026-07-18T11:00:00.000Z",
              createdAt: "2026-07-18T08:00:00.000Z",
              rowVersion: 4,
              target: null,
              enrollmentState: null,
              reviewDecision: null,
              cohortState: "cancelled",
            },
            {
              id: "01980c10-0000-7000-8000-000000000014",
              kind: "task_schedule_updated",
              readAt: "2026-07-18T11:00:00.000Z",
              createdAt: "2026-07-18T07:00:00.000Z",
              rowVersion: 2,
              target: null,
              enrollmentState: null,
              reviewDecision: null,
              cohortState: null,
            },
          ],
          preferences,
          page: 1,
          total: 4,
          totalPages: 1,
          unreadCount: 0,
          snapshotAt: "2026-07-18T12:00:00.000Z",
          timezone: "Europe/Berlin",
        }}
        idempotencyKeys={{
          markAll: "notification-read-all-test-0002",
          markRead: {},
          preferences: {
            enrollment: "notification-pref-enrollment-0002",
            review: "notification-pref-review-0002",
            question: "notification-pref-question-0002",
            submission: "notification-pref-submission-0002",
            certificate: "notification-pref-certificate-0002",
          },
        }}
        labels={learnerNotificationCopy.de}
        locale="de"
        markAllAction={action}
        markReadAction={action}
        preferenceAction={action}
      />,
    );

    expect(screen.getByRole("heading", { name: "Lerngruppe gestartet" }))
      .toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Lerngruppe abgeschlossen" }))
      .toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Lerngruppe abgebrochen" }))
      .toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Aufgabenzeitplan geändert" }))
      .toBeInTheDocument();
    expect(screen.getByText("Aktiv")).toBeInTheDocument();
    expect(screen.getByText("Abgeschlossen")).toBeInTheDocument();
    expect(screen.getByText("Abgebrochen")).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "Update öffnen" }))
      .toHaveLength(1);
    expect(screen.getByRole("link", { name: "Update öffnen" }))
      .toHaveAttribute(
        "href",
        "/de/learn/courses/01980c12-0000-7000-8000-000000000001",
      );
  });
});
