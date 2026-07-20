import { describe, expect, it } from "vitest";

import {
  buildLearnerHistoryEventDrafts,
  LEARNER_HISTORY_MAX_PAGE,
  LEARNER_HISTORY_PAGE_SIZE,
  learnerHistoryEventKinds,
  LearnerHistorySubmissionVersionRowSchema,
  projectLearnerHistoryPage,
  referencedLearnerHistoryCohortIds,
  type LearnerHistoryContext,
  type LearnerHistoryDatabaseRows,
  type LearnerHistoryScope,
} from "./learner-history";

const USER_ID = "01980a00-0000-7000-8000-000000000001";
const OTHER_USER_ID = "01980a00-0000-7000-8000-000000000002";
const ORGANIZATION_ID = "01980a10-0000-7000-8000-000000000001";
const OTHER_ORGANIZATION_ID = "01980a10-0000-7000-8000-000000000002";
const COHORT_ID = "01980a30-0000-7000-8000-000000000001";
const COURSE_ID = "01980a20-0000-7000-8000-000000000001";
const TASK_ID = "01980a28-0000-7000-8000-000000000001";
const SUBMISSION_ID = "01980a35-0000-7000-8000-000000000001";
const QUESTION_ID = "01980a37-0000-7000-8000-000000000001";

const scope: LearnerHistoryScope = {
  userId: USER_ID,
  organizationId: ORGANIZATION_ID,
  cohortIds: [COHORT_ID],
};

const context: LearnerHistoryContext = {
  cohortCourseIds: new Map([[COHORT_ID, COURSE_ID]]),
  cohortCourseTitles: new Map([[COHORT_ID, "Practical testing"]]),
  courseTitles: new Map([[COURSE_ID, "Practical testing"]]),
  taskTitles: new Map([[TASK_ID, "Analyze the login form"]]),
  questionTaskTitles: new Map([[QUESTION_ID, "Analyze the login form"]]),
};

function emptyRows(): LearnerHistoryDatabaseRows {
  return {
    enrollments: [],
    attempts: [],
    submissionVersions: [],
    reviews: [],
    questions: [],
    certificates: [],
  };
}

function submissionParent() {
  return {
    id: SUBMISSION_ID,
    learner_id: USER_ID,
    organization_id: ORGANIZATION_ID,
    cohort_id: COHORT_ID,
    task_id: TASK_ID,
  } as const;
}

describe("learner history model", () => {
  it("projects genuine state timestamps across all required event families", () => {
    const rows: LearnerHistoryDatabaseRows = {
      enrollments: [
        {
          id: "01980a32-0000-7000-8000-000000000001",
          organization_id: ORGANIZATION_ID,
          learner_id: USER_ID,
          course_id: COURSE_ID,
          cohort_id: COHORT_ID,
          state: "completed",
          decided_at: "2026-07-01T09:00:00.000Z",
          completed_at: "2026-07-17T09:00:00.000Z",
          created_at: "2026-06-30T09:00:00.000Z",
          updated_at: "2026-07-17T09:00:00.000Z",
        },
      ],
      attempts: [
        {
          id: "01980a34-0000-7000-8000-000000000001",
          organization_id: ORGANIZATION_ID,
          enrollment_id: "01980a32-0000-7000-8000-000000000001",
          learner_id: USER_ID,
          cohort_id: COHORT_ID,
          task_id: TASK_ID,
          sequence_number: 1,
          started_at: "2026-07-10T09:00:00.000Z",
        },
      ],
      submissionVersions: [
        {
          id: "01980a36-0000-7000-8000-000000000001",
          submission_id: SUBMISSION_ID,
          submitted_by: USER_ID,
          version_number: 1,
          submitted_at: "2026-07-11T09:00:00.000Z",
          submissions: submissionParent(),
        },
        {
          id: "01980a36-0000-7000-8000-000000000002",
          submission_id: SUBMISSION_ID,
          submitted_by: USER_ID,
          version_number: 2,
          submitted_at: "2026-07-13T09:00:00.000Z",
          submissions: submissionParent(),
        },
      ],
      reviews: [
        {
          id: "01980a38-0000-7000-8000-000000000001",
          organization_id: ORGANIZATION_ID,
          submission_id: SUBMISSION_ID,
          decision: "revision_required",
          created_at: "2026-07-12T09:00:00.000Z",
          submissions: submissionParent(),
        },
        {
          id: "01980a38-0000-7000-8000-000000000002",
          organization_id: ORGANIZATION_ID,
          submission_id: SUBMISSION_ID,
          decision: "accepted",
          created_at: "2026-07-14T09:00:00.000Z",
          submissions: submissionParent(),
        },
      ],
      questions: [
        {
          id: QUESTION_ID,
          organization_id: ORGANIZATION_ID,
          learner_id: USER_ID,
          cohort_id: COHORT_ID,
          task_id: TASK_ID,
          state: "archived",
          created_at: "2026-07-10T10:00:00.000Z",
          updated_at: "2026-07-12T10:00:00.000Z",
          answered_at: "2026-07-11T10:00:00.000Z",
          archived_at: "2026-07-12T10:00:00.000Z",
        },
      ],
      certificates: [
        {
          id: "01980a50-0000-7000-8000-000000000001",
          organization_id: ORGANIZATION_ID,
          learner_id: USER_ID,
          course_id: COURSE_ID,
          state: "available",
          issued_at: "2026-07-17T10:00:00.000Z",
          available_at: "2026-07-17T11:00:00.000Z",
          expires_at: null,
          revoked_at: null,
          updated_at: "2026-07-17T11:00:00.000Z",
        },
      ],
    };

    const drafts = buildLearnerHistoryEventDrafts(rows, scope);
    const page = projectLearnerHistoryPage(
      drafts,
      context,
      1,
      "2026-07-18T12:00:00.000Z",
    );

    expect(page.items.map((item) => item.kind)).toEqual([
      "certificate_available",
      "certificate_issued",
      "course_completed",
      "review_accepted",
      "task_resubmitted",
      "question_archived",
      "review_revision_required",
      "question_answered",
      "task_submitted",
      "question_asked",
      "attempt_started",
      "course_assigned",
      "course_requested",
    ]);
    expect(page.items.find((item) => item.kind === "task_resubmitted"))
      .toMatchObject({
        courseTitle: "Practical testing",
        taskTitle: "Analyze the login form",
        ordinal: 2,
        target: { type: "course", id: COURSE_ID },
      });
    expect(page.items.find((item) => item.kind === "question_answered"))
      .toMatchObject({
        target: { type: "question", id: QUESTION_ID },
      });
    expect(page.items.find((item) => item.kind === "certificate_available"))
      .toMatchObject({ target: { type: "certificates" } });
  });

  it("covers terminal enrollment and certificate event labels without inventing timestamps", () => {
    const enrollmentBase = {
      organization_id: ORGANIZATION_ID,
      learner_id: USER_ID,
      course_id: COURSE_ID,
      cohort_id: COHORT_ID,
      completed_at: null,
      created_at: "2026-07-01T08:00:00.000Z",
      updated_at: "2026-07-02T08:00:00.000Z",
    } as const;
    const rows: LearnerHistoryDatabaseRows = {
      ...emptyRows(),
      enrollments: [
        {
          ...enrollmentBase,
          id: "01980a32-0000-7000-8000-000000000010",
          state: "approved",
          cohort_id: null,
          decided_at: "2026-07-02T08:00:00.000Z",
        },
        {
          ...enrollmentBase,
          id: "01980a32-0000-7000-8000-000000000011",
          state: "rejected",
          cohort_id: null,
          decided_at: "2026-07-02T09:00:00.000Z",
        },
        {
          ...enrollmentBase,
          id: "01980a32-0000-7000-8000-000000000012",
          state: "cancelled",
          decided_at: "2026-07-01T09:00:00.000Z",
        },
      ],
      certificates: [
        {
          id: "01980a50-0000-7000-8000-000000000010",
          organization_id: ORGANIZATION_ID,
          learner_id: USER_ID,
          course_id: COURSE_ID,
          state: "revoked",
          issued_at: "2026-07-03T08:00:00.000Z",
          available_at: null,
          expires_at: null,
          revoked_at: "2026-07-04T08:00:00.000Z",
          updated_at: "2026-07-04T08:00:00.000Z",
        },
        {
          id: "01980a50-0000-7000-8000-000000000011",
          organization_id: ORGANIZATION_ID,
          learner_id: USER_ID,
          course_id: COURSE_ID,
          state: "expired",
          issued_at: "2026-07-03T08:00:00.000Z",
          available_at: null,
          expires_at: "2026-07-05T08:00:00.000Z",
          revoked_at: null,
          updated_at: "2026-07-05T08:00:00.000Z",
        },
      ],
    };

    const kinds = new Set(
      buildLearnerHistoryEventDrafts(rows, scope).map((item) => item.kind),
    );
    expect(kinds).toEqual(new Set([
      "course_requested",
      "course_approved",
      "course_rejected",
      "course_cancelled",
      "certificate_issued",
      "certificate_revoked",
      "certificate_expired",
    ]));
    expect(learnerHistoryEventKinds.every((kind) =>
      kinds.has(kind) || [
        "course_assigned",
        "course_completed",
        "attempt_started",
        "task_submitted",
        "task_resubmitted",
        "review_accepted",
        "review_revision_required",
        "question_asked",
        "question_answered",
        "question_archived",
        "certificate_available",
      ].includes(kind))).toBe(true);
  });

  it("rejects any foreign learner, tenant, cohort, or submission parent atomically", () => {
    const validVersion = {
      id: "01980a36-0000-7000-8000-000000000001",
      submission_id: SUBMISSION_ID,
      submitted_by: USER_ID,
      version_number: 1,
      submitted_at: "2026-07-11T09:00:00.000Z",
      submissions: submissionParent(),
    } as const;

    expect(() => buildLearnerHistoryEventDrafts({
      ...emptyRows(),
      attempts: [{
        id: "01980a34-0000-7000-8000-000000000001",
        organization_id: OTHER_ORGANIZATION_ID,
        enrollment_id: "01980a32-0000-7000-8000-000000000001",
        learner_id: USER_ID,
        cohort_id: COHORT_ID,
        task_id: TASK_ID,
        sequence_number: 1,
        started_at: "2026-07-10T09:00:00.000Z",
      }],
      submissionVersions: [validVersion],
    }, scope)).toThrow("learner_history.attempt_scope_mismatch");

    expect(() => buildLearnerHistoryEventDrafts({
      ...emptyRows(),
      submissionVersions: [{
        ...validVersion,
        submissions: { ...submissionParent(), learner_id: OTHER_USER_ID },
      }],
    }, scope)).toThrow("learner_history.submission_scope_mismatch");

    expect(() => buildLearnerHistoryEventDrafts({
      ...emptyRows(),
      submissionVersions: [{
        ...validVersion,
        submission_id: "01980a35-0000-7000-8000-000000000099",
      }],
    }, scope)).toThrow("learner_history.submission_parent_mismatch");

    expect(() => buildLearnerHistoryEventDrafts({
      ...emptyRows(),
      questions: [{
        id: QUESTION_ID,
        organization_id: ORGANIZATION_ID,
        learner_id: USER_ID,
        cohort_id: "01980a30-0000-7000-8000-000000000099",
        task_id: TASK_ID,
        state: "open",
        created_at: "2026-07-10T10:00:00.000Z",
        updated_at: "2026-07-10T10:00:00.000Z",
        answered_at: null,
        archived_at: null,
      }],
    }, scope)).toThrow("learner_history.question_cohort_mismatch");
  });

  it("uses strict runtime rows that cannot carry authored or sensitive fields", () => {
    expect(() => LearnerHistorySubmissionVersionRowSchema.parse({
      id: "01980a36-0000-7000-8000-000000000001",
      submission_id: SUBMISSION_ID,
      submitted_by: USER_ID,
      version_number: 1,
      submitted_at: "2026-07-11T09:00:00.000Z",
      submissions: submissionParent(),
      answer_text: "must never cross the history boundary",
    })).toThrow();

    expect(() => LearnerHistorySubmissionVersionRowSchema.parse({
      id: "01980a36-0000-7000-8000-000000000001",
      submission_id: SUBMISSION_ID,
      submitted_by: USER_ID,
      version_number: 1,
      submitted_at: "invalid",
      submissions: submissionParent(),
    })).toThrow();
  });

  it("rejects duplicate provider rows before they can create unstable keys", () => {
    const attempt = {
      id: "01980a34-0000-7000-8000-000000000001",
      organization_id: ORGANIZATION_ID,
      enrollment_id: "01980a32-0000-7000-8000-000000000001",
      learner_id: USER_ID,
      cohort_id: COHORT_ID,
      task_id: TASK_ID,
      sequence_number: 1,
      started_at: "2026-07-10T09:00:00.000Z",
    } as const;
    expect(() => buildLearnerHistoryEventDrafts({
      ...emptyRows(),
      attempts: [attempt, attempt],
    }, scope)).toThrow("learner_history.duplicate_event");
  });

  it("uses a snapshot, deterministic tie-breaks, and bounded page slices", () => {
    const attempts = Array.from({ length: LEARNER_HISTORY_PAGE_SIZE + 1 }, (_, index) => ({
      id: `01980a34-0000-7000-8000-${String(index + 1).padStart(12, "0")}`,
      organization_id: ORGANIZATION_ID,
      enrollment_id: "01980a32-0000-7000-8000-000000000001",
      learner_id: USER_ID,
      cohort_id: COHORT_ID,
      task_id: TASK_ID,
      sequence_number: index + 1,
      started_at: index === 0
        ? "2026-07-19T09:00:00.000Z"
        : "2026-07-18T09:00:00.000Z",
    }));
    const drafts = buildLearnerHistoryEventDrafts({
      ...emptyRows(),
      attempts,
    }, scope);

    const first = projectLearnerHistoryPage(
      drafts,
      context,
      1,
      "2026-07-18T12:00:00.000Z",
    );
    expect(first.items).toHaveLength(LEARNER_HISTORY_PAGE_SIZE);
    expect(first.hasNextPage).toBe(false);
    expect(first.items[0]!.id < first.items[1]!.id).toBe(true);

    const visibleDrafts = buildLearnerHistoryEventDrafts({
      ...emptyRows(),
      attempts: attempts.map((attempt) => ({
        ...attempt,
        started_at: "2026-07-18T09:00:00.000Z",
      })),
    }, scope);
    const pageOne = projectLearnerHistoryPage(
      visibleDrafts,
      context,
      1,
      "2026-07-18T12:00:00.000Z",
    );
    const pageTwo = projectLearnerHistoryPage(
      visibleDrafts,
      context,
      2,
      "2026-07-18T12:00:00.000Z",
    );
    expect(pageOne.hasNextPage).toBe(true);
    expect(pageTwo.items).toHaveLength(1);
    expect(pageTwo.hasPreviousPage).toBe(true);
    expect(new Set([...pageOne.items, ...pageTwo.items].map((item) => item.id)))
      .toHaveProperty("size", LEARNER_HISTORY_PAGE_SIZE + 1);
  });

  it("requires cohort context and returns referenced IDs in stable order", () => {
    const drafts = buildLearnerHistoryEventDrafts({
      ...emptyRows(),
      attempts: [{
        id: "01980a34-0000-7000-8000-000000000001",
        organization_id: ORGANIZATION_ID,
        enrollment_id: "01980a32-0000-7000-8000-000000000001",
        learner_id: USER_ID,
        cohort_id: COHORT_ID,
        task_id: TASK_ID,
        sequence_number: 1,
        started_at: "2026-07-10T09:00:00.000Z",
      }],
    }, scope);

    expect(referencedLearnerHistoryCohortIds(drafts)).toEqual([COHORT_ID]);
    expect(() => projectLearnerHistoryPage(
      drafts,
      { ...context, cohortCourseIds: new Map() },
      1,
      "2026-07-18T12:00:00.000Z",
    )).toThrow("learner_history.cohort_context_missing");
  });

  it("does not generate an invalid next link beyond the bounded page limit", () => {
    const attempts = Array.from(
      {
        length:
          LEARNER_HISTORY_PAGE_SIZE * LEARNER_HISTORY_MAX_PAGE + 1,
      },
      (_, index) => ({
        id: `01980a34-0000-7000-8001-${String(index + 1).padStart(12, "0")}`,
        organization_id: ORGANIZATION_ID,
        enrollment_id: "01980a32-0000-7000-8000-000000000001",
        learner_id: USER_ID,
        cohort_id: COHORT_ID,
        task_id: TASK_ID,
        sequence_number: index + 1,
        started_at: new Date(Date.UTC(2026, 6, 18, 9, 0, index)).toISOString(),
      }),
    );
    const drafts = buildLearnerHistoryEventDrafts({
      ...emptyRows(),
      attempts,
    }, scope);

    const page = projectLearnerHistoryPage(
      drafts,
      context,
      LEARNER_HISTORY_MAX_PAGE,
      "2026-07-18T12:00:00.000Z",
    );
    expect(page.items).toHaveLength(LEARNER_HISTORY_PAGE_SIZE);
    expect(page.hasNextPage).toBe(false);
    expect(page.reachedPageLimit).toBe(true);
  });
});
