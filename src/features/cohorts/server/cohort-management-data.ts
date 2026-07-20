import "server-only";

import { z } from "zod";

import { hasPermission, hasRole } from "@/shared/auth/authorization";
import type { Principal } from "@/shared/auth/types";
import { createServerClient } from "@/shared/database/server";
import type { Locale } from "@/shared/i18n/config";

import {
  activeTrainerMembership,
  cohortManagementCohortRowSchema,
  cohortManagementContentVersionRowSchema,
  cohortManagementCourseLocalizationRowsSchema,
  cohortManagementCourseRowSchema,
  cohortManagementMembershipRowsSchema,
  cohortManagementScheduleRowsSchema,
  cohortManagementStageLocalizationRowsSchema,
  cohortManagementStageRowsSchema,
  cohortManagementTaskLocalizationRowsSchema,
  cohortManagementTaskRowsSchema,
  projectCohortManagementDetail,
  type CohortManagementDetail,
  type CohortManagementPerspective,
} from "../cohort-management-model";

const profileRowSchema = z.object({
  state: z.enum(["draft", "active", "inactive", "archived"]),
  deactivated_at: z.string().datetime({ offset: true }).nullable(),
});
const organizationRowSchema = z.object({
  state: z.enum(["active", "suspended", "archived"]),
});
const organizationMembershipRowSchema = z.object({
  state: z.enum(["invited", "active", "suspended", "removed"]),
  valid_until: z.string().datetime({ offset: true }).nullable(),
});

function activeOrganizationMembership(
  input: unknown,
  now: string,
): boolean {
  const parsed = organizationMembershipRowSchema.safeParse(input);
  return (
    parsed.success &&
    parsed.data.state === "active" &&
    (parsed.data.valid_until === null || parsed.data.valid_until > now)
  );
}

function assertPerspectiveAccess(
  principal: Principal,
  perspective: CohortManagementPerspective,
): void {
  const allowed =
    perspective === "admin"
      ? (hasRole(principal, "admin") || hasRole(principal, "organization_admin")) &&
        hasPermission(principal, "cohort.manage")
      : (hasRole(principal, "trainer") || hasRole(principal, "admin")) &&
        hasPermission(principal, "cohort.read");
  if (!allowed) throw new Error("cohort_management.perspective_forbidden");
}

export async function readCohortManagementDetail(
  principal: Principal,
  locale: Locale,
  cohortId: string,
  perspective: CohortManagementPerspective,
): Promise<CohortManagementDetail | null> {
  assertPerspectiveAccess(principal, perspective);
  const client = await createServerClient();
  const { data: cohortData, error: cohortError } = await client
    .from("cohorts")
    .select(
      "id, organization_id, course_id, content_version_id, name, state, progression_mode, starts_at, ends_at, capacity, row_version, updated_at, completed_at",
    )
    .eq("id", cohortId)
    .maybeSingle();
  if (cohortError) {
    throw new Error("cohort_management.cohort_read_failed", {
      cause: cohortError,
    });
  }
  if (!cohortData) return null;
  const cohort = cohortManagementCohortRowSchema.parse(cohortData);

  const pinnedVersionPromise = cohort.content_version_id
    ? client
        .from("content_versions")
        .select("id, course_id, version_number, state")
        .eq("id", cohort.content_version_id)
        .eq("course_id", cohort.course_id)
        .in("state", ["published", "archived"])
        .maybeSingle()
    : Promise.resolve({ data: null, error: null });
  const taskPromise = cohort.content_version_id
    ? client
        .from("tasks")
        .select(
          "id, course_id, stage_id, content_version_id, position, task_kind, state",
        )
        .eq("course_id", cohort.course_id)
        .eq("content_version_id", cohort.content_version_id)
        .eq("state", "active")
        .order("position", { ascending: true })
    : Promise.resolve({ data: [], error: null });

  const [
    courseResult,
    courseLocalizationResult,
    membershipResult,
    organizationMembershipResult,
    organizationResult,
    pinnedVersionResult,
    profileResult,
    scheduleResult,
    taskResult,
  ] = await Promise.all([
    client
      .from("courses")
      .select("id, slug, default_locale")
      .eq("id", cohort.course_id)
      .maybeSingle(),
    client
      .from("course_localizations")
      .select("course_id, locale, title")
      .eq("course_id", cohort.course_id),
    client
      .from("cohort_memberships")
      .select("user_id, role, state")
      .eq("cohort_id", cohort.id),
    client
      .from("organization_memberships")
      .select("state, valid_until")
      .eq("organization_id", cohort.organization_id)
      .eq("user_id", principal.userId)
      .in("state", ["invited", "active", "suspended"])
      .limit(1)
      .maybeSingle(),
    client
      .from("organizations")
      .select("state")
      .eq("id", cohort.organization_id)
      .maybeSingle(),
    pinnedVersionPromise,
    client
      .from("profiles")
      .select("state, deactivated_at")
      .eq("user_id", principal.userId)
      .maybeSingle(),
    client
      .from("task_schedules")
      .select(
        "id, cohort_id, task_id, available_from, due_at, change_reason, row_version, updated_at",
      )
      .eq("cohort_id", cohort.id),
    taskPromise,
  ]);
  const firstError =
    courseResult.error ??
    courseLocalizationResult.error ??
    membershipResult.error ??
    organizationMembershipResult.error ??
    organizationResult.error ??
    pinnedVersionResult.error ??
    profileResult.error ??
    scheduleResult.error ??
    taskResult.error;
  if (firstError) {
    throw new Error("cohort_management.context_read_failed", {
      cause: firstError,
    });
  }
  if (!courseResult.data || !organizationResult.data || !profileResult.data) {
    return null;
  }

  const course = cohortManagementCourseRowSchema.parse(courseResult.data);
  const courseLocalizations =
    cohortManagementCourseLocalizationRowsSchema.parse(
      courseLocalizationResult.data,
    );
  const memberships = cohortManagementMembershipRowsSchema.parse(
    membershipResult.data,
  );
  const schedules = cohortManagementScheduleRowsSchema.parse(
    scheduleResult.data,
  );
  const organization = organizationRowSchema.parse(organizationResult.data);
  const profile = profileRowSchema.parse(profileResult.data);
  const pinnedVersion = pinnedVersionResult.data
    ? cohortManagementContentVersionRowSchema.parse(pinnedVersionResult.data)
    : null;
  const tasks = pinnedVersion
    ? cohortManagementTaskRowsSchema.parse(taskResult.data)
    : [];

  const taskIds = tasks.map((task) => task.id);
  const stageIds = [...new Set(tasks.map((task) => task.stage_id))];
  const taskLocalizationPromise =
    taskIds.length > 0
      ? client
          .from("task_localizations")
          .select("task_id, locale, title")
          .in("task_id", taskIds)
      : Promise.resolve({ data: [], error: null });
  const stagePromise =
    stageIds.length > 0
      ? client
          .from("stages")
          .select("id, position")
          .in("id", stageIds)
      : Promise.resolve({ data: [], error: null });
  const stageLocalizationPromise =
    stageIds.length > 0
      ? client
          .from("stage_localizations")
          .select("stage_id, locale, title")
          .in("stage_id", stageIds)
      : Promise.resolve({ data: [], error: null });
  const [taskLocalizationResult, stageResult, stageLocalizationResult] =
    await Promise.all([
      taskLocalizationPromise,
      stagePromise,
      stageLocalizationPromise,
    ]);
  if (
    taskLocalizationResult.error ||
    stageResult.error ||
    stageLocalizationResult.error
  ) {
    throw new Error("cohort_management.task_context_read_failed", {
      cause:
        taskLocalizationResult.error ??
        stageResult.error ??
        stageLocalizationResult.error,
    });
  }

  const now = new Date().toISOString();
  const actorProfileIsActive =
    profile.state === "active" && profile.deactivated_at === null;
  const organizationIsActive = organization.state === "active";
  const globalAdmin = hasRole(principal, "admin");
  const actorMembershipIsActive = activeOrganizationMembership(
    organizationMembershipResult.data,
    now,
  );
  const canManage =
    actorProfileIsActive &&
    organizationIsActive &&
    hasPermission(principal, "cohort.manage") &&
    (globalAdmin ||
      (principal.organizationId === cohort.organization_id &&
        actorMembershipIsActive));
  const canOperateAsTrainer =
    actorProfileIsActive &&
    organizationIsActive &&
    actorMembershipIsActive &&
    hasRole(principal, "trainer") &&
    hasPermission(principal, "cohort.read") &&
    activeTrainerMembership(memberships, principal.userId);

  if (
    (perspective === "admin" && !canManage) ||
    (perspective === "trainer" && !canManage && !canOperateAsTrainer)
  ) {
    return null;
  }

  return projectCohortManagementDetail({
    canManage,
    canOperateAsTrainer,
    cohortInput: cohort,
    courseInput: course,
    courseLocalizationsInput: courseLocalizations,
    locale,
    membershipsInput: memberships,
    publishedVersionId: pinnedVersion?.id ?? null,
    publishedVersionNumber: pinnedVersion?.version_number ?? null,
    pinnedVersionState: pinnedVersion?.state ?? null,
    schedulesInput: schedules,
    stageLocalizationsInput:
      cohortManagementStageLocalizationRowsSchema.parse(
        stageLocalizationResult.data,
      ),
    stagesInput: cohortManagementStageRowsSchema.parse(stageResult.data),
    taskLocalizationsInput:
      cohortManagementTaskLocalizationRowsSchema.parse(
        taskLocalizationResult.data,
      ),
    tasksInput: tasks,
  });
}
