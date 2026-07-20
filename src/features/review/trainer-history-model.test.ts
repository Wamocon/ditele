import { describe, expect, it } from "vitest";

import type { TrainerCohortContext } from "@/features/cohorts/trainer-read-model";

import {
  projectTrainerReviewHistory,
  trainerReviewDatabaseRowsSchema,
} from "./trainer-history-model";

const cohort: TrainerCohortContext = {
  id: "01980a30-0000-7000-8000-000000000001",
  courseId: "01980a20-0000-7000-8000-000000000001",
  courseTitle: "Practical Software Testing",
  courseTitleLocale: "en",
  courseTitleUsesFallback: false,
  name: "Release cohort",
  state: "active",
  progressionMode: "scheduled",
  startsAt: "2026-07-17T08:00:00.000Z",
  endsAt: null,
};
const learnerId = "01980a00-0000-7000-8000-000000000001";
const taskId = "01980a26-0000-7000-8000-000000000001";
const submissionId = "01980a35-0000-7000-8000-000000000001";

describe("trainer review history projection", () => {
  it("joins localized context and sorts completed reviews newest first", () => {
    const items = projectTrainerReviewHistory(
      [
        {
          id: "01980a38-0000-7000-8000-000000000001",
          submission_id: submissionId,
          decision: "revision_required",
          comment: "Add evidence.",
          created_at: "2026-07-17T10:00:00.000Z",
        },
        {
          id: "01980a38-0000-7000-8000-000000000002",
          submission_id: submissionId,
          decision: "accepted",
          comment: "Evidence verified.",
          created_at: "2026-07-17T11:00:00.000Z",
        },
      ],
      [{
        id: submissionId,
        learner_id: learnerId,
        cohort_id: cohort.id,
        task_id: taskId,
      }],
      [{ user_id: learnerId, display_name: "Lena Learner" }],
      [
        { task_id: taskId, locale: "en", title: "Analyze login" },
        { task_id: taskId, locale: "de", title: "Login analysieren" },
      ],
      [cohort],
      "de",
    );

    expect(items.map((item) => item.decision)).toEqual([
      "accepted",
      "revision_required",
    ]);
    expect(items[0]).toMatchObject({
      learnerName: "Lena Learner",
      taskTitle: "Login analysieren",
      cohortName: "Release cohort",
      courseTitle: "Practical Software Testing",
    });
  });

  it("fails closed when submission context is absent", () => {
    expect(() =>
      projectTrainerReviewHistory(
        [{
          id: "01980a38-0000-7000-8000-000000000001",
          submission_id: submissionId,
          decision: "accepted",
          comment: "Verified.",
          created_at: "2026-07-17T11:00:00.000Z",
        }],
        [],
        [],
        [],
        [cohort],
        "en",
      ),
    ).toThrow("trainer_history.submission_context_missing");
  });

  it("rejects unsupported decisions", () => {
    expect(() =>
      trainerReviewDatabaseRowsSchema.parse([
        {
          id: "01980a38-0000-7000-8000-000000000001",
          submission_id: submissionId,
          decision: "transferred",
          comment: "Transferred.",
          created_at: "2026-07-17T11:00:00.000Z",
        },
      ]),
    ).toThrow();
  });
});
