import { describe, expect, it } from "vitest";

import { projectAdminMemberDetail } from "./admin-member-detail-model";

const organizationId = "01980a10-0000-7000-8000-000000000001";
const otherOrganizationId = "01980a10-0000-7000-8000-000000000002";
const userId = "01980a00-0000-7000-8000-000000000001";
const otherUserId = "01980a00-0000-7000-8000-000000000002";
const cohortId = "01980a30-0000-7000-8000-000000000001";
const otherCohortId = "01980a30-0000-7000-8000-000000000002";
const courseId = "01980a20-0000-7000-8000-000000000001";
const otherCourseId = "01980a20-0000-7000-8000-000000000002";

function learnerInputs() {
  return {
    attemptsInput: [
      {
        id: "01980a34-0000-7000-8000-000000000001",
        organization_id: organizationId,
        learner_id: userId,
        cohort_id: cohortId,
        state: "accepted",
        last_activity_at: "2026-07-18T09:00:00Z",
        accepted_at: "2026-07-18T09:00:00Z",
      },
      {
        id: "01980a34-0000-7000-8000-000000000002",
        organization_id: organizationId,
        learner_id: userId,
        cohort_id: cohortId,
        state: "revision_required",
        last_activity_at: "2026-07-18T10:00:00Z",
        accepted_at: null,
      },
    ],
    certificatesInput: [{
      id: "01980a39-0000-7000-8000-000000000001",
      organization_id: organizationId,
      learner_id: userId,
      course_id: courseId,
      state: "available",
      certificate_type: "course_completion",
      issued_at: "2026-07-18T11:00:00Z",
      available_at: "2026-07-18T12:00:00Z",
      expires_at: null,
      revoked_at: null,
      created_at: "2026-07-18T11:00:00Z",
    }],
    cohortMembershipsInput: [{
      cohort_id: cohortId,
      user_id: userId,
      role: "learner",
      state: "active",
      assigned_at: "2026-07-17T08:00:00Z",
      removed_at: null,
    }],
    cohortsInput: [{
      id: cohortId,
      organization_id: organizationId,
      course_id: courseId,
      name: "Release group",
      state: "active",
    }],
    courseLocalizationsInput: [{
      course_id: courseId,
      locale: "de",
      title: "Praktisches Testen",
    }],
    coursesInput: [{
      id: courseId,
      organization_id: null,
      slug: "practical-testing",
      default_locale: "de",
    }],
    enrollmentsInput: [{
      id: "01980a33-0000-7000-8000-000000000001",
      organization_id: organizationId,
      learner_id: userId,
      course_id: courseId,
      cohort_id: cohortId,
      state: "assigned",
      updated_at: "2026-07-17T09:00:00Z",
      completed_at: null,
    }],
    expectedOrganizationId: organizationId,
    expectedUserId: userId,
    locale: "ru" as const,
    membershipInput: {
      id: "01980a11-0000-7000-8000-000000000001",
      organization_id: organizationId,
      user_id: userId,
      state: "active",
      joined_at: "2026-07-17T08:00:00Z",
      valid_until: null,
      created_at: "2026-07-16T08:00:00Z",
    },
    profilesInput: [{
      user_id: userId,
      display_name: "  Lena Learner  ",
      locale: "de",
      timezone: "Europe/Berlin",
      profile_state: "active",
      membership_state: "active",
    }],
    rolesInput: [
      {
        user_id: userId,
        organization_id: organizationId,
        cohort_id: null,
        roles: { code: "learner" },
      },
      {
        user_id: userId,
        organization_id: organizationId,
        cohort_id: cohortId,
        roles: { code: "learner" },
      },
    ],
  };
}

describe("admin member detail projection", () => {
  it("projects minimized learner assignment, progress, enrollment, and certificate context", () => {
    const detail = projectAdminMemberDetail(learnerInputs());

    expect(detail.profile).toEqual({
      visible: true,
      displayName: "Lena Learner",
      locale: "de",
      timezone: "Europe/Berlin",
      state: "active",
    });
    expect(detail.roles).toEqual([
      { code: "learner", scope: "cohort" },
      { code: "learner", scope: "organization" },
    ]);
    expect(detail.assignments).toEqual([
      expect.objectContaining({
        cohortName: "Release group",
        courseTitle: "Praktisches Testen",
        courseTitleLocale: "de",
        courseTitleUsesFallback: true,
        attemptTotal: 2,
        activeAttemptTotal: 1,
        acceptedAttemptTotal: 1,
        lastActivityAt: "2026-07-18T10:00:00.000Z",
      }),
    ]);
    expect(detail.learnerProgress).toEqual({
      attemptTotal: 2,
      activeAttemptTotal: 1,
      acceptedAttemptTotal: 1,
      lastActivityAt: "2026-07-18T10:00:00.000Z",
    });
    expect(detail.enrollments[0]).toMatchObject({
      state: "assigned",
      courseTitle: "Praktisches Testen",
    });
    expect(detail.certificates[0]).toMatchObject({
      state: "available",
      type: "course_completion",
      courseTitle: "Praktisches Testen",
    });
    expect(detail.hasLearnerContext).toBe(true);
    expect(JSON.stringify(detail)).not.toMatch(/email|phone|verification_token|answer_text/);
  });

  it("keeps a trainer-only member free of fabricated learner context", () => {
    const input = learnerInputs();
    const detail = projectAdminMemberDetail({
      ...input,
      attemptsInput: [],
      certificatesInput: [],
      cohortMembershipsInput: [{
        ...input.cohortMembershipsInput[0],
        role: "trainer",
      }],
      enrollmentsInput: [],
      rolesInput: [{
        user_id: userId,
        organization_id: organizationId,
        cohort_id: null,
        roles: { code: "trainer" },
      }],
    });

    expect(detail.assignments[0]).toMatchObject({
      role: "trainer",
      attemptTotal: 0,
    });
    expect(detail.hasLearnerContext).toBe(false);
    expect(detail.enrollments).toEqual([]);
    expect(detail.certificates).toEqual([]);
  });

  it("represents a removed member without substituting an identifier for a profile", () => {
    const input = learnerInputs();
    const detail = projectAdminMemberDetail({
      ...input,
      attemptsInput: [],
      certificatesInput: [],
      cohortMembershipsInput: [],
      cohortsInput: [],
      courseLocalizationsInput: [],
      coursesInput: [],
      enrollmentsInput: [],
      membershipInput: { ...input.membershipInput, state: "removed" },
      profilesInput: [],
      rolesInput: [],
    });

    expect(detail.profile).toMatchObject({
      visible: false,
      displayName: null,
      locale: null,
      timezone: null,
    });
    expect(detail.profile.displayName).not.toBe(userId);
  });

  it.each([
    ["target", (input: ReturnType<typeof learnerInputs>) => ({
      ...input,
      membershipInput: { ...input.membershipInput, organization_id: otherOrganizationId },
    }), "target_scope_mismatch"],
    ["profile", (input: ReturnType<typeof learnerInputs>) => ({
      ...input,
      profilesInput: [{ ...input.profilesInput[0], user_id: otherUserId }],
    }), "profile_scope_mismatch"],
    ["role", (input: ReturnType<typeof learnerInputs>) => ({
      ...input,
      rolesInput: [{ ...input.rolesInput[0], organization_id: otherOrganizationId }],
    }), "role_scope_mismatch"],
    ["cohort", (input: ReturnType<typeof learnerInputs>) => ({
      ...input,
      cohortsInput: [{ ...input.cohortsInput[0], organization_id: otherOrganizationId }],
    }), "cohort_scope_mismatch"],
    ["assignment", (input: ReturnType<typeof learnerInputs>) => ({
      ...input,
      cohortMembershipsInput: [{ ...input.cohortMembershipsInput[0], user_id: otherUserId }],
    }), "assignment_scope_mismatch"],
    ["enrollment", (input: ReturnType<typeof learnerInputs>) => ({
      ...input,
      enrollmentsInput: [{ ...input.enrollmentsInput[0], cohort_id: otherCohortId }],
    }), "enrollment_scope_mismatch"],
    ["attempt", (input: ReturnType<typeof learnerInputs>) => ({
      ...input,
      attemptsInput: [{ ...input.attemptsInput[0], learner_id: otherUserId }],
    }), "attempt_scope_mismatch"],
    ["certificate", (input: ReturnType<typeof learnerInputs>) => ({
      ...input,
      certificatesInput: [{ ...input.certificatesInput[0], course_id: otherCourseId }],
    }), "certificate_scope_mismatch"],
    ["course", (input: ReturnType<typeof learnerInputs>) => ({
      ...input,
      coursesInput: [{ ...input.coursesInput[0], organization_id: otherOrganizationId }],
    }), "course_scope_mismatch"],
    ["localization", (input: ReturnType<typeof learnerInputs>) => ({
      ...input,
      courseLocalizationsInput: [{ ...input.courseLocalizationsInput[0], course_id: otherCourseId }],
    }), "localization_scope_mismatch"],
  ])("rejects a %s row outside the target scope", (_name, mutate, message) => {
    expect(() => projectAdminMemberDetail(mutate(learnerInputs()))).toThrow(message);
  });

  it("rejects duplicate domain rows instead of silently overwriting them", () => {
    const input = learnerInputs();
    expect(() => projectAdminMemberDetail({
      ...input,
      attemptsInput: [input.attemptsInput[0], input.attemptsInput[0]],
    })).toThrow("duplicate_attempt");
  });
});
