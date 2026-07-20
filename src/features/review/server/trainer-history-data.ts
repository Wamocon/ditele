import "server-only";

import { hasPermission, hasRole } from "@/shared/auth/authorization";
import { AuthorizationDeniedError } from "@/shared/auth/errors";
import type { Principal } from "@/shared/auth/types";
import type { Locale } from "@/shared/i18n/config";
import { readAuthorizedTrainerCohortContexts } from "@/features/cohorts/server/trainer-read-data";

import {
  projectTrainerReviewHistory,
  trainerHistoryProfileDatabaseRowsSchema,
  trainerHistorySubmissionDatabaseRowsSchema,
  trainerHistoryTaskLocalizationDatabaseRowsSchema,
  trainerReviewDatabaseRowsSchema,
  type TrainerReviewHistoryItem,
} from "../trainer-history-model";

export const TRAINER_REVIEW_HISTORY_LIMIT = 100;

function requireReviewHistoryAccess(principal: Principal): void {
  const hasAllowedRole = hasRole(principal, "trainer") || hasRole(principal, "admin");
  if (!hasAllowedRole || !hasPermission(principal, "review.manage")) {
    throw new AuthorizationDeniedError("review.manage");
  }
}

export async function readTrainerReviewHistory(
  principal: Principal,
  locale: Locale,
): Promise<readonly TrainerReviewHistoryItem[]> {
  requireReviewHistoryAccess(principal);
  const { client, cohorts } = await readAuthorizedTrainerCohortContexts(
    principal,
    locale,
  );
  if (cohorts.length === 0) return [];
  const cohortIds = cohorts.map((cohort) => cohort.id);

  const { data: reviewData, error: reviewError } = await client
    .from("reviews")
    .select("id, submission_id, decision, comment, created_at")
    .order("created_at", { ascending: false })
    .limit(TRAINER_REVIEW_HISTORY_LIMIT);
  if (reviewError) {
    throw new Error("trainer_history.review_read_failed", {
      cause: reviewError,
    });
  }
  const reviews = trainerReviewDatabaseRowsSchema.parse(reviewData);
  if (reviews.length === 0) return [];

  const { data: submissionData, error: submissionError } = await client
    .from("submissions")
    .select("id, learner_id, cohort_id, task_id")
    .in(
      "id",
      reviews.map((review) => review.submission_id),
    )
    .in("cohort_id", cohortIds);
  if (submissionError) {
    throw new Error("trainer_history.submission_read_failed", {
      cause: submissionError,
    });
  }
  const submissions = trainerHistorySubmissionDatabaseRowsSchema.parse(
    submissionData,
  );
  const submissionIds = new Set(submissions.map((submission) => submission.id));
  const scopedReviews = reviews.filter((review) =>
    submissionIds.has(review.submission_id),
  );
  if (scopedReviews.length === 0) return [];

  const learnerIds = [...
    new Set(submissions.map((submission) => submission.learner_id)),
  ];
  const taskIds = [...new Set(submissions.map((submission) => submission.task_id))];
  const [profileResult, taskResult] = await Promise.all([
    client
      .from("profiles")
      .select("user_id, display_name")
      .in("user_id", learnerIds),
    client
      .from("task_localizations")
      .select("task_id, locale, title")
      .in("task_id", taskIds),
  ]);
  if (profileResult.error || taskResult.error) {
    throw new Error("trainer_history.context_read_failed", {
      cause: profileResult.error ?? taskResult.error,
    });
  }

  return projectTrainerReviewHistory(
    scopedReviews,
    submissions,
    trainerHistoryProfileDatabaseRowsSchema.parse(profileResult.data),
    trainerHistoryTaskLocalizationDatabaseRowsSchema.parse(taskResult.data),
    cohorts,
    locale,
  );
}
