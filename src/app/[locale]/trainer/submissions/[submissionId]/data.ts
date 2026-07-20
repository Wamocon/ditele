import "server-only";

import { z } from "zod";

import { getPrincipal } from "@/app/[locale]/_data/principal";
import type {
  EvidenceKind,
  ReviewEvidence,
  ReviewRecord,
  ReviewSubmission,
} from "@/features/review/model";
import { createServerClient } from "@/shared/database/server";
import type { Locale } from "@/shared/i18n/config";

const timestampSchema = z.string().min(1);
const submissionStateSchema = z.enum([
  "submitted",
  "revision_required",
  "resubmitted",
  "accepted",
  "withdrawn",
]);
const reviewDecisionSchema = z.enum(["accepted", "revision_required"]);
// The database contract intentionally leaves the final decision to the trainer;
// zero denotes that there is no automatic score threshold in this projection.
const MANUAL_DECISION_THRESHOLD_PERCENT = 0;

type ServerClient = Awaited<ReturnType<typeof createServerClient>>;
type ReviewContextRpcClient = {
  rpc(
    name: "get_submission_review_context",
    args: { p_submission_id: string; p_locale: Locale },
  ): Promise<{ data: unknown; error: unknown }>;
};

function reviewContextRpcClient(client: ServerClient): ReviewContextRpcClient {
  // Generated DB types are refreshed only after the coordinated migration wave.
  return client as unknown as ReviewContextRpcClient;
}

const reviewRowSchema = z.object({
  id: z.string().uuid(),
  decision: reviewDecisionSchema,
  comment: z.string(),
  reviewer_id: z.string().uuid(),
  created_at: timestampSchema,
  expected_submission_row_version: z.number().int().positive(),
  review_rubric_scores: z.array(z.object({
    criterion_id: z.string().uuid(),
    points: z.number().nonnegative(),
    comment: z.string().nullable(),
  })),
});

const submissionRowSchema = z.object({
  id: z.string().uuid(),
  organization_id: z.string().uuid(),
  task_id: z.string().uuid(),
  learner_id: z.string().uuid(),
  cohort_id: z.string().uuid(),
  state: submissionStateSchema,
  row_version: z.number().int().positive(),
  latest_version_number: z.number().int().positive(),
  created_at: timestampSchema,
  updated_at: timestampSchema,
  accepted_at: timestampSchema.nullable(),
  attempts: z.object({
    sequence_number: z.number().int().positive(),
    started_at: timestampSchema,
    elapsed_seconds: z.number().int().nonnegative(),
    attempt_hint_usage: z.array(z.object({
      hint_id: z.string().uuid(),
      first_used_at: timestampSchema,
    })),
  }),
  submission_versions: z.array(z.object({
    id: z.string().uuid(),
    version_number: z.number().int().positive(),
    answer_text: z.string(),
    selected_option_ids: z.array(z.string().uuid()),
    evidence_refs: z.array(z.string().uuid()),
    elapsed_seconds: z.number().int().nonnegative(),
    task_snapshot: z.unknown(),
    submitted_at: timestampSchema,
  })),
  reviews: z.array(reviewRowSchema),
  review_transfers: z.array(z.object({
    id: z.string().uuid(),
    from_trainer_id: z.string().uuid(),
    to_trainer_id: z.string().uuid(),
    reason: z.string(),
    expected_submission_row_version: z.number().int().positive(),
    created_at: timestampSchema,
  })),
});

const taskSnapshotSchema = z.object({
  content_version_id: z.string().uuid(),
});

const reviewContextSchema = z.object({
  content_version_id: z.string().uuid(),
  submission_version_id: z.string().uuid(),
  task_title: z.string().trim().min(1),
  options: z.array(z.object({
    id: z.string().uuid(),
    labels: z.unknown(),
  }).strict()),
  rubric: z.object({
    id: z.string().uuid(),
    labels: z.unknown(),
    version: z.number().int().positive(),
    criteria: z.array(z.object({
      id: z.string().uuid(),
      code: z.string().min(1),
      labels: z.unknown(),
      position: z.number().int().nonnegative(),
      max_points: z.number().positive(),
      required_for_acceptance: z.boolean(),
      skill_id: z.string().uuid().nullable(),
    }).strict()),
  }).strict().nullable(),
}).strict();

const evidenceRowSchema = z.object({
  id: z.string().uuid(),
  evidence_kind: z.enum([
    "submission",
    "lab",
    "upload",
    "review",
    "placement",
    "external",
  ]),
  title: z.string(),
  source_uri: z.string().nullable(),
  metadata: z.unknown(),
  captured_at: timestampSchema,
});

function iso(value: string): string {
  const timestamp = new Date(value);
  if (Number.isNaN(timestamp.getTime())) {
    throw new Error("review.invalid_timestamp");
  }
  return timestamp.toISOString();
}

function localizedLabel(value: unknown, locale: Locale, fallback: string): string {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return fallback;
  const labels = value as Readonly<Record<string, unknown>>;
  const localized = labels[locale];
  if (typeof localized === "string" && localized.trim()) return localized;
  const english = labels.en;
  if (typeof english === "string" && english.trim()) return english;
  const first = Object.values(labels).find(
    (label): label is string => typeof label === "string" && label.trim().length > 0,
  );
  return first ?? fallback;
}

function safeEvidenceUri(
  value: string | null,
  kind: z.infer<typeof evidenceRowSchema>["evidence_kind"],
): string | undefined {
  if (!value) return undefined;
  const authority = /^(https?):\/\/([^/?#\s]+)(?:[/?#][^\s]*)?$/i.exec(value);
  if (!authority) return undefined;
  try {
    const uri = new URL(value);
    if (
      !uri.hostname ||
      uri.username ||
      uri.password ||
      (kind === "external" && uri.protocol !== "https:") ||
      (uri.protocol !== "https:" && uri.protocol !== "http:")
    ) {
      return undefined;
    }
    return uri.toString();
  } catch {
    return undefined;
  }
}

function evidenceKind(
  value: z.infer<typeof evidenceRowSchema>["evidence_kind"],
): EvidenceKind {
  if (value === "upload") return "file";
  if (value === "external") return "link";
  if (value === "lab") return "lab_result";
  return "text";
}

function evidenceMetadata(value: unknown): {
  readonly mimeType?: string;
  readonly sizeBytes?: number;
} {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return {};
  const metadata = value as Readonly<Record<string, unknown>>;
  const mimeType = typeof metadata.mime_type === "string" ? metadata.mime_type : undefined;
  const sizeBytes = typeof metadata.size_bytes === "number" && metadata.size_bytes >= 0
    ? metadata.size_bytes
    : undefined;
  return {
    ...(mimeType ? { mimeType } : {}),
    ...(sizeBytes !== undefined ? { sizeBytes } : {}),
  };
}

function errorCause(...errors: readonly unknown[]): unknown {
  return errors.find((error) => error !== null && error !== undefined);
}

function mapEvidenceRows(value: unknown): readonly ReviewEvidence[] {
  return evidenceRowSchema.array().parse(value).map((item) => {
    const uri = safeEvidenceUri(item.source_uri, item.evidence_kind);
    return {
      id: item.id,
      kind: evidenceKind(item.evidence_kind),
      name: item.title,
      ...(uri ? { uri } : {}),
      ...evidenceMetadata(item.metadata),
      createdAt: iso(item.captured_at),
    };
  });
}

export async function readReviewSubmission(
  locale: Locale,
  submissionId: string,
): Promise<ReviewSubmission | null> {
  const [client, principal] = await Promise.all([
    createServerClient(),
    getPrincipal(),
  ]);
  if (
    !principal.roles.some((role) => role === "trainer" || role === "admin") ||
    !principal.permissions.some((permission) =>
      permission === "review.manage" || permission === "cohort.manage"
    )
  ) {
    return null;
  }

  const { data: unparsedSubmission, error: submissionError } = await client
    .from("submissions")
    .select(
      "id, organization_id, task_id, learner_id, cohort_id, state, row_version, latest_version_number, created_at, updated_at, accepted_at, attempts!submissions_attempt_id_fkey!inner(sequence_number, started_at, elapsed_seconds, attempt_hint_usage(hint_id, first_used_at)), submission_versions(id, version_number, answer_text, selected_option_ids, evidence_refs, elapsed_seconds, task_snapshot, submitted_at), reviews(id, decision, comment, reviewer_id, created_at, expected_submission_row_version, review_rubric_scores(criterion_id, points, comment)), review_transfers(id, from_trainer_id, to_trainer_id, reason, expected_submission_row_version, created_at)",
    )
    .eq("id", submissionId)
    .maybeSingle();
  if (submissionError) {
    throw new Error("review.submission_read_failed", { cause: submissionError });
  }
  if (!unparsedSubmission) return null;

  const row = submissionRowSchema.parse(unparsedSubmission);
  const hasResourceScope =
    principal.cohortIds.includes(row.cohort_id) ||
    principal.permissions.includes("cohort.manage");
  if (!hasResourceScope) return null;

  const latestVersion = row.submission_versions.find(
    (version) => version.version_number === row.latest_version_number,
  );
  if (!latestVersion) {
    throw new Error("review.latest_version_missing");
  }
  const taskSnapshot = taskSnapshotSchema.parse(latestVersion.task_snapshot);
  const evidenceIds = latestVersion.evidence_refs;
  const evidenceFilter = evidenceIds.length > 0
    ? `submission_version_id.eq.${latestVersion.id},id.in.(${evidenceIds.join(",")})`
    : `submission_version_id.eq.${latestVersion.id}`;

  const [profile, cohort, schedule, immutableContext, evidence] =
    await Promise.all([
      client
        .from("profiles")
        .select("display_name")
        .eq("user_id", row.learner_id)
        .maybeSingle(),
      client
        .from("cohorts")
        .select("name")
        .eq("id", row.cohort_id)
        .maybeSingle(),
      client
        .from("task_schedules")
        .select("due_at")
        .eq("cohort_id", row.cohort_id)
        .eq("task_id", row.task_id)
        .maybeSingle(),
      reviewContextRpcClient(client).rpc("get_submission_review_context", {
        p_submission_id: row.id,
        p_locale: locale,
      }),
      client
        .from("evidence")
        .select("id, evidence_kind, title, source_uri, metadata, captured_at")
        .or(evidenceFilter),
    ]);
  const contextError = errorCause(
    profile.error,
    cohort.error,
    schedule.error,
    immutableContext.error,
    evidence.error,
  );
  if (contextError) {
    throw new Error("review.submission_context_read_failed", { cause: contextError });
  }

  if (!immutableContext.data) {
    throw new Error("review.submission_context_missing");
  }
  const context = reviewContextSchema.parse(immutableContext.data);
  if (
    context.content_version_id !== taskSnapshot.content_version_id ||
    context.submission_version_id !== latestVersion.id
  ) {
    throw new Error("review.submission_context_pin_mismatch");
  }
  const rubricRow = context.rubric ?? undefined;
  const rubric = rubricRow
    ? {
        id: rubricRow.id,
        version: rubricRow.version,
        title: localizedLabel(rubricRow.labels, locale, "Rubric"),
        criteria: rubricRow.criteria
          .toSorted((left, right) => left.position - right.position)
          .map((criterion) => ({
            id: criterion.id,
            title: localizedLabel(criterion.labels, locale, criterion.code),
            description: criterion.code,
            ...(criterion.skill_id ? { skillId: criterion.skill_id } : {}),
            maxScore: criterion.max_points,
            weight: 1,
            required: criterion.required_for_acceptance,
          })),
        acceptanceThresholdPercent: MANUAL_DECISION_THRESHOLD_PERCENT,
      }
    : undefined;
  const reviewHistory: ReviewRecord[] = row.reviews
    .toSorted((left, right) => Date.parse(right.created_at) - Date.parse(left.created_at))
    .map((review) => ({
      id: review.id,
      decision: review.decision,
      comment: review.comment,
      reviewerId: review.reviewer_id,
      createdAt: iso(review.created_at),
      version: review.expected_submission_row_version,
    }));
  const latestTransfer = row.review_transfers.toSorted((left, right) => {
    const timestampOrder = Date.parse(right.created_at) - Date.parse(left.created_at);
    return timestampOrder !== 0 ? timestampOrder : right.id.localeCompare(left.id);
  })[0];
  const evidenceItems = mapEvidenceRows(evidence.data ?? []);
  const optionsById = new Map(
    context.options.map((option) => [
      option.id,
      {
        id: option.id,
        label: localizedLabel(option.labels, locale, option.id),
      },
    ]),
  );
  const selectedAnswers = latestVersion.selected_option_ids.map((optionId) => {
    const option = optionsById.get(optionId);
    if (!option) throw new Error("review.selected_option_context_missing");
    return option;
  });
  const hintUsage = row.attempts.attempt_hint_usage.map((usage) => ({
    hintId: usage.hint_id,
    usedAt: iso(usage.first_used_at),
  }));

  return {
    id: row.id,
    organizationId: row.organization_id,
    taskId: row.task_id,
    learnerId: row.learner_id,
    groupId: row.cohort_id,
    attemptNumber: row.attempts.sequence_number,
    state: row.state,
    version: row.row_version,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
    submittedAt: iso(latestVersion.submitted_at),
    ...(reviewHistory[0] ? { reviewedAt: reviewHistory[0].createdAt } : {}),
    learnerName: profile.data?.display_name ?? row.learner_id,
    groupName: cohort.data?.name ?? row.cohort_id,
    taskTitle: context.task_title,
    ...(latestTransfer ? { assignedTrainerId: latestTransfer.to_trainer_id } : {}),
    answerText: latestVersion.answer_text,
    selectedAnswerIds: latestVersion.selected_option_ids,
    selectedAnswers,
    evidence: evidenceItems,
    hintUsage,
    solvingDurationSeconds: latestVersion.elapsed_seconds,
    startedAt: iso(row.attempts.started_at),
    immutableSnapshot: {
      taskVersionId: taskSnapshot.content_version_id,
      answerText: latestVersion.answer_text,
      selectedAnswerIds: latestVersion.selected_option_ids,
      evidence: evidenceItems,
      hintUsage,
      solvingDurationSeconds: latestVersion.elapsed_seconds,
    },
    ...(reviewHistory[0] ? { latestReview: reviewHistory[0] } : {}),
    reviewHistory,
    ...(latestTransfer
      ? {
          transfer: {
            id: latestTransfer.id,
            fromTrainerId: latestTransfer.from_trainer_id,
            toTrainerId: latestTransfer.to_trainer_id,
            reason: latestTransfer.reason,
            createdAt: iso(latestTransfer.created_at),
            status: "accepted",
          },
        }
      : {}),
    ...(rubric ? { rubric } : {}),
    ...(schedule.data?.due_at ? { dueAt: iso(schedule.data.due_at) } : {}),
  } satisfies ReviewSubmission;
}
