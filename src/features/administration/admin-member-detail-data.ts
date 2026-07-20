import "server-only";

import { z } from "zod";

import { hasPermission } from "@/shared/auth/authorization";
import { AuthorizationDeniedError } from "@/shared/auth/errors";
import type { Principal } from "@/shared/auth/types";
import { createServerClient } from "@/shared/database/server";
import type { Locale } from "@/shared/i18n/config";

import {
  adminMemberAttemptRowsSchema,
  adminMemberCertificateRowsSchema,
  adminMemberCohortMembershipRowsSchema,
  adminMemberCohortRowsSchema,
  adminMemberCourseLocalizationRowsSchema,
  adminMemberCourseRowsSchema,
  adminMemberEnrollmentRowsSchema,
  adminMemberOrganizationMembershipRowSchema,
  adminMemberProfileDatabaseRowSchema,
  adminMemberProfileRowsSchema,
  adminMemberRoleRowsSchema,
  adminMemberScopedCohortMembershipRowsSchema,
  projectAdminMemberDetail,
  type AdminMemberDetail,
} from "./admin-member-detail-model";

const targetUserIdSchema = z.string().uuid();

function requireAdminMemberOrganization(principal: Principal): string {
  if (!principal.organizationId || !hasPermission(principal, "organization.manage")) {
    throw new AuthorizationDeniedError("organization.manage");
  }
  return principal.organizationId;
}

/**
 * Reads a minimized administration projection for one organization member.
 * The exact membership lookup deliberately precedes every target-context read,
 * so an unknown or cross-tenant identifier cannot be used as a probing oracle.
 */
export async function readAdminMemberDetail(
  principal: Principal,
  locale: Locale,
  targetUserIdInput: string,
): Promise<AdminMemberDetail | null> {
  const organizationId = requireAdminMemberOrganization(principal);
  const targetUserId = targetUserIdSchema.parse(targetUserIdInput);
  const client = await createServerClient();

  const membershipResult = await client
    .from("organization_memberships")
    .select(
      "id, organization_id, user_id, state, joined_at, valid_until, created_at",
    )
    .eq("organization_id", organizationId)
    .eq("user_id", targetUserId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (membershipResult.error) {
    throw new Error("admin_member_detail.membership_read_failed", {
      cause: membershipResult.error,
    });
  }
  if (!membershipResult.data) return null;
  const membership = adminMemberOrganizationMembershipRowSchema.parse(
    membershipResult.data,
  );
  if (
    membership.organization_id !== organizationId ||
    membership.user_id !== targetUserId
  ) {
    throw new Error("admin_member_detail.target_scope_mismatch");
  }

  const now = new Date().toISOString();
  const [
    profileResult,
    roleResult,
    cohortMembershipResult,
    enrollmentResult,
    attemptResult,
    certificateResult,
  ] = await Promise.all([
    client
      .from("profiles")
      .select("user_id, display_name, locale, timezone, state")
      .eq("user_id", targetUserId)
      .maybeSingle(),
    client
      .from("user_roles")
      .select("user_id, organization_id, cohort_id, roles!inner(code)")
      .eq("organization_id", organizationId)
      .eq("user_id", targetUserId)
      .is("revoked_at", null)
      .lte("valid_from", now)
      .or(`valid_until.is.null,valid_until.gt.${now}`),
    client
      .from("cohort_memberships")
      .select(
        "cohort_id, user_id, role, state, assigned_at, removed_at, cohorts!inner(organization_id)",
      )
      .eq("user_id", targetUserId)
      .eq("cohorts.organization_id", organizationId),
    client
      .from("enrollments")
      .select(
        "id, organization_id, learner_id, course_id, cohort_id, state, updated_at, completed_at",
      )
      .eq("organization_id", organizationId)
      .eq("learner_id", targetUserId),
    client
      .from("attempts")
      .select(
        "id, organization_id, learner_id, cohort_id, state, last_activity_at, accepted_at",
      )
      .eq("organization_id", organizationId)
      .eq("learner_id", targetUserId),
    client
      .from("certificates")
      .select(
        "id, organization_id, learner_id, course_id, state, certificate_type, issued_at, available_at, expires_at, revoked_at, created_at",
      )
      .eq("organization_id", organizationId)
      .eq("learner_id", targetUserId),
  ]);
  const contextError =
    profileResult.error ??
    roleResult.error ??
    cohortMembershipResult.error ??
    enrollmentResult.error ??
    attemptResult.error ??
    certificateResult.error;
  if (contextError) {
    throw new Error("admin_member_detail.context_read_failed", {
      cause: contextError,
    });
  }

  const profile = profileResult.data
    ? adminMemberProfileDatabaseRowSchema.parse(profileResult.data)
    : null;
  const profiles = adminMemberProfileRowsSchema.parse(
    profile && membership.state !== "removed" ? [{
      user_id: profile.user_id,
      display_name: profile.display_name,
      locale: profile.locale,
      timezone: profile.timezone,
      profile_state: profile.state,
      membership_state: membership.state,
    }] : [],
  );
  const roles = adminMemberRoleRowsSchema.parse(roleResult.data);
  const scopedCohortMemberships =
    adminMemberScopedCohortMembershipRowsSchema.parse(
      cohortMembershipResult.data,
    );
  if (
    scopedCohortMemberships.some(
      (entry) => entry.cohorts.organization_id !== organizationId,
    )
  ) {
    throw new Error("admin_member_detail.assignment_scope_mismatch");
  }
  const cohortMemberships = adminMemberCohortMembershipRowsSchema.parse(
    scopedCohortMemberships.map((entry) => ({
      cohort_id: entry.cohort_id,
      user_id: entry.user_id,
      role: entry.role,
      state: entry.state,
      assigned_at: entry.assigned_at,
      removed_at: entry.removed_at,
    })),
  );
  const enrollments = adminMemberEnrollmentRowsSchema.parse(
    enrollmentResult.data,
  );
  const attempts = adminMemberAttemptRowsSchema.parse(attemptResult.data);
  const certificates = adminMemberCertificateRowsSchema.parse(
    certificateResult.data,
  );

  const cohortIds = [
    ...new Set([
      ...cohortMemberships.map((entry) => entry.cohort_id),
      ...roles.flatMap((role) => role.cohort_id ? [role.cohort_id] : []),
      ...enrollments.flatMap((enrollment) =>
        enrollment.cohort_id ? [enrollment.cohort_id] : []
      ),
      ...attempts.map((attempt) => attempt.cohort_id),
    ]),
  ];
  const cohortResult = cohortIds.length > 0
    ? await client
      .from("cohorts")
      .select("id, organization_id, course_id, name, state")
      .eq("organization_id", organizationId)
      .in("id", cohortIds)
    : { data: [], error: null };
  if (cohortResult.error) {
    throw new Error("admin_member_detail.cohort_context_read_failed", {
      cause: cohortResult.error,
    });
  }
  const cohorts = adminMemberCohortRowsSchema.parse(cohortResult.data);

  const courseIds = [
    ...new Set([
      ...cohorts.map((cohort) => cohort.course_id),
      ...enrollments.map((enrollment) => enrollment.course_id),
      ...certificates.flatMap((certificate) =>
        certificate.course_id ? [certificate.course_id] : []
      ),
    ]),
  ];
  const [courseResult, localizationResult] = courseIds.length > 0
    ? await Promise.all([
      client
        .from("courses")
        .select("id, organization_id, slug, default_locale")
        .in("id", courseIds)
        .or(`organization_id.is.null,organization_id.eq.${organizationId}`),
      client
        .from("course_localizations")
        .select("course_id, locale, title")
        .in("course_id", courseIds),
    ])
    : [
      { data: [], error: null },
      { data: [], error: null },
    ];
  if (courseResult.error || localizationResult.error) {
    throw new Error("admin_member_detail.course_context_read_failed", {
      cause: courseResult.error ?? localizationResult.error,
    });
  }
  const courses = adminMemberCourseRowsSchema.parse(courseResult.data);
  const courseLocalizations = adminMemberCourseLocalizationRowsSchema.parse(
    localizationResult.data,
  );

  return projectAdminMemberDetail({
    attemptsInput: attempts,
    certificatesInput: certificates,
    cohortMembershipsInput: cohortMemberships,
    cohortsInput: cohorts,
    courseLocalizationsInput: courseLocalizations,
    coursesInput: courses,
    enrollmentsInput: enrollments,
    expectedOrganizationId: organizationId,
    expectedUserId: targetUserId,
    locale,
    membershipInput: membership,
    profilesInput: profiles,
    rolesInput: roles,
  });
}
