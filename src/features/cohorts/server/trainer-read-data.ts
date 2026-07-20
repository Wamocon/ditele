import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  canAccessCohort,
  hasPermission,
  hasRole,
} from "@/shared/auth/authorization";
import { AuthorizationDeniedError } from "@/shared/auth/errors";
import type { Principal } from "@/shared/auth/types";
import type { Database } from "@/shared/database/database.types";
import { createServerClient } from "@/shared/database/server";
import type { Locale } from "@/shared/i18n/config";

import {
  projectTrainerCohortContexts,
  projectTrainerGroupList,
  projectTrainerLearnerProgress,
  trainerAttemptDatabaseRowsSchema,
  trainerCohortDatabaseRowsSchema,
  trainerCohortMembershipDatabaseRowsSchema,
  trainerCourseDatabaseRowsSchema,
  trainerCourseLocalizationDatabaseRowsSchema,
  trainerEnrollmentDatabaseRowsSchema,
  trainerLearnerProfileDatabaseRowsSchema,
  type TrainerCohortContext,
  type TrainerGroupListItem,
  type TrainerLearnerProgressItem,
} from "../trainer-read-model";

type ServerDatabaseClient = SupabaseClient<Database>;

function requireTrainerReadAccess(
  principal: Principal,
  permission: "cohort.read" | "review.manage",
): void {
  const hasAllowedRole = hasRole(principal, "trainer") || hasRole(principal, "admin");
  if (!hasAllowedRole || !hasPermission(principal, permission)) {
    throw new AuthorizationDeniedError(permission);
  }
}

async function readAuthorizedCohortRows(
  client: ServerDatabaseClient,
  principal: Principal,
) {
  requireTrainerReadAccess(principal, "cohort.read");
  const canManageEveryVisibleCohort =
    hasRole(principal, "admin") && hasPermission(principal, "cohort.manage");

  let assignedCohortIds: readonly string[] | null = null;
  if (!canManageEveryVisibleCohort) {
    const { data, error } = await client
      .from("cohort_memberships")
      .select("cohort_id, user_id, role, state, assigned_at")
      .eq("user_id", principal.userId)
      .eq("role", "trainer")
      .eq("state", "active");
    if (error) {
      throw new Error("trainer_read.cohort_scope_read_failed", { cause: error });
    }
    const assignments = trainerCohortMembershipDatabaseRowsSchema.parse(data);
    assignedCohortIds = [...new Set(assignments.map((row) => row.cohort_id))];
    if (assignedCohortIds.length === 0) return [];
  }

  let query = client
    .from("cohorts")
    .select(
      "id, course_id, name, state, progression_mode, starts_at, ends_at",
    );
  if (assignedCohortIds) query = query.in("id", assignedCohortIds);
  const { data, error } = await query.order("starts_at", {
    ascending: false,
    nullsFirst: false,
  });
  if (error) {
    throw new Error("trainer_read.cohort_read_failed", { cause: error });
  }
  const cohorts = trainerCohortDatabaseRowsSchema.parse(data);
  if (cohorts.some((cohort) => !canAccessCohort(principal, cohort.id))) {
    throw new AuthorizationDeniedError("cohort.read");
  }
  return cohorts;
}

export async function readAuthorizedTrainerCohortContexts(
  principal: Principal,
  locale: Locale,
): Promise<{
  readonly client: ServerDatabaseClient;
  readonly cohorts: readonly TrainerCohortContext[];
}> {
  requireTrainerReadAccess(principal, "cohort.read");
  const client = await createServerClient();
  const cohortRows = await readAuthorizedCohortRows(client, principal);
  if (cohortRows.length === 0) return { client, cohorts: [] };

  const courseIds = [...new Set(cohortRows.map((cohort) => cohort.course_id))];
  const [courseResult, localizationResult] = await Promise.all([
    client
      .from("courses")
      .select("id, slug, default_locale")
      .in("id", courseIds),
    client
      .from("course_localizations")
      .select("course_id, locale, title")
      .in("course_id", courseIds),
  ]);
  if (courseResult.error || localizationResult.error) {
    throw new Error("trainer_read.course_context_read_failed", {
      cause: courseResult.error ?? localizationResult.error,
    });
  }

  const courseRows = trainerCourseDatabaseRowsSchema.parse(courseResult.data);
  const localizationRows = trainerCourseLocalizationDatabaseRowsSchema.parse(
    localizationResult.data,
  );
  return {
    client,
    cohorts: projectTrainerCohortContexts(
      cohortRows,
      courseRows,
      localizationRows,
      locale,
    ),
  };
}

export async function readTrainerGroups(
  principal: Principal,
  locale: Locale,
): Promise<readonly TrainerGroupListItem[]> {
  const { client, cohorts } = await readAuthorizedTrainerCohortContexts(
    principal,
    locale,
  );
  if (cohorts.length === 0) return [];

  const { data, error } = await client
    .from("cohort_memberships")
    .select("cohort_id, user_id, role, state, assigned_at")
    .in(
      "cohort_id",
      cohorts.map((cohort) => cohort.id),
    )
    .eq("state", "active");
  if (error) {
    throw new Error("trainer_read.group_membership_read_failed", {
      cause: error,
    });
  }
  const memberships = trainerCohortMembershipDatabaseRowsSchema.parse(data);
  return projectTrainerGroupList(cohorts, memberships);
}

export async function readTrainerLearnerProgress(
  principal: Principal,
  locale: Locale,
): Promise<readonly TrainerLearnerProgressItem[]> {
  requireTrainerReadAccess(principal, "review.manage");
  const { client, cohorts } = await readAuthorizedTrainerCohortContexts(
    principal,
    locale,
  );
  if (cohorts.length === 0) return [];
  const cohortIds = cohorts.map((cohort) => cohort.id);

  const [membershipResult, attemptResult, enrollmentResult] = await Promise.all([
    client
      .from("cohort_memberships")
      .select("cohort_id, user_id, role, state, assigned_at")
      .in("cohort_id", cohortIds)
      .eq("role", "learner")
      .eq("state", "active"),
    client
      .from("attempts")
      .select(
        "id, cohort_id, learner_id, enrollment_id, state, last_activity_at",
      )
      .in("cohort_id", cohortIds),
    client
      .from("enrollments")
      .select("id, cohort_id, learner_id, state, updated_at")
      .in("cohort_id", cohortIds),
  ]);
  if (
    membershipResult.error ||
    attemptResult.error ||
    enrollmentResult.error
  ) {
    throw new Error("trainer_read.progress_read_failed", {
      cause:
        membershipResult.error ?? attemptResult.error ?? enrollmentResult.error,
    });
  }

  const memberships = trainerCohortMembershipDatabaseRowsSchema.parse(
    membershipResult.data,
  );
  const attempts = trainerAttemptDatabaseRowsSchema.parse(attemptResult.data);
  const enrollments = trainerEnrollmentDatabaseRowsSchema.parse(
    enrollmentResult.data,
  );
  const learnerIds = [...new Set(memberships.map((row) => row.user_id))];
  let profiles: ReturnType<typeof trainerLearnerProfileDatabaseRowsSchema.parse> = [];
  if (learnerIds.length > 0) {
    const { data, error } = await client
      .from("profiles")
      .select("user_id, display_name")
      .in("user_id", learnerIds);
    if (error) {
      throw new Error("trainer_read.progress_profile_read_failed", {
        cause: error,
      });
    }
    profiles = trainerLearnerProfileDatabaseRowsSchema.parse(data);
  }

  return projectTrainerLearnerProgress(
    cohorts,
    memberships,
    profiles,
    attempts,
    enrollments,
    locale,
  );
}
