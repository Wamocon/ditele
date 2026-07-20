import { describe, expect, it } from "vitest";

import {
  projectTrainerCohortContexts,
  projectTrainerGroupList,
  projectTrainerLearnerProgress,
  trainerAttemptDatabaseRowsSchema,
  trainerCohortDatabaseRowsSchema,
} from "./trainer-read-model";

const cohortId = "01980a30-0000-7000-8000-000000000001";
const courseId = "01980a20-0000-7000-8000-000000000001";
const learnerId = "01980a00-0000-7000-8000-000000000001";
const trainerId = "01980a00-0000-7000-8000-000000000002";
const enrollmentId = "01980a33-0000-7000-8000-000000000001";

const cohortRows = [{
  id: cohortId,
  course_id: courseId,
  name: "Release cohort",
  state: "active" as const,
  progression_mode: "scheduled" as const,
  starts_at: "2026-07-17T08:00:00.000Z",
  ends_at: null,
}];
const courseRows = [{
  id: courseId,
  slug: "practical-testing",
  default_locale: "de" as const,
}];
const localizations = [{
  course_id: courseId,
  locale: "de" as const,
  title: "Praktisches Testen",
}];
const memberships = [
  {
    cohort_id: cohortId,
    user_id: learnerId,
    role: "learner" as const,
    state: "active" as const,
    assigned_at: "2026-07-17T08:00:00.000Z",
  },
  {
    cohort_id: cohortId,
    user_id: trainerId,
    role: "trainer" as const,
    state: "active" as const,
    assigned_at: "2026-07-17T08:00:00.000Z",
  },
];

describe("trainer cohort read projections", () => {
  it("resolves a documented course-title fallback and active member totals", () => {
    const contexts = projectTrainerCohortContexts(
      cohortRows,
      courseRows,
      localizations,
      "ru",
    );
    const groups = projectTrainerGroupList(contexts, memberships);

    expect(groups).toEqual([
      expect.objectContaining({
        courseTitle: "Praktisches Testen",
        courseTitleLocale: "de",
        courseTitleUsesFallback: true,
        learnerCount: 1,
        trainerCount: 1,
      }),
    ]);
  });

  it("derives accepted and active counts from authorized attempts", () => {
    const contexts = projectTrainerCohortContexts(
      cohortRows,
      courseRows,
      localizations,
      "de",
    );
    const items = projectTrainerLearnerProgress(
      contexts,
      memberships,
      [{ user_id: learnerId, display_name: "Lena Learner" }],
      [
        {
          id: "01980a34-0000-7000-8000-000000000001",
          cohort_id: cohortId,
          learner_id: learnerId,
          enrollment_id: enrollmentId,
          state: "accepted",
          last_activity_at: "2026-07-17T10:00:00.000Z",
        },
        {
          id: "01980a34-0000-7000-8000-000000000002",
          cohort_id: cohortId,
          learner_id: learnerId,
          enrollment_id: enrollmentId,
          state: "revision_required",
          last_activity_at: "2026-07-17T11:00:00.000Z",
        },
      ],
      [],
      "de",
    );

    expect(items[0]).toMatchObject({
      learnerName: "Lena Learner",
      enrollmentStatus: "recorded",
      acceptedAttemptCount: 1,
      activeAttemptCount: 1,
      totalAttemptCount: 2,
      lastActivityAt: "2026-07-17T11:00:00.000Z",
    });
  });

  it("prefers an RLS-visible enrollment lifecycle state", () => {
    const contexts = projectTrainerCohortContexts(
      cohortRows,
      courseRows,
      localizations,
      "de",
    );
    const [item] = projectTrainerLearnerProgress(
      contexts,
      memberships,
      [],
      [],
      [{
        id: enrollmentId,
        cohort_id: cohortId,
        learner_id: learnerId,
        state: "assigned",
        updated_at: "2026-07-17T09:00:00.000Z",
      }],
      "de",
    );

    expect(item).toBeDefined();
    if (!item) throw new Error("Expected a projected learner progress item");
    expect(item.enrollmentStatus).toBe("assigned");
    expect(item.learnerName).toBeNull();
  });

  it("rejects invalid database enum values and timestamps", () => {
    expect(() =>
      trainerCohortDatabaseRowsSchema.parse([
        { ...cohortRows[0], state: "running" },
      ]),
    ).toThrow();
    expect(() =>
      trainerAttemptDatabaseRowsSchema.parse([
        {
          id: "01980a34-0000-7000-8000-000000000001",
          cohort_id: cohortId,
          learner_id: learnerId,
          enrollment_id: enrollmentId,
          state: "accepted",
          last_activity_at: "not-a-date",
        },
      ]),
    ).toThrow();
  });
});
