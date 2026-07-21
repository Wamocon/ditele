import "server-only";

import { createServerClient } from "@/shared/database/server";
import { fromSupabase, type Result } from "./result";

/**
 * ⭐ Typed wrappers for the P0 RPCs.
 *
 * Signatures are the REAL ones, introspected from the live database and
 * recorded in plan/status/RPC_CONTRACTS.md. **Do not guess an argument name.**
 *
 * Three things that catch everybody (RPC_CONTRACTS.md §0):
 *  1. Almost every mutation needs p_correlation_id + p_idempotency_key +
 *     p_expected_version. You must read the row's `row_version` first.
 *  2. get_my_learning_task returns localized fields as {de,en,ru} objects.
 *     get_public_catalog / get_my_learning_course resolve via p_locale instead.
 *  3. Only list_my_learning_history paginates, and it is keyset, not offset.
 */

/** The single organization on this deployment. Never hardcode this in a page. */
export const DEFAULT_ORGANIZATION_ID = "01980a10-0000-7000-8000-000000000001";

export const newCorrelationId = () => crypto.randomUUID();

/** Localized payloads come back keyed by locale. Resolve with a fallback chain. */
export type LocalizedText = Partial<Record<string, string>>;
export function pickLocale(map: LocalizedText | null | undefined, locale: string): string {
  if (!map) return "";
  return map[locale] || map.de || map.en || Object.values(map).find(Boolean) || "";
}

async function rpc<T>(name: string, args: Record<string, unknown>): Promise<Result<T>> {
  const supabase = await createServerClient();
  return fromSupabase<T>(async () => {
    const { data, error } = await supabase.rpc(name as never, args as never);
    return { data: data as T | null, error };
  });
}

/* ── Public catalog — WS-1 ──────────────────────────────────────────────── */

export function getPublicCatalog(locale: string) {
  return rpc<unknown[]>("get_public_catalog", { p_locale: locale });
}

/** Pass exactly one of slug or courseId. The catalog route uses the slug. */
export function getPublicCatalogCourse(args: { slug?: string; courseId?: string }) {
  return rpc<unknown>("get_public_catalog_course", {
    ...(args.slug !== undefined ? { p_slug: args.slug } : {}),
    ...(args.courseId !== undefined ? { p_course_id: args.courseId } : {}),
  });
}

/* ── Student learning — WS-2 ────────────────────────────────────────────── */

export function listMyLearningCourses(locale: string) {
  return rpc<unknown[]>("list_my_learning_courses", { p_locale: locale });
}

export function getMyLearningCourse(courseId: string, locale: string) {
  return rpc<unknown>("get_my_learning_course", { p_course_id: courseId, p_locale: locale });
}

/** ⚠️ No p_locale. Returns {de,en,ru} objects — use pickLocale(). */
export function getMyLearningTask(taskId: string) {
  return rpc<unknown>("get_my_learning_task", { p_task_id: taskId });
}

export function startAttempt(args: { taskId: string; enrollmentId: string; idempotencyKey: string }) {
  return rpc<unknown[]>("start_attempt", {
    p_task_id: args.taskId,
    p_enrollment_id: args.enrollmentId,
    p_correlation_id: newCorrelationId(),
    p_idempotency_key: args.idempotencyKey,
  });
}

/** ⚠️ p_expected_draft_version, NOT p_expected_version. evidenceDraft is an ARRAY. */
export function saveAttemptDraft(args: {
  attemptId: string;
  answerText: string;
  selectedOptionIds: string[];
  usedHintIds: string[];
  evidenceDraft: unknown[];
  elapsedSeconds: number;
  expectedDraftVersion: number;
}) {
  return rpc<unknown>("save_attempt_draft", {
    p_attempt_id: args.attemptId,
    p_answer_text: args.answerText,
    p_selected_option_ids: args.selectedOptionIds,
    p_used_hint_ids: args.usedHintIds,
    p_evidence_draft: args.evidenceDraft,
    p_elapsed_seconds: args.elapsedSeconds,
    p_expected_draft_version: args.expectedDraftVersion,
  });
}

export function submitAttempt(args: {
  attemptId: string;
  answerText: string;
  selectedOptionIds: string[];
  evidenceRefs: string[];
  expectedVersion: number;
  idempotencyKey: string;
}) {
  return rpc<unknown>("submit_attempt", {
    p_attempt_id: args.attemptId,
    p_answer_text: args.answerText,
    p_selected_option_ids: args.selectedOptionIds,
    p_evidence_refs: args.evidenceRefs,
    p_expected_version: args.expectedVersion,
    p_correlation_id: newCorrelationId(),
    p_idempotency_key: args.idempotencyKey,
  });
}

/** The only paginated RPC, and it is keyset. Student-only: trainer/admin get 42501. */
export function listMyLearningHistory(args: {
  locale: string;
  limit?: number;
  beforeEventId?: string;
  beforeOccurredAt?: string;
  snapshotAt?: string;
}) {
  return rpc<unknown[]>("list_my_learning_history", {
    p_locale: args.locale,
    p_limit: args.limit ?? 20,
    ...(args.beforeEventId !== undefined ? { p_before_event_id: args.beforeEventId } : {}),
    ...(args.beforeOccurredAt !== undefined ? { p_before_occurred_at: args.beforeOccurredAt } : {}),
    ...(args.snapshotAt !== undefined ? { p_snapshot_at: args.snapshotAt } : {}),
  });
}

/* ── Enrolment — WS-3 / WS-6 ────────────────────────────────────────────── */

/** ⚠️ Requires p_organization_id, and the actor needs a public.entitlements row. */
export function requestEnrollment(args: {
  courseId: string;
  idempotencyKey: string;
  requestNote?: string;
  organizationId?: string;
}) {
  return rpc<unknown>("request_enrollment", {
    p_course_id: args.courseId,
    p_organization_id: args.organizationId ?? DEFAULT_ORGANIZATION_ID,
    p_idempotency_key: args.idempotencyKey,
    ...(args.requestNote !== undefined ? { p_request_note: args.requestNote } : {}),
  });
}

/** ⚠️ p_decision is the enrollment_state enum. No idempotency key on this one. */
export function decideEnrollment(args: {
  enrollmentId: string;
  decision: "approved" | "rejected";
  reason: string;
  expectedVersion: number;
}) {
  return rpc<unknown>("decide_enrollment", {
    p_enrollment_id: args.enrollmentId,
    p_decision: args.decision,
    p_reason: args.reason,
    p_expected_version: args.expectedVersion,
    p_correlation_id: newCorrelationId(),
  });
}

export function assignEnrollment(args: {
  enrollmentId: string;
  cohortId: string;
  reason: string;
  expectedVersion: number;
}) {
  return rpc<unknown>("assign_enrollment", {
    p_enrollment_id: args.enrollmentId,
    p_cohort_id: args.cohortId,
    p_reason: args.reason,
    p_expected_version: args.expectedVersion,
    p_correlation_id: newCorrelationId(),
  });
}

/* ── Q&A — WS-3 / WS-4 ──────────────────────────────────────────────────── */

export function createQuestion(args: {
  taskId: string;
  cohortId: string;
  subject: string;
  body: string;
  idempotencyKey: string;
}) {
  return rpc<unknown>("create_question", {
    p_task_id: args.taskId,
    p_cohort_id: args.cohortId,
    p_subject: args.subject,
    p_body: args.body,
    p_correlation_id: newCorrelationId(),
    p_idempotency_key: args.idempotencyKey,
  });
}

export const listMyQuestionParticipantContexts = () =>
  rpc<unknown[]>("list_my_question_participant_contexts", {});

export const listMyAvailableQuestionContexts = (locale: string) =>
  rpc<unknown[]>("list_my_available_question_contexts", { p_locale: locale });

export function claimQuestion(args: { questionId: string; expectedVersion: number; idempotencyKey: string }) {
  return rpc<unknown>("claim_question", {
    p_question_id: args.questionId,
    p_expected_version: args.expectedVersion,
    p_correlation_id: newCorrelationId(),
    p_idempotency_key: args.idempotencyKey,
  });
}

export function answerQuestion(args: {
  questionId: string;
  body: string;
  expectedVersion: number;
  idempotencyKey: string;
}) {
  return rpc<unknown>("answer_question", {
    p_question_id: args.questionId,
    p_body: args.body,
    p_expected_version: args.expectedVersion,
    p_correlation_id: newCorrelationId(),
    p_idempotency_key: args.idempotencyKey,
  });
}

/** ⚠️ No idempotency key on archive. */
export function archiveQuestion(args: { questionId: string; expectedVersion: number }) {
  return rpc<unknown>("archive_question", {
    p_question_id: args.questionId,
    p_expected_version: args.expectedVersion,
    p_correlation_id: newCorrelationId(),
  });
}

/* ── Trainer review — WS-4 ──────────────────────────────────────────────── */

export function getSubmissionReviewContext(submissionId: string, locale: string) {
  return rpc<unknown>("get_submission_review_context", {
    p_submission_id: submissionId,
    p_locale: locale,
  });
}

/**
 * ⚠️ Eight required arguments. p_submission_version_id and p_expected_version
 * are two DIFFERENT things — both come from the review context payload.
 * p_criterion_scores is required even though rubrics are P1: pass {}.
 */
export function decideSubmission(args: {
  submissionId: string;
  submissionVersionId: string;
  expectedVersion: number;
  decision: "accepted" | "revision_required" | "transferred";
  comment: string;
  criterionScores?: Record<string, unknown>;
  idempotencyKey: string;
}) {
  return rpc<unknown>("decide_submission", {
    p_submission_id: args.submissionId,
    p_submission_version_id: args.submissionVersionId,
    p_expected_version: args.expectedVersion,
    p_decision: args.decision,
    p_comment: args.comment,
    p_criterion_scores: args.criterionScores ?? {},
    p_correlation_id: newCorrelationId(),
    p_idempotency_key: args.idempotencyKey,
  });
}

export const listActiveCohortTrainers = (cohortId: string) =>
  rpc<unknown[]>("list_active_cohort_trainers", { p_cohort_id: cohortId });

/* ── Content lifecycle — WS-5 ───────────────────────────────────────────── */

export function publishContentVersion(args: {
  contentVersionId: string;
  expectedVersion: number;
  idempotencyKey: string;
}) {
  return rpc<unknown>("publish_content_version", {
    p_content_version_id: args.contentVersionId,
    p_expected_version: args.expectedVersion,
    p_correlation_id: newCorrelationId(),
    p_idempotency_key: args.idempotencyKey,
  });
}

export const getContentArchiveImpact = (contentVersionId: string) =>
  rpc<unknown>("get_content_archive_impact", { p_content_version_id: contentVersionId });

/** ⚠️ Call getContentArchiveImpact first — its fingerprint is required here. */
export function archiveContentVersion(args: {
  contentVersionId: string;
  reason: string;
  impactFingerprint: string;
  expectedVersion: number;
  idempotencyKey: string;
}) {
  return rpc<unknown>("archive_content_version", {
    p_content_version_id: args.contentVersionId,
    p_reason: args.reason,
    p_impact_fingerprint: args.impactFingerprint,
    p_expected_version: args.expectedVersion,
    p_correlation_id: newCorrelationId(),
    p_idempotency_key: args.idempotencyKey,
  });
}

export function transitionCohort(args: {
  cohortId: string;
  targetState: "waiting" | "active" | "completed" | "cancelled";
  reason: string;
  expectedVersion: number;
  idempotencyKey?: string;
}) {
  return rpc<unknown>("transition_cohort", {
    p_cohort_id: args.cohortId,
    p_target_state: args.targetState,
    p_reason: args.reason,
    p_expected_version: args.expectedVersion,
    p_correlation_id: newCorrelationId(),
    ...(args.idempotencyKey !== undefined ? { p_idempotency_key: args.idempotencyKey } : {}),
  });
}

/* ── Profile & notifications — WS-3 ─────────────────────────────────────── */

export function updateOwnProfile(args: {
  displayName: string;
  locale: string;
  timezone: string;
  expectedVersion: number;
  idempotencyKey: string;
}) {
  return rpc<unknown>("update_own_profile", {
    p_display_name: args.displayName,
    p_locale: args.locale,
    p_timezone: args.timezone,
    p_expected_version: args.expectedVersion,
    p_correlation_id: newCorrelationId(),
    p_idempotency_key: args.idempotencyKey,
  });
}

export function markNotificationRead(args: {
  notificationId: string;
  expectedVersion: number;
  idempotencyKey: string;
}) {
  return rpc<unknown>("mark_notification_read", {
    p_notification_id: args.notificationId,
    p_expected_version: args.expectedVersion,
    p_correlation_id: newCorrelationId(),
    p_idempotency_key: args.idempotencyKey,
  });
}

/** ⚠️ p_before is required — pass new Date().toISOString(). */
export function markAllNotificationsRead(args: { before?: string; idempotencyKey: string }) {
  return rpc<unknown>("mark_all_notifications_read", {
    p_before: args.before ?? new Date().toISOString(),
    p_correlation_id: newCorrelationId(),
    p_idempotency_key: args.idempotencyKey,
  });
}


