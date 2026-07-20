import { z } from "zod";

export const LEARNER_HISTORY_PAGE_SIZE = 20;
export const LEARNER_HISTORY_MAX_PAGE = 25;

export const LearnerHistoryPageNumberSchema = z
  .number()
  .int()
  .positive()
  .max(LEARNER_HISTORY_MAX_PAGE);

export const learnerHistoryEventKinds = [
  "course_requested",
  "course_approved",
  "course_assigned",
  "course_rejected",
  "course_cancelled",
  "course_completed",
  "attempt_started",
  "task_submitted",
  "task_resubmitted",
  "review_accepted",
  "review_revision_required",
  "question_asked",
  "question_answered",
  "question_archived",
  "certificate_issued",
  "certificate_available",
  "certificate_revoked",
  "certificate_expired",
] as const;

export const LearnerHistoryEventKindSchema = z.enum(
  learnerHistoryEventKinds,
);

export type LearnerHistoryEventKind = z.infer<
  typeof LearnerHistoryEventKindSchema
>;

const UuidSchema = z.string().uuid();
const TimestampSchema = z
  .string()
  .datetime({ offset: true })
  .transform((value) => new Date(value).toISOString());

const EnrollmentStateSchema = z.enum([
  "requested",
  "approved",
  "rejected",
  "assigned",
  "cancelled",
  "completed",
]);

export const LearnerHistoryEnrollmentRowSchema = z
  .object({
    id: UuidSchema,
    organization_id: UuidSchema,
    learner_id: UuidSchema,
    course_id: UuidSchema,
    cohort_id: UuidSchema.nullable(),
    state: EnrollmentStateSchema,
    decided_at: TimestampSchema.nullable(),
    completed_at: TimestampSchema.nullable(),
    created_at: TimestampSchema,
    updated_at: TimestampSchema,
  })
  .strict()
  .superRefine((row, context) => {
    if (row.state !== "requested" && row.decided_at === null) {
      context.addIssue({
        code: "custom",
        message: "learner_history.enrollment_decision_timestamp_missing",
      });
    }
    if (row.state === "completed" && row.completed_at === null) {
      context.addIssue({
        code: "custom",
        message: "learner_history.enrollment_completion_timestamp_missing",
      });
    }
  });

export const LearnerHistoryAttemptRowSchema = z
  .object({
    id: UuidSchema,
    organization_id: UuidSchema,
    enrollment_id: UuidSchema,
    learner_id: UuidSchema,
    cohort_id: UuidSchema,
    task_id: UuidSchema,
    sequence_number: z.number().int().positive(),
    started_at: TimestampSchema,
  })
  .strict();

const SubmissionParentRowSchema = z
  .object({
    id: UuidSchema,
    learner_id: UuidSchema,
    organization_id: UuidSchema,
    cohort_id: UuidSchema,
    task_id: UuidSchema,
  })
  .strict();

export const LearnerHistorySubmissionVersionRowSchema = z
  .object({
    id: UuidSchema,
    submission_id: UuidSchema,
    submitted_by: UuidSchema,
    version_number: z.number().int().positive(),
    submitted_at: TimestampSchema,
    submissions: SubmissionParentRowSchema,
  })
  .strict();

export const LearnerHistoryReviewRowSchema = z
  .object({
    id: UuidSchema,
    organization_id: UuidSchema,
    submission_id: UuidSchema,
    decision: z.enum(["accepted", "revision_required"]),
    created_at: TimestampSchema,
    submissions: SubmissionParentRowSchema,
  })
  .strict();

export const LearnerHistoryQuestionRowSchema = z
  .object({
    id: UuidSchema,
    organization_id: UuidSchema,
    learner_id: UuidSchema,
    cohort_id: UuidSchema,
    task_id: UuidSchema,
    state: z.enum([
      "open",
      "assigned",
      "answered",
      "transferred",
      "archived",
    ]),
    created_at: TimestampSchema,
    updated_at: TimestampSchema,
    answered_at: TimestampSchema.nullable(),
    archived_at: TimestampSchema.nullable(),
  })
  .strict()
  .superRefine((row, context) => {
    if (row.state === "answered" && row.answered_at === null) {
      context.addIssue({
        code: "custom",
        message: "learner_history.question_answer_timestamp_missing",
      });
    }
    if (row.state === "archived" && row.archived_at === null) {
      context.addIssue({
        code: "custom",
        message: "learner_history.question_archive_timestamp_missing",
      });
    }
  });

export const LearnerHistoryCertificateRowSchema = z
  .object({
    id: UuidSchema,
    organization_id: UuidSchema,
    learner_id: UuidSchema,
    course_id: UuidSchema.nullable(),
    state: z.enum(["eligible", "issued", "available", "revoked", "expired"]),
    issued_at: TimestampSchema.nullable(),
    available_at: TimestampSchema.nullable(),
    expires_at: TimestampSchema.nullable(),
    revoked_at: TimestampSchema.nullable(),
    updated_at: TimestampSchema,
  })
  .strict()
  .superRefine((row, context) => {
    if (row.state !== "eligible" && row.issued_at === null) {
      context.addIssue({
        code: "custom",
        message: "learner_history.certificate_issue_timestamp_missing",
      });
    }
    if (row.state === "available" && row.available_at === null) {
      context.addIssue({
        code: "custom",
        message: "learner_history.certificate_availability_timestamp_missing",
      });
    }
    if (row.state === "revoked" && row.revoked_at === null) {
      context.addIssue({
        code: "custom",
        message: "learner_history.certificate_revocation_timestamp_missing",
      });
    }
    if (row.state === "expired" && row.expires_at === null) {
      context.addIssue({
        code: "custom",
        message: "learner_history.certificate_expiry_timestamp_missing",
      });
    }
  });

export const LearnerHistoryCohortContextRowSchema = z
  .object({
    id: UuidSchema,
    organization_id: UuidSchema,
    course_id: UuidSchema,
  })
  .strict();

export const LearnerHistoryQuestionContextRowSchema = z
  .object({
    question_id: UuidSchema,
    task_title: z.string().trim().min(1).max(300),
  })
  .strict();

export type LearnerHistoryEnrollmentRow = z.infer<
  typeof LearnerHistoryEnrollmentRowSchema
>;
export type LearnerHistoryAttemptRow = z.infer<
  typeof LearnerHistoryAttemptRowSchema
>;
export type LearnerHistorySubmissionVersionRow = z.infer<
  typeof LearnerHistorySubmissionVersionRowSchema
>;
export type LearnerHistoryReviewRow = z.infer<
  typeof LearnerHistoryReviewRowSchema
>;
export type LearnerHistoryQuestionRow = z.infer<
  typeof LearnerHistoryQuestionRowSchema
>;
export type LearnerHistoryCertificateRow = z.infer<
  typeof LearnerHistoryCertificateRowSchema
>;
export type LearnerHistoryCohortContextRow = z.infer<
  typeof LearnerHistoryCohortContextRowSchema
>;

export interface LearnerHistoryDatabaseRows {
  readonly enrollments: readonly LearnerHistoryEnrollmentRow[];
  readonly attempts: readonly LearnerHistoryAttemptRow[];
  readonly submissionVersions: readonly LearnerHistorySubmissionVersionRow[];
  readonly reviews: readonly LearnerHistoryReviewRow[];
  readonly questions: readonly LearnerHistoryQuestionRow[];
  readonly certificates: readonly LearnerHistoryCertificateRow[];
}

export interface LearnerHistoryScope {
  readonly userId: string;
  readonly organizationId: string;
  readonly cohortIds: readonly string[];
}

interface LearnerHistoryEventDraft {
  readonly id: string;
  readonly sourceId: string;
  readonly kind: LearnerHistoryEventKind;
  readonly occurredAt: string;
  readonly courseId: string | null;
  readonly cohortId: string | null;
  readonly taskId: string | null;
  readonly questionId: string | null;
  readonly ordinal: number | null;
}

export type LearnerHistoryTarget =
  | { readonly type: "course"; readonly id: string }
  | { readonly type: "question"; readonly id: string }
  | { readonly type: "certificates" };

export interface LearnerHistoryEvent {
  readonly id: string;
  readonly kind: LearnerHistoryEventKind;
  readonly occurredAt: string;
  readonly courseTitle: string | null;
  readonly taskTitle: string | null;
  readonly ordinal: number | null;
  readonly target: LearnerHistoryTarget | null;
}

export interface LearnerHistoryContext {
  readonly cohortCourseIds: ReadonlyMap<string, string>;
  readonly cohortCourseTitles: ReadonlyMap<string, string>;
  readonly courseTitles: ReadonlyMap<string, string>;
  readonly taskTitles: ReadonlyMap<string, string>;
  readonly questionTaskTitles: ReadonlyMap<string, string>;
}

export interface LearnerHistoryPage {
  readonly items: readonly LearnerHistoryEvent[];
  readonly page: number;
  readonly hasPreviousPage: boolean;
  readonly hasNextPage: boolean;
  readonly reachedPageLimit: boolean;
  readonly snapshotAt: string;
}

function event(
  kind: LearnerHistoryEventKind,
  sourceId: string,
  occurredAt: string,
  context: Omit<LearnerHistoryEventDraft, "id" | "kind" | "sourceId" | "occurredAt">,
): LearnerHistoryEventDraft {
  return {
    id: `${kind}:${sourceId}`,
    kind,
    sourceId,
    occurredAt,
    ...context,
  };
}

function assertIdentityScope(
  source: string,
  sourceId: string,
  learnerId: string,
  organizationId: string,
  scope: LearnerHistoryScope,
): void {
  if (
    learnerId !== scope.userId ||
    organizationId !== scope.organizationId
  ) {
    throw new Error(`learner_history.${source}_scope_mismatch:${sourceId}`);
  }
}

function assertCohortScope(
  source: string,
  sourceId: string,
  cohortId: string,
  cohortIds: ReadonlySet<string>,
): void {
  if (!cohortIds.has(cohortId)) {
    throw new Error(`learner_history.${source}_cohort_mismatch:${sourceId}`);
  }
}

export function buildLearnerHistoryEventDrafts(
  rows: LearnerHistoryDatabaseRows,
  scope: LearnerHistoryScope,
): readonly LearnerHistoryEventDraft[] {
  const cohortIds = new Set(scope.cohortIds);
  const drafts: LearnerHistoryEventDraft[] = [];

  for (const row of rows.enrollments) {
    assertIdentityScope(
      "enrollment",
      row.id,
      row.learner_id,
      row.organization_id,
      scope,
    );
    if (row.cohort_id) {
      assertCohortScope("enrollment", row.id, row.cohort_id, cohortIds);
    }
    const context = {
      courseId: row.course_id,
      cohortId: row.cohort_id,
      taskId: null,
      questionId: null,
      ordinal: null,
    } as const;
    drafts.push(event("course_requested", row.id, row.created_at, context));
    if (row.state === "approved" && row.decided_at) {
      drafts.push(event("course_approved", row.id, row.decided_at, context));
    }
    if (
      (row.state === "assigned" || row.state === "completed") &&
      row.decided_at
    ) {
      drafts.push(event("course_assigned", row.id, row.decided_at, context));
    }
    if (row.state === "rejected" && row.decided_at) {
      drafts.push(event("course_rejected", row.id, row.decided_at, context));
    }
    if (row.state === "cancelled") {
      drafts.push(event("course_cancelled", row.id, row.updated_at, context));
    }
    if (row.state === "completed" && row.completed_at) {
      drafts.push(event("course_completed", row.id, row.completed_at, context));
    }
  }

  for (const row of rows.attempts) {
    assertIdentityScope(
      "attempt",
      row.id,
      row.learner_id,
      row.organization_id,
      scope,
    );
    assertCohortScope("attempt", row.id, row.cohort_id, cohortIds);
    drafts.push(
      event("attempt_started", row.id, row.started_at, {
        courseId: null,
        cohortId: row.cohort_id,
        taskId: row.task_id,
        questionId: null,
        ordinal: row.sequence_number,
      }),
    );
  }

  for (const row of rows.submissionVersions) {
    const parent = row.submissions;
    if (parent.id !== row.submission_id || row.submitted_by !== scope.userId) {
      throw new Error(
        `learner_history.submission_parent_mismatch:${row.id}`,
      );
    }
    assertIdentityScope(
      "submission",
      row.id,
      parent.learner_id,
      parent.organization_id,
      scope,
    );
    assertCohortScope("submission", row.id, parent.cohort_id, cohortIds);
    drafts.push(
      event(
        row.version_number === 1 ? "task_submitted" : "task_resubmitted",
        row.id,
        row.submitted_at,
        {
          courseId: null,
          cohortId: parent.cohort_id,
          taskId: parent.task_id,
          questionId: null,
          ordinal: row.version_number,
        },
      ),
    );
  }

  for (const row of rows.reviews) {
    const parent = row.submissions;
    if (parent.id !== row.submission_id) {
      throw new Error(`learner_history.review_parent_mismatch:${row.id}`);
    }
    assertIdentityScope(
      "review",
      row.id,
      parent.learner_id,
      row.organization_id,
      scope,
    );
    if (parent.organization_id !== row.organization_id) {
      throw new Error(`learner_history.review_parent_scope_mismatch:${row.id}`);
    }
    assertCohortScope("review", row.id, parent.cohort_id, cohortIds);
    drafts.push(
      event(
        row.decision === "accepted"
          ? "review_accepted"
          : "review_revision_required",
        row.id,
        row.created_at,
        {
          courseId: null,
          cohortId: parent.cohort_id,
          taskId: parent.task_id,
          questionId: null,
          ordinal: null,
        },
      ),
    );
  }

  for (const row of rows.questions) {
    assertIdentityScope(
      "question",
      row.id,
      row.learner_id,
      row.organization_id,
      scope,
    );
    assertCohortScope("question", row.id, row.cohort_id, cohortIds);
    const context = {
      courseId: null,
      cohortId: row.cohort_id,
      taskId: row.task_id,
      questionId: row.id,
      ordinal: null,
    } as const;
    drafts.push(event("question_asked", row.id, row.created_at, context));
    if (row.answered_at) {
      drafts.push(event("question_answered", row.id, row.answered_at, context));
    }
    if (row.archived_at) {
      drafts.push(event("question_archived", row.id, row.archived_at, context));
    }
  }

  for (const row of rows.certificates) {
    assertIdentityScope(
      "certificate",
      row.id,
      row.learner_id,
      row.organization_id,
      scope,
    );
    const context = {
      courseId: row.course_id,
      cohortId: null,
      taskId: null,
      questionId: null,
      ordinal: null,
    } as const;
    if (row.issued_at) {
      drafts.push(event("certificate_issued", row.id, row.issued_at, context));
    }
    if (row.available_at) {
      drafts.push(
        event("certificate_available", row.id, row.available_at, context),
      );
    }
    if (row.revoked_at) {
      drafts.push(event("certificate_revoked", row.id, row.revoked_at, context));
    }
    if (row.state === "expired" && row.expires_at) {
      drafts.push(event("certificate_expired", row.id, row.expires_at, context));
    }
  }

  const eventIds = new Set<string>();
  for (const draft of drafts) {
    if (eventIds.has(draft.id)) {
      throw new Error(`learner_history.duplicate_event:${draft.id}`);
    }
    eventIds.add(draft.id);
  }
  return drafts;
}

function compareEvents(
  left: LearnerHistoryEventDraft,
  right: LearnerHistoryEventDraft,
): number {
  const timestampOrder = right.occurredAt.localeCompare(left.occurredAt);
  if (timestampOrder !== 0) return timestampOrder;
  const kindOrder = left.kind.localeCompare(right.kind);
  if (kindOrder !== 0) return kindOrder;
  return left.id.localeCompare(right.id);
}

function resolveTarget(
  draft: LearnerHistoryEventDraft,
  courseId: string | null,
): LearnerHistoryTarget | null {
  if (draft.questionId) {
    return { type: "question", id: draft.questionId };
  }
  if (draft.kind.startsWith("certificate_")) {
    return { type: "certificates" };
  }
  const canOpenCourse = [
    "course_assigned",
    "course_completed",
    "attempt_started",
    "task_submitted",
    "task_resubmitted",
    "review_accepted",
    "review_revision_required",
  ].includes(draft.kind);
  return canOpenCourse && courseId
    ? { type: "course", id: courseId }
    : null;
}

export function projectLearnerHistoryPage(
  drafts: readonly LearnerHistoryEventDraft[],
  context: LearnerHistoryContext,
  pageInput: number,
  snapshotAtInput: string,
): LearnerHistoryPage {
  const page = LearnerHistoryPageNumberSchema.parse(pageInput);
  const snapshotAt = TimestampSchema.parse(snapshotAtInput);
  const sorted = drafts
    .filter((draft) => draft.occurredAt <= snapshotAt)
    .toSorted(compareEvents);
  const start = (page - 1) * LEARNER_HISTORY_PAGE_SIZE;
  const pageDrafts = sorted.slice(start, start + LEARNER_HISTORY_PAGE_SIZE);
  const hasAdditionalEvents =
    sorted.length > start + LEARNER_HISTORY_PAGE_SIZE;

  const items = pageDrafts.map((draft): LearnerHistoryEvent => {
    const courseId = draft.courseId ??
      (draft.cohortId
        ? context.cohortCourseIds.get(draft.cohortId) ?? null
        : null);
    if (draft.cohortId && !courseId) {
      throw new Error(
        `learner_history.cohort_context_missing:${draft.cohortId}`,
      );
    }
    const taskTitle = draft.questionId
      ? context.questionTaskTitles.get(draft.questionId) ?? null
      : draft.taskId
        ? context.taskTitles.get(draft.taskId) ?? null
        : null;
    return {
      id: draft.id,
      kind: draft.kind,
      occurredAt: draft.occurredAt,
      courseTitle:
        (draft.cohortId
          ? context.cohortCourseTitles.get(draft.cohortId) ?? null
          : null) ??
        (courseId ? context.courseTitles.get(courseId) ?? null : null),
      taskTitle,
      ordinal: draft.ordinal,
      target: resolveTarget(draft, courseId),
    };
  });

  return {
    items,
    page,
    hasPreviousPage: page > 1,
    hasNextPage: page < LEARNER_HISTORY_MAX_PAGE && hasAdditionalEvents,
    reachedPageLimit:
      page === LEARNER_HISTORY_MAX_PAGE && hasAdditionalEvents,
    snapshotAt,
  };
}

export function referencedLearnerHistoryCohortIds(
  drafts: readonly LearnerHistoryEventDraft[],
): readonly string[] {
  return [
    ...new Set(
      drafts.flatMap((draft) => (draft.cohortId ? [draft.cohortId] : [])),
    ),
  ].sort();
}
