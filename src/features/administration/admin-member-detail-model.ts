import { z } from "zod";

import type { Locale } from "@/shared/i18n/config";

const localeSchema = z.enum(["en", "de", "ru"]);
const timestampSchema = z.string().min(1).refine(
  (value) => !Number.isNaN(Date.parse(value)),
  "Invalid database timestamp",
);

export const adminMemberOrganizationMembershipRowSchema = z.object({
  id: z.string().uuid(),
  organization_id: z.string().uuid(),
  user_id: z.string().uuid(),
  state: z.enum(["invited", "active", "suspended", "removed"]),
  joined_at: timestampSchema.nullable(),
  valid_until: timestampSchema.nullable(),
  created_at: timestampSchema,
});

export const adminMemberProfileRowsSchema = z.array(z.object({
  user_id: z.string().uuid(),
  display_name: z.string().max(160),
  locale: localeSchema,
  timezone: z.string().trim().min(1),
  profile_state: z.enum(["draft", "active", "inactive", "archived"]),
  membership_state: z.enum(["invited", "active", "suspended"]),
}));

export const adminMemberProfileDatabaseRowSchema = z.object({
  user_id: z.string().uuid(),
  display_name: z.string().max(160),
  locale: localeSchema,
  timezone: z.string().trim().min(1),
  state: z.enum(["draft", "active", "inactive", "archived"]),
});

export const adminMemberRoleRowsSchema = z.array(z.object({
  user_id: z.string().uuid(),
  organization_id: z.string().uuid(),
  cohort_id: z.string().uuid().nullable(),
  roles: z.object({
    code: z.string().regex(/^[a-z][a-z0-9_]*$/),
  }),
}));

export const adminMemberCohortRowsSchema = z.array(z.object({
  id: z.string().uuid(),
  organization_id: z.string().uuid(),
  course_id: z.string().uuid(),
  name: z.string().trim().min(1),
  state: z.enum(["waiting", "active", "completed", "cancelled"]),
}));

const adminMemberCohortMembershipRowSchema = z.object({
  cohort_id: z.string().uuid(),
  user_id: z.string().uuid(),
  role: z.enum(["learner", "trainer"]),
  state: z.enum(["invited", "active", "suspended", "removed"]),
  assigned_at: timestampSchema,
  removed_at: timestampSchema.nullable(),
});

export const adminMemberCohortMembershipRowsSchema = z.array(
  adminMemberCohortMembershipRowSchema,
);

export const adminMemberScopedCohortMembershipRowsSchema = z.array(
  adminMemberCohortMembershipRowSchema.extend({
    cohorts: z.object({ organization_id: z.string().uuid() }),
  }),
);

export const adminMemberEnrollmentRowsSchema = z.array(z.object({
  id: z.string().uuid(),
  organization_id: z.string().uuid(),
  learner_id: z.string().uuid(),
  course_id: z.string().uuid(),
  cohort_id: z.string().uuid().nullable(),
  state: z.enum([
    "requested",
    "approved",
    "rejected",
    "assigned",
    "cancelled",
    "completed",
  ]),
  updated_at: timestampSchema,
  completed_at: timestampSchema.nullable(),
}));

export const adminMemberAttemptRowsSchema = z.array(z.object({
  id: z.string().uuid(),
  organization_id: z.string().uuid(),
  learner_id: z.string().uuid(),
  cohort_id: z.string().uuid(),
  state: z.enum([
    "in_progress",
    "submitted",
    "revision_required",
    "resubmitted",
    "accepted",
    "abandoned",
  ]),
  last_activity_at: timestampSchema,
  accepted_at: timestampSchema.nullable(),
}));

export const adminMemberCertificateRowsSchema = z.array(z.object({
  id: z.string().uuid(),
  organization_id: z.string().uuid(),
  learner_id: z.string().uuid(),
  course_id: z.string().uuid().nullable(),
  state: z.enum(["eligible", "issued", "available", "revoked", "expired"]),
  certificate_type: z.enum(["course_completion", "exam", "competency"]),
  issued_at: timestampSchema.nullable(),
  available_at: timestampSchema.nullable(),
  expires_at: timestampSchema.nullable(),
  revoked_at: timestampSchema.nullable(),
  created_at: timestampSchema,
}));

export const adminMemberCourseRowsSchema = z.array(z.object({
  id: z.string().uuid(),
  organization_id: z.string().uuid().nullable(),
  slug: z.string().trim().min(1),
  default_locale: localeSchema,
}));

export const adminMemberCourseLocalizationRowsSchema = z.array(z.object({
  course_id: z.string().uuid(),
  locale: localeSchema,
  title: z.string().trim().min(1),
}));

type MembershipRow = z.infer<typeof adminMemberOrganizationMembershipRowSchema>;
type ProfileRow = z.infer<typeof adminMemberProfileRowsSchema>[number];
type CohortRow = z.infer<typeof adminMemberCohortRowsSchema>[number];
type CohortMembershipRow = z.infer<
  typeof adminMemberCohortMembershipRowsSchema
>[number];
type EnrollmentRow = z.infer<typeof adminMemberEnrollmentRowsSchema>[number];
type AttemptRow = z.infer<typeof adminMemberAttemptRowsSchema>[number];
type CertificateRow = z.infer<typeof adminMemberCertificateRowsSchema>[number];
type CourseRow = z.infer<typeof adminMemberCourseRowsSchema>[number];
type CourseLocalizationRow = z.infer<
  typeof adminMemberCourseLocalizationRowsSchema
>[number];

export type AdminMemberDetail = {
  readonly membership: {
    readonly state: MembershipRow["state"];
    readonly joinedAt: string | null;
    readonly validUntil: string | null;
    readonly createdAt: string;
  };
  readonly profile: {
    readonly visible: boolean;
    readonly displayName: string | null;
    readonly locale: Locale | null;
    readonly timezone: string | null;
    readonly state: ProfileRow["profile_state"] | null;
  };
  readonly roles: readonly {
    readonly code: string;
    readonly scope: "organization" | "cohort";
  }[];
  readonly assignments: readonly {
    readonly cohortId: string;
    readonly cohortName: string;
    readonly cohortState: CohortRow["state"];
    readonly courseTitle: string;
    readonly courseTitleLocale: Locale;
    readonly courseTitleUsesFallback: boolean;
    readonly role: CohortMembershipRow["role"];
    readonly membershipState: CohortMembershipRow["state"];
    readonly assignedAt: string;
    readonly attemptTotal: number;
    readonly activeAttemptTotal: number;
    readonly acceptedAttemptTotal: number;
    readonly lastActivityAt: string | null;
  }[];
  readonly hasLearnerContext: boolean;
  readonly learnerProgress: {
    readonly attemptTotal: number;
    readonly activeAttemptTotal: number;
    readonly acceptedAttemptTotal: number;
    readonly lastActivityAt: string | null;
  };
  readonly enrollments: readonly {
    readonly id: string;
    readonly courseTitle: string;
    readonly courseTitleLocale: Locale;
    readonly courseTitleUsesFallback: boolean;
    readonly cohortId: string | null;
    readonly state: EnrollmentRow["state"];
    readonly updatedAt: string;
    readonly completedAt: string | null;
  }[];
  readonly certificates: readonly {
    readonly id: string;
    readonly courseTitle: string | null;
    readonly courseTitleLocale: Locale | null;
    readonly courseTitleUsesFallback: boolean;
    readonly state: CertificateRow["state"];
    readonly type: CertificateRow["certificate_type"];
    readonly recordedAt: string;
    readonly issuedAt: string | null;
    readonly availableAt: string | null;
    readonly expiresAt: string | null;
    readonly revokedAt: string | null;
  }[];
};

function toIso(value: string | null): string | null {
  return value === null ? null : new Date(value).toISOString();
}

function assertUniqueIds(
  rows: readonly { readonly id: string }[],
  contract: string,
): void {
  if (new Set(rows.map((row) => row.id)).size !== rows.length) {
    throw new Error(`admin_member_detail.duplicate_${contract}`);
  }
}

function resolveCourseTitle(
  course: CourseRow,
  localizations: readonly CourseLocalizationRow[],
  locale: Locale,
): {
  readonly value: string;
  readonly locale: Locale;
  readonly usesFallback: boolean;
} {
  const candidates = localizations.filter((row) => row.course_id === course.id);
  const selected = candidates.find((row) => row.locale === locale)
    ?? candidates.find((row) => row.locale === course.default_locale)
    ?? candidates.find((row) => row.locale === "en")
    ?? candidates[0];
  return {
    value: selected?.title ?? course.slug,
    locale: selected?.locale ?? course.default_locale,
    usesFallback: selected?.locale !== locale,
  };
}

function latestTimestamp(values: readonly string[]): string | null {
  return values.length === 0
    ? null
    : values.map((value) => new Date(value).toISOString()).toSorted().at(-1) ?? null;
}

const activeAttemptStates = new Set<AttemptRow["state"]>([
  "in_progress",
  "submitted",
  "revision_required",
  "resubmitted",
]);

export function projectAdminMemberDetail({
  attemptsInput,
  certificatesInput,
  cohortMembershipsInput,
  cohortsInput,
  courseLocalizationsInput,
  coursesInput,
  enrollmentsInput,
  expectedOrganizationId,
  expectedUserId,
  locale,
  membershipInput,
  profilesInput,
  rolesInput,
}: {
  readonly attemptsInput: unknown;
  readonly certificatesInput: unknown;
  readonly cohortMembershipsInput: unknown;
  readonly cohortsInput: unknown;
  readonly courseLocalizationsInput: unknown;
  readonly coursesInput: unknown;
  readonly enrollmentsInput: unknown;
  readonly expectedOrganizationId: string;
  readonly expectedUserId: string;
  readonly locale: Locale;
  readonly membershipInput: unknown;
  readonly profilesInput: unknown;
  readonly rolesInput: unknown;
}): AdminMemberDetail {
  const membership = adminMemberOrganizationMembershipRowSchema.parse(membershipInput);
  const profiles = adminMemberProfileRowsSchema.parse(profilesInput);
  const roles = adminMemberRoleRowsSchema.parse(rolesInput);
  const cohorts = adminMemberCohortRowsSchema.parse(cohortsInput);
  const cohortMemberships = adminMemberCohortMembershipRowsSchema.parse(
    cohortMembershipsInput,
  );
  const enrollments = adminMemberEnrollmentRowsSchema.parse(enrollmentsInput);
  const attempts = adminMemberAttemptRowsSchema.parse(attemptsInput);
  const certificates = adminMemberCertificateRowsSchema.parse(certificatesInput);
  const courses = adminMemberCourseRowsSchema.parse(coursesInput);
  const courseLocalizations = adminMemberCourseLocalizationRowsSchema.parse(
    courseLocalizationsInput,
  );

  if (
    membership.organization_id !== expectedOrganizationId ||
    membership.user_id !== expectedUserId
  ) {
    throw new Error("admin_member_detail.target_scope_mismatch");
  }

  assertUniqueIds(cohorts, "cohort");
  assertUniqueIds(enrollments, "enrollment");
  assertUniqueIds(attempts, "attempt");
  assertUniqueIds(certificates, "certificate");
  assertUniqueIds(courses, "course");

  const cohortIds = new Set(cohorts.map((cohort) => cohort.id));
  const courseIds = new Set(courses.map((course) => course.id));
  if (cohorts.some((cohort) => cohort.organization_id !== expectedOrganizationId)) {
    throw new Error("admin_member_detail.cohort_scope_mismatch");
  }
  if (
    courses.some(
      (course) =>
        course.organization_id !== null &&
        course.organization_id !== expectedOrganizationId,
    )
  ) {
    throw new Error("admin_member_detail.course_scope_mismatch");
  }
  if (
    profiles.some((profile) => profile.user_id !== expectedUserId) ||
    profiles.length > 1
  ) {
    throw new Error("admin_member_detail.profile_scope_mismatch");
  }
  if (
    roles.some(
      (role) =>
        role.user_id !== expectedUserId ||
        role.organization_id !== expectedOrganizationId ||
        (role.cohort_id !== null && !cohortIds.has(role.cohort_id)),
    )
  ) {
    throw new Error("admin_member_detail.role_scope_mismatch");
  }
  if (
    cohortMemberships.some(
      (entry) =>
        entry.user_id !== expectedUserId || !cohortIds.has(entry.cohort_id),
    )
  ) {
    throw new Error("admin_member_detail.assignment_scope_mismatch");
  }
  if (
    enrollments.some(
      (enrollment) =>
        enrollment.organization_id !== expectedOrganizationId ||
        enrollment.learner_id !== expectedUserId ||
        !courseIds.has(enrollment.course_id) ||
        (enrollment.cohort_id !== null && !cohortIds.has(enrollment.cohort_id)),
    )
  ) {
    throw new Error("admin_member_detail.enrollment_scope_mismatch");
  }
  if (
    attempts.some(
      (attempt) =>
        attempt.organization_id !== expectedOrganizationId ||
        attempt.learner_id !== expectedUserId ||
        !cohortIds.has(attempt.cohort_id),
    )
  ) {
    throw new Error("admin_member_detail.attempt_scope_mismatch");
  }
  if (
    certificates.some(
      (certificate) =>
        certificate.organization_id !== expectedOrganizationId ||
        certificate.learner_id !== expectedUserId ||
        (certificate.course_id !== null && !courseIds.has(certificate.course_id)),
    )
  ) {
    throw new Error("admin_member_detail.certificate_scope_mismatch");
  }
  if (courseLocalizations.some((entry) => !courseIds.has(entry.course_id))) {
    throw new Error("admin_member_detail.localization_scope_mismatch");
  }

  const profile = profiles[0];
  if (profile && profile.membership_state !== membership.state) {
    throw new Error("admin_member_detail.profile_membership_mismatch");
  }

  const coursesById = new Map(courses.map((course) => [course.id, course]));
  const cohortsById = new Map(cohorts.map((cohort) => [cohort.id, cohort]));
  const attemptsByCohort = new Map<string, AttemptRow[]>();
  for (const attempt of attempts) {
    const cohortAttempts = attemptsByCohort.get(attempt.cohort_id) ?? [];
    cohortAttempts.push(attempt);
    attemptsByCohort.set(attempt.cohort_id, cohortAttempts);
  }

  const projectedRoles = roles
    .map((role) => ({
      code: role.roles.code,
      scope: role.cohort_id === null ? "organization" as const : "cohort" as const,
    }))
    .filter(
      (role, index, values) =>
        values.findIndex(
          (candidate) =>
            candidate.code === role.code && candidate.scope === role.scope,
        ) === index,
    )
    .toSorted(
      (left, right) =>
        left.code.localeCompare(right.code) || left.scope.localeCompare(right.scope),
    );

  const assignments = cohortMemberships
    .map((assignment) => {
      const cohort = cohortsById.get(assignment.cohort_id);
      if (!cohort) throw new Error("admin_member_detail.assignment_cohort_missing");
      const course = coursesById.get(cohort.course_id);
      if (!course) throw new Error("admin_member_detail.assignment_course_missing");
      const courseTitle = resolveCourseTitle(course, courseLocalizations, locale);
      const cohortAttempts = assignment.role === "learner"
        ? attemptsByCohort.get(cohort.id) ?? []
        : [];
      return {
        cohortId: cohort.id,
        cohortName: cohort.name,
        cohortState: cohort.state,
        courseTitle: courseTitle.value,
        courseTitleLocale: courseTitle.locale,
        courseTitleUsesFallback: courseTitle.usesFallback,
        role: assignment.role,
        membershipState: assignment.state,
        assignedAt: new Date(assignment.assigned_at).toISOString(),
        attemptTotal: cohortAttempts.length,
        activeAttemptTotal: cohortAttempts.filter((attempt) =>
          activeAttemptStates.has(attempt.state),
        ).length,
        acceptedAttemptTotal: cohortAttempts.filter(
          (attempt) => attempt.state === "accepted",
        ).length,
        lastActivityAt: latestTimestamp(
          cohortAttempts.map((attempt) => attempt.last_activity_at),
        ),
      };
    })
    .toSorted(
      (left, right) =>
        left.cohortName.localeCompare(right.cohortName, locale) ||
        left.role.localeCompare(right.role),
    );

  const hasLearnerContext =
    projectedRoles.some((role) => role.code === "learner") ||
    assignments.some((assignment) => assignment.role === "learner") ||
    enrollments.length > 0 ||
    attempts.length > 0 ||
    certificates.length > 0;

  return {
    membership: {
      state: membership.state,
      joinedAt: toIso(membership.joined_at),
      validUntil: toIso(membership.valid_until),
      createdAt: new Date(membership.created_at).toISOString(),
    },
    profile: {
      visible: profile !== undefined,
      displayName: profile?.display_name.trim() || null,
      locale: profile?.locale ?? null,
      timezone: profile?.timezone ?? null,
      state: profile?.profile_state ?? null,
    },
    roles: projectedRoles,
    assignments,
    hasLearnerContext,
    learnerProgress: {
      attemptTotal: attempts.length,
      activeAttemptTotal: attempts.filter((attempt) =>
        activeAttemptStates.has(attempt.state),
      ).length,
      acceptedAttemptTotal: attempts.filter(
        (attempt) => attempt.state === "accepted",
      ).length,
      lastActivityAt: latestTimestamp(
        attempts.map((attempt) => attempt.last_activity_at),
      ),
    },
    enrollments: enrollments
      .map((enrollment) => {
        const course = coursesById.get(enrollment.course_id);
        if (!course) throw new Error("admin_member_detail.enrollment_course_missing");
        const title = resolveCourseTitle(course, courseLocalizations, locale);
        return {
          id: enrollment.id,
          courseTitle: title.value,
          courseTitleLocale: title.locale,
          courseTitleUsesFallback: title.usesFallback,
          cohortId: enrollment.cohort_id,
          state: enrollment.state,
          updatedAt: new Date(enrollment.updated_at).toISOString(),
          completedAt: toIso(enrollment.completed_at),
        };
      })
      .toSorted((left, right) => right.updatedAt.localeCompare(left.updatedAt)),
    certificates: certificates
      .map((certificate) => {
        const course = certificate.course_id
          ? coursesById.get(certificate.course_id)
          : undefined;
        const title = course
          ? resolveCourseTitle(course, courseLocalizations, locale)
          : null;
        return {
          id: certificate.id,
          courseTitle: title?.value ?? null,
          courseTitleLocale: title?.locale ?? null,
          courseTitleUsesFallback: title?.usesFallback ?? false,
          state: certificate.state,
          type: certificate.certificate_type,
          recordedAt: new Date(certificate.created_at).toISOString(),
          issuedAt: toIso(certificate.issued_at),
          availableAt: toIso(certificate.available_at),
          expiresAt: toIso(certificate.expires_at),
          revokedAt: toIso(certificate.revoked_at),
        };
      })
      .toSorted((left, right) => right.recordedAt.localeCompare(left.recordedAt)),
  };
}
