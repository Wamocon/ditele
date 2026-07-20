import { describe, expect, it } from "vitest";

import {
  buildLearnerNotificationPreferences,
  parseSetNotificationPreferenceForm,
  projectLearnerNotification,
} from "./learner-model";

const baseRow = {
  id: "01980c10-0000-7000-8000-000000000001",
  state: "delivered",
  read_at: null,
  created_at: "2026-07-18 10:00:00+00",
  row_version: 1,
};

describe("learner notification model", () => {
  it("maps only a known template and validated payload to a safe target", () => {
    expect(projectLearnerNotification({
      ...baseRow,
      event_type: "question.answered",
      template_key: "notifications.question_answered",
      payload: {
        question_id: "01980c11-0000-7000-8000-000000000001",
        hidden_answer: "must never be rendered",
      },
    })).toMatchObject({
      kind: "question_answered",
      target: {
        type: "question",
        id: "01980c11-0000-7000-8000-000000000001",
      },
    });
  });

  it("fails closed for unknown templates and malformed known payloads", () => {
    const unknown = projectLearnerNotification({
      ...baseRow,
      event_type: "custom.event",
      template_key: "<script>alert(1)</script>",
      payload: { html: "<img src=x onerror=alert(1)>" },
    });
    const malformed = projectLearnerNotification({
      ...baseRow,
      event_type: "question.answered",
      template_key: "notifications.question_answered",
      payload: { question_id: "not-a-uuid" },
    });
    expect(unknown).toMatchObject({ kind: "unknown", target: null });
    expect(malformed).toMatchObject({ kind: "unknown", target: null });
    expect(JSON.stringify(unknown)).not.toContain("script");
    expect(JSON.stringify(unknown)).not.toContain("onerror");
  });

  it("projects a started cohort to a safe course action and strips extra payload fields", () => {
    const notification = projectLearnerNotification({
      ...baseRow,
      event_type: "cohort.started",
      template_key: "notifications.cohort_started",
      payload: {
        cohort_id: "01980c12-0000-7000-8000-000000000001",
        course_id: "01980c13-0000-7000-8000-000000000001",
        state: "active",
        row_version: 2,
        reason: "private lifecycle reason",
      },
    });

    expect(notification).toMatchObject({
      kind: "cohort_started",
      cohortState: "active",
      target: {
        type: "course",
        id: "01980c13-0000-7000-8000-000000000001",
      },
    });
    expect(JSON.stringify(notification)).not.toContain("private lifecycle reason");
  });

  it.each([
    ["cohort.completed", "notifications.cohort_completed", "completed"],
    ["cohort.cancelled", "notifications.cohort_cancelled", "cancelled"],
  ] as const)(
    "projects %s as a non-actionable named cohort state",
    (eventType, templateKey, state) => {
      expect(projectLearnerNotification({
        ...baseRow,
        event_type: eventType,
        template_key: templateKey,
        payload: {
          cohort_id: "01980c12-0000-7000-8000-000000000001",
          course_id: "01980c13-0000-7000-8000-000000000001",
          state,
          row_version: 3,
        },
      })).toMatchObject({
        kind: state === "completed" ? "cohort_completed" : "cohort_cancelled",
        cohortState: state,
        target: null,
      });
    },
  );

  it("projects schedule events without exposing raw dates or inventing an action", () => {
    const created = projectLearnerNotification({
      ...baseRow,
      event_type: "task_schedule.created",
      template_key: "notifications.task_schedule_created",
      payload: {
        cohort_id: "01980c12-0000-7000-8000-000000000001",
        task_id: "01980c14-0000-7000-8000-000000000001",
        course_id: "01980c13-0000-7000-8000-000000000001",
        row_version: 1,
        available_from: "2026-07-18T10:00:00Z",
      },
    });
    const updated = projectLearnerNotification({
      ...baseRow,
      event_type: "task_schedule.updated",
      template_key: "notifications.task_schedule_updated",
      payload: {
        cohort_id: "01980c12-0000-7000-8000-000000000001",
        task_id: "01980c14-0000-7000-8000-000000000001",
        row_version: 2,
        available_from: "2026-07-19T10:00:00Z",
        due_at: "2026-07-20T10:00:00Z",
      },
    });

    expect(created).toMatchObject({
      kind: "task_schedule_created",
      target: {
        type: "course",
        id: "01980c13-0000-7000-8000-000000000001",
      },
    });
    expect(updated).toMatchObject({
      kind: "task_schedule_updated",
      target: null,
    });
    expect(JSON.stringify([created, updated])).not.toContain("available_from");
    expect(JSON.stringify([created, updated])).not.toContain("due_at");
  });

  it.each([
    {
      event_type: "cohort.started",
      template_key: "notifications.cohort_completed",
      payload: {
        cohort_id: "01980c12-0000-7000-8000-000000000001",
        course_id: "01980c13-0000-7000-8000-000000000001",
        state: "active",
        row_version: 1,
      },
    },
    {
      event_type: "cohort.started",
      template_key: "notifications.cohort_started",
      payload: {
        cohort_id: "01980c12-0000-7000-8000-000000000001",
        course_id: "01980c13-0000-7000-8000-000000000001",
        state: "completed",
        row_version: 1,
      },
    },
    {
      event_type: "task_schedule.created",
      template_key: "notifications.task_schedule_updated",
      payload: {
        cohort_id: "01980c12-0000-7000-8000-000000000001",
        task_id: "01980c14-0000-7000-8000-000000000001",
        row_version: 1,
      },
    },
    {
      event_type: "task_schedule.created",
      template_key: "notifications.task_schedule_created",
      payload: {
        cohort_id: "01980c12-0000-7000-8000-000000000001",
        task_id: "01980c14-0000-7000-8000-000000000001",
        course_id: "not-a-uuid",
        row_version: 1,
      },
    },
    {
      event_type: "task_schedule.created",
      template_key: "notifications.task_schedule_created",
      payload: {
        cohort_id: "not-a-uuid",
        task_id: "01980c14-0000-7000-8000-000000000001",
        row_version: 0,
      },
    },
  ])("fails closed for malformed or mismatched lifecycle payloads", (row) => {
    expect(projectLearnerNotification({ ...baseRow, ...row })).toMatchObject({
      kind: "unknown",
      target: null,
      cohortState: null,
    });
  });

  it("builds a complete preference matrix with conservative channel defaults", () => {
    const preferences = buildLearnerNotificationPreferences([
      { event_family: "review", channel: "email", enabled: false, row_version: 3 },
    ]);
    expect(preferences).toHaveLength(15);
    expect(preferences.find((item) =>
      item.eventFamily === "review" && item.channel === "email"
    )).toEqual({
      eventFamily: "review",
      channel: "email",
      enabled: false,
      rowVersion: 3,
    });
    expect(preferences.find((item) =>
      item.eventFamily === "certificate" && item.channel === "push"
    )).toMatchObject({ enabled: false, rowVersion: 0 });
  });

  it("parses all three preference channels and optimistic versions", () => {
    const formData = new FormData();
    formData.set("eventFamily", "question");
    formData.set("inAppEnabled", "on");
    formData.set("pushEnabled", "on");
    formData.set("expectedInAppVersion", "1");
    formData.set("expectedEmailVersion", "0");
    formData.set("expectedPushVersion", "2");
    formData.set("idempotencyKey", "notification-model-test-0001");
    expect(parseSetNotificationPreferenceForm(formData)).toEqual({
      eventFamily: "question",
      inAppEnabled: true,
      emailEnabled: false,
      pushEnabled: true,
      expectedInAppVersion: 1,
      expectedEmailVersion: 0,
      expectedPushVersion: 2,
      idempotencyKey: "notification-model-test-0001",
    });
  });
});
