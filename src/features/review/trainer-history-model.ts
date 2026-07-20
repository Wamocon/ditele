import { z } from "zod";

import type { Locale } from "@/shared/i18n/config";
import type { TrainerCohortContext } from "@/features/cohorts/trainer-read-model";

const localeSchema = z.enum(["en", "de", "ru"]);
const timestampSchema = z.string().datetime({ offset: true });

export const trainerReviewDatabaseRowSchema = z.object({
  id: z.string().uuid(),
  submission_id: z.string().uuid(),
  decision: z.enum(["accepted", "revision_required"]),
  comment: z.string().min(1),
  created_at: timestampSchema,
});

export const trainerHistorySubmissionDatabaseRowSchema = z.object({
  id: z.string().uuid(),
  learner_id: z.string().uuid(),
  cohort_id: z.string().uuid(),
  task_id: z.string().uuid(),
});

export const trainerHistoryProfileDatabaseRowSchema = z.object({
  user_id: z.string().uuid(),
  display_name: z.string().min(1),
});

export const trainerHistoryTaskLocalizationDatabaseRowSchema = z.object({
  task_id: z.string().uuid(),
  locale: localeSchema,
  title: z.string().min(1),
});

export const trainerReviewDatabaseRowsSchema = z.array(
  trainerReviewDatabaseRowSchema,
);
export const trainerHistorySubmissionDatabaseRowsSchema = z.array(
  trainerHistorySubmissionDatabaseRowSchema,
);
export const trainerHistoryProfileDatabaseRowsSchema = z.array(
  trainerHistoryProfileDatabaseRowSchema,
);
export const trainerHistoryTaskLocalizationDatabaseRowsSchema = z.array(
  trainerHistoryTaskLocalizationDatabaseRowSchema,
);

type ReviewDatabaseRow = z.infer<typeof trainerReviewDatabaseRowSchema>;
type SubmissionDatabaseRow = z.infer<
  typeof trainerHistorySubmissionDatabaseRowSchema
>;
type ProfileDatabaseRow = z.infer<
  typeof trainerHistoryProfileDatabaseRowSchema
>;
type TaskLocalizationDatabaseRow = z.infer<
  typeof trainerHistoryTaskLocalizationDatabaseRowSchema
>;

export interface TrainerReviewHistoryItem {
  readonly id: string;
  readonly submissionId: string;
  readonly learnerName: string | null;
  readonly cohortName: string;
  readonly courseTitle: string;
  readonly taskTitle: string | null;
  readonly decision: ReviewDatabaseRow["decision"];
  readonly comment: string;
  readonly decidedAt: string;
}

function resolveTaskTitle(
  taskId: string,
  localizations: readonly TaskLocalizationDatabaseRow[],
  locale: Locale,
): string | null {
  const candidates = localizations.filter(
    (localization) => localization.task_id === taskId,
  );
  return (
    candidates.find((candidate) => candidate.locale === locale)?.title ??
    candidates.find((candidate) => candidate.locale === "en")?.title ??
    candidates[0]?.title ??
    null
  );
}

export function projectTrainerReviewHistory(
  reviews: readonly ReviewDatabaseRow[],
  submissions: readonly SubmissionDatabaseRow[],
  profiles: readonly ProfileDatabaseRow[],
  taskLocalizations: readonly TaskLocalizationDatabaseRow[],
  cohorts: readonly TrainerCohortContext[],
  locale: Locale,
): readonly TrainerReviewHistoryItem[] {
  const submissionsById = new Map(
    submissions.map((submission) => [submission.id, submission]),
  );
  const profilesById = new Map(
    profiles.map((profile) => [profile.user_id, profile.display_name]),
  );
  const cohortsById = new Map(cohorts.map((cohort) => [cohort.id, cohort]));

  return reviews
    .map((review) => {
      const submission = submissionsById.get(review.submission_id);
      if (!submission) {
        throw new Error("trainer_history.submission_context_missing");
      }
      const cohort = cohortsById.get(submission.cohort_id);
      if (!cohort) throw new Error("trainer_history.cohort_context_missing");
      return {
        id: review.id,
        submissionId: submission.id,
        learnerName: profilesById.get(submission.learner_id) ?? null,
        cohortName: cohort.name,
        courseTitle: cohort.courseTitle,
        taskTitle: resolveTaskTitle(
          submission.task_id,
          taskLocalizations,
          locale,
        ),
        decision: review.decision,
        comment: review.comment,
        decidedAt: review.created_at,
      } satisfies TrainerReviewHistoryItem;
    })
    .toSorted((left, right) => right.decidedAt.localeCompare(left.decidedAt));
}
