import { z } from "zod";

import type { Locale } from "@/shared/i18n/config";

const localeSchema = z.enum(["en", "de", "ru"]);
const timestampSchema = z.string().datetime({ offset: true });

export const trainerCohortDatabaseRowSchema = z.object({
  id: z.string().uuid(),
  course_id: z.string().uuid(),
  name: z.string().min(1),
  state: z.enum(["waiting", "active", "completed", "cancelled"]),
  progression_mode: z.enum(["scheduled", "flexible"]),
  starts_at: timestampSchema.nullable(),
  ends_at: timestampSchema.nullable(),
});

export const trainerCourseDatabaseRowSchema = z.object({
  id: z.string().uuid(),
  slug: z.string().min(1),
  default_locale: localeSchema,
});

export const trainerCourseLocalizationDatabaseRowSchema = z.object({
  course_id: z.string().uuid(),
  locale: localeSchema,
  title: z.string().min(1),
});

export const trainerCohortMembershipDatabaseRowSchema = z.object({
  cohort_id: z.string().uuid(),
  user_id: z.string().uuid(),
  role: z.enum(["learner", "trainer"]),
  state: z.enum(["invited", "active", "suspended", "removed"]),
  assigned_at: timestampSchema,
});

export const trainerLearnerProfileDatabaseRowSchema = z.object({
  user_id: z.string().uuid(),
  display_name: z.string().min(1),
});

export const trainerAttemptDatabaseRowSchema = z.object({
  id: z.string().uuid(),
  cohort_id: z.string().uuid(),
  learner_id: z.string().uuid(),
  enrollment_id: z.string().uuid(),
  state: z.enum([
    "in_progress",
    "submitted",
    "revision_required",
    "resubmitted",
    "accepted",
    "abandoned",
  ]),
  last_activity_at: timestampSchema,
});

export const trainerEnrollmentDatabaseRowSchema = z.object({
  id: z.string().uuid(),
  cohort_id: z.string().uuid().nullable(),
  learner_id: z.string().uuid(),
  state: z.enum([
    "requested",
    "approved",
    "rejected",
    "assigned",
    "cancelled",
    "completed",
  ]),
  updated_at: timestampSchema,
});

export const trainerCohortDatabaseRowsSchema = z.array(
  trainerCohortDatabaseRowSchema,
);
export const trainerCourseDatabaseRowsSchema = z.array(
  trainerCourseDatabaseRowSchema,
);
export const trainerCourseLocalizationDatabaseRowsSchema = z.array(
  trainerCourseLocalizationDatabaseRowSchema,
);
export const trainerCohortMembershipDatabaseRowsSchema = z.array(
  trainerCohortMembershipDatabaseRowSchema,
);
export const trainerLearnerProfileDatabaseRowsSchema = z.array(
  trainerLearnerProfileDatabaseRowSchema,
);
export const trainerAttemptDatabaseRowsSchema = z.array(
  trainerAttemptDatabaseRowSchema,
);
export const trainerEnrollmentDatabaseRowsSchema = z.array(
  trainerEnrollmentDatabaseRowSchema,
);

type CohortDatabaseRow = z.infer<typeof trainerCohortDatabaseRowSchema>;
type CourseDatabaseRow = z.infer<typeof trainerCourseDatabaseRowSchema>;
type CourseLocalizationDatabaseRow = z.infer<
  typeof trainerCourseLocalizationDatabaseRowSchema
>;
type CohortMembershipDatabaseRow = z.infer<
  typeof trainerCohortMembershipDatabaseRowSchema
>;
type LearnerProfileDatabaseRow = z.infer<
  typeof trainerLearnerProfileDatabaseRowSchema
>;
type AttemptDatabaseRow = z.infer<typeof trainerAttemptDatabaseRowSchema>;
type EnrollmentDatabaseRow = z.infer<
  typeof trainerEnrollmentDatabaseRowSchema
>;

export interface TrainerCohortContext {
  readonly id: string;
  readonly courseId: string;
  readonly courseTitle: string;
  readonly courseTitleLocale: Locale | null;
  readonly courseTitleUsesFallback: boolean;
  readonly name: string;
  readonly state: CohortDatabaseRow["state"];
  readonly progressionMode: CohortDatabaseRow["progression_mode"];
  readonly startsAt: string | null;
  readonly endsAt: string | null;
}

export interface TrainerGroupListItem extends TrainerCohortContext {
  readonly learnerCount: number;
  readonly trainerCount: number;
}

export type TrainerProgressEnrollmentStatus =
  | EnrollmentDatabaseRow["state"]
  | "recorded"
  | "cohort_assignment";

export interface TrainerLearnerProgressItem {
  readonly cohortId: string;
  readonly cohortName: string;
  readonly courseTitle: string;
  readonly learnerId: string;
  readonly learnerName: string | null;
  readonly assignedAt: string;
  readonly enrollmentStatus: TrainerProgressEnrollmentStatus;
  readonly acceptedAttemptCount: number;
  readonly activeAttemptCount: number;
  readonly totalAttemptCount: number;
  readonly lastActivityAt: string | null;
}

function resolveCourseTitle(
  course: CourseDatabaseRow,
  localizations: readonly CourseLocalizationDatabaseRow[],
  locale: Locale,
): Pick<
  TrainerCohortContext,
  "courseTitle" | "courseTitleLocale" | "courseTitleUsesFallback"
> {
  const candidates = localizations.filter(
    (localization) => localization.course_id === course.id,
  );
  const localization =
    candidates.find((candidate) => candidate.locale === locale) ??
    candidates.find((candidate) => candidate.locale === course.default_locale) ??
    candidates.find((candidate) => candidate.locale === "en") ??
    candidates[0];

  return {
    courseTitle: localization?.title ?? course.slug,
    courseTitleLocale: localization?.locale ?? null,
    courseTitleUsesFallback: localization?.locale !== locale,
  };
}

export function projectTrainerCohortContexts(
  cohorts: readonly CohortDatabaseRow[],
  courses: readonly CourseDatabaseRow[],
  localizations: readonly CourseLocalizationDatabaseRow[],
  locale: Locale,
): readonly TrainerCohortContext[] {
  const coursesById = new Map(courses.map((course) => [course.id, course]));
  const stateOrder: Readonly<Record<CohortDatabaseRow["state"], number>> = {
    active: 0,
    waiting: 1,
    completed: 2,
    cancelled: 3,
  };

  return cohorts
    .map((cohort) => {
      const course = coursesById.get(cohort.course_id);
      if (!course) throw new Error("trainer_read.cohort_course_context_missing");
      return {
        id: cohort.id,
        courseId: cohort.course_id,
        ...resolveCourseTitle(course, localizations, locale),
        name: cohort.name,
        state: cohort.state,
        progressionMode: cohort.progression_mode,
        startsAt: cohort.starts_at,
        endsAt: cohort.ends_at,
      } satisfies TrainerCohortContext;
    })
    .toSorted(
      (left, right) =>
        stateOrder[left.state] - stateOrder[right.state] ||
        left.name.localeCompare(right.name, locale),
    );
}

export function projectTrainerGroupList(
  cohorts: readonly TrainerCohortContext[],
  memberships: readonly CohortMembershipDatabaseRow[],
): readonly TrainerGroupListItem[] {
  const activeCounts = new Map<
    string,
    { learners: number; trainers: number }
  >();
  for (const membership of memberships) {
    if (membership.state !== "active") continue;
    const counts = activeCounts.get(membership.cohort_id) ?? {
      learners: 0,
      trainers: 0,
    };
    if (membership.role === "learner") counts.learners += 1;
    else counts.trainers += 1;
    activeCounts.set(membership.cohort_id, counts);
  }

  return cohorts.map((cohort) => {
    const counts = activeCounts.get(cohort.id);
    return {
      ...cohort,
      learnerCount: counts?.learners ?? 0,
      trainerCount: counts?.trainers ?? 0,
    };
  });
}

const activeAttemptStates = new Set<AttemptDatabaseRow["state"]>([
  "in_progress",
  "submitted",
  "revision_required",
  "resubmitted",
]);

function progressKey(cohortId: string, learnerId: string): string {
  return `${cohortId}:${learnerId}`;
}

export function projectTrainerLearnerProgress(
  cohorts: readonly TrainerCohortContext[],
  memberships: readonly CohortMembershipDatabaseRow[],
  profiles: readonly LearnerProfileDatabaseRow[],
  attempts: readonly AttemptDatabaseRow[],
  enrollments: readonly EnrollmentDatabaseRow[],
  locale: Locale,
): readonly TrainerLearnerProgressItem[] {
  const cohortsById = new Map(cohorts.map((cohort) => [cohort.id, cohort]));
  const profilesById = new Map(
    profiles.map((profile) => [profile.user_id, profile.display_name]),
  );
  const attemptsByLearner = new Map<string, AttemptDatabaseRow[]>();
  for (const attempt of attempts) {
    const key = progressKey(attempt.cohort_id, attempt.learner_id);
    const learnerAttempts = attemptsByLearner.get(key) ?? [];
    learnerAttempts.push(attempt);
    attemptsByLearner.set(key, learnerAttempts);
  }
  const enrollmentByLearner = new Map<string, EnrollmentDatabaseRow>();
  for (const enrollment of enrollments.toSorted((left, right) =>
    right.updated_at.localeCompare(left.updated_at),
  )) {
    if (!enrollment.cohort_id) continue;
    const key = progressKey(enrollment.cohort_id, enrollment.learner_id);
    if (!enrollmentByLearner.has(key)) enrollmentByLearner.set(key, enrollment);
  }

  return memberships
    .filter(
      (membership) =>
        membership.role === "learner" &&
        membership.state === "active" &&
        cohortsById.has(membership.cohort_id),
    )
    .map((membership) => {
      const cohort = cohortsById.get(membership.cohort_id);
      if (!cohort) throw new Error("trainer_read.progress_cohort_missing");
      const key = progressKey(membership.cohort_id, membership.user_id);
      const learnerAttempts = attemptsByLearner.get(key) ?? [];
      const enrollment = enrollmentByLearner.get(key);
      const newestAttempt = learnerAttempts.toSorted((left, right) =>
        right.last_activity_at.localeCompare(left.last_activity_at),
      )[0];
      const recordedEnrollmentCount = new Set(
        learnerAttempts.map((attempt) => attempt.enrollment_id),
      ).size;
      return {
        cohortId: cohort.id,
        cohortName: cohort.name,
        courseTitle: cohort.courseTitle,
        learnerId: membership.user_id,
        learnerName: profilesById.get(membership.user_id) ?? null,
        assignedAt: membership.assigned_at,
        enrollmentStatus:
          enrollment?.state ??
          (recordedEnrollmentCount > 0 ? "recorded" : "cohort_assignment"),
        acceptedAttemptCount: learnerAttempts.filter(
          (attempt) => attempt.state === "accepted",
        ).length,
        activeAttemptCount: learnerAttempts.filter((attempt) =>
          activeAttemptStates.has(attempt.state),
        ).length,
        totalAttemptCount: learnerAttempts.length,
        lastActivityAt: newestAttempt?.last_activity_at ?? null,
      } satisfies TrainerLearnerProgressItem;
    })
    .toSorted(
      (left, right) =>
        left.cohortName.localeCompare(right.cohortName, locale) ||
        (left.learnerName ?? "").localeCompare(right.learnerName ?? "", locale) ||
        left.learnerId.localeCompare(right.learnerId),
    );
}
