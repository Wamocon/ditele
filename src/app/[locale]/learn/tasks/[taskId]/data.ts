import "server-only";

import { z } from "zod";

import {
  AttemptDetailSchema,
  EvidenceRefSchema,
  type AttemptDetail,
  type EvidenceRef,
} from "@/features/tasks/model/attempt";
import {
  type LearnerTask,
} from "@/features/tasks/model/task";
import { getMyLearningTaskProjection } from "@/features/learning/server/learner-published-content-data";
import { toLearnerTask } from "@/features/learning/server/learner-published-content";
import { createServerClient } from "@/shared/database/server";

export class TaskNotAccessibleError extends Error {
  constructor() {
    super("tasks.forbidden");
    this.name = "TaskNotAccessibleError";
  }
}

type AttemptRow = {
  id: string;
  learner_id: string;
  cohort_id: string;
  sequence_number: number;
  state: string;
  row_version: number;
  elapsed_seconds: number;
  hint_used: boolean;
  hint_first_used_at: string | null;
  started_at: string;
  submitted_at: string | null;
  accepted_at: string | null;
  created_at: string;
  updated_at: string;
};

function iso(value: string): string {
  const timestamp = new Date(value);
  if (Number.isNaN(timestamp.getTime())) throw new Error("tasks.invalid_timestamp");
  return timestamp.toISOString();
}

function attemptState(value: string): AttemptDetail["state"] {
  switch (value) {
    case "in_progress":
      return "draft";
    case "submitted":
    case "revision_required":
    case "resubmitted":
    case "accepted":
    case "abandoned":
      return value;
    default:
      throw new Error("tasks.invalid_attempt_state");
  }
}

const PersistedEvidenceLinkSchema = z.object({
  position: z.number().int().nonnegative(),
  evidence_id: z.string().uuid(),
  evidence: z.object({
    id: z.string().uuid(),
    evidence_kind: z.enum([
      "submission",
      "lab",
      "upload",
      "review",
      "placement",
      "external",
    ]),
    title: z.string().trim().min(1).max(255),
    source_uri: z.string().nullable(),
    captured_at: z.string(),
  }).strict(),
}).strict();

const PersistedHintUsageSchema = z.object({
  hint_id: z.string().uuid(),
  first_used_at: z.string(),
}).strict();

function readDraftEvidence(value: unknown): EvidenceRef[] {
  const draftItems = z.array(z.unknown()).max(50).parse(value);
  const evidence = draftItems.map((item) => {
    const createdAt =
      typeof item === "object" && item !== null
        ? (item as Record<string, unknown>).createdAt
        : undefined;
    const normalized =
      typeof item === "object" && item !== null && typeof createdAt === "string"
        ? {
            ...item,
            createdAt: iso(createdAt),
          }
        : item;
    return EvidenceRefSchema.parse(normalized);
  });
  if (new Set(evidence.map((item) => item.id)).size !== evidence.length) {
    throw new Error("tasks.duplicate_evidence_draft");
  }
  return evidence;
}

function readPersistedEvidence(value: unknown): EvidenceRef[] {
  const rows = PersistedEvidenceLinkSchema.array().parse(value ?? []);
  const evidenceIds = new Set<string>();
  return rows.map((row, index) => {
    if (
      row.position !== index ||
      row.evidence.id !== row.evidence_id ||
      evidenceIds.has(row.evidence_id)
    ) {
      throw new Error("tasks.invalid_submission_evidence_snapshot");
    }
    evidenceIds.add(row.evidence_id);
    const createdAt = iso(row.evidence.captured_at);
    if (row.evidence.evidence_kind === "external") {
      if (!row.evidence.source_uri) {
        throw new Error("tasks.invalid_external_evidence_snapshot");
      }
      if (!/^https:\/\/[^/?#\s]+(?:[/?#][^\s]*)?$/i.test(row.evidence.source_uri)) {
        throw new Error("tasks.invalid_external_evidence_snapshot");
      }
      let source: URL;
      try {
        source = new URL(row.evidence.source_uri);
      } catch {
        throw new Error("tasks.invalid_external_evidence_snapshot");
      }
      if (
        source.protocol !== "https:" ||
        source.hostname.length === 0 ||
        source.username.length > 0 ||
        source.password.length > 0
      ) {
        throw new Error("tasks.invalid_external_evidence_snapshot");
      }
      return EvidenceRefSchema.parse({
        id: row.evidence.id,
        kind: "link",
        name: row.evidence.title,
        uri: source.toString(),
        createdAt,
      });
    }
    return EvidenceRefSchema.parse({
      id: row.evidence.id,
      kind: "record",
      name: row.evidence.title,
      createdAt,
    });
  });
}

function readPersistedHintUsage(value: unknown) {
  const rows = PersistedHintUsageSchema.array().max(100).parse(value ?? []);
  const hintIds = new Set<string>();
  return rows.map((usage) => {
    if (hintIds.has(usage.hint_id)) {
      throw new Error("tasks.duplicate_submission_hint_snapshot");
    }
    hintIds.add(usage.hint_id);
    return {
      hintId: usage.hint_id,
      usedAt: iso(usage.first_used_at),
    };
  });
}

export async function readTaskWorkspace(
  taskId: string,
): Promise<{ task: LearnerTask; enrollmentId: string; attempt?: AttemptDetail }> {
  const client = await createServerClient();
  const projection = await getMyLearningTaskProjection(client, taskId);
  if (projection === null) throw new TaskNotAccessibleError();
  const { task, enrollmentId } = toLearnerTask(projection);

  const { data: attemptData, error: attemptError } = await client
    .from("attempts")
    .select(
      "id, learner_id, cohort_id, sequence_number, state, row_version, elapsed_seconds, hint_used, hint_first_used_at, started_at, submitted_at, accepted_at, created_at, updated_at",
    )
    .eq("enrollment_id", enrollmentId)
    .eq("cohort_id", task.groupId)
    .eq("task_id", taskId)
    .order("sequence_number", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (attemptError) {
    throw new Error("tasks.workspace_read_failed", { cause: attemptError });
  }

  if (!attemptData) return { task, enrollmentId };
  const attemptRow = attemptData as AttemptRow;
  const [draftResult, submissionResult, hintUsageResult] = await Promise.all([
    client
      .from("attempt_drafts")
      .select("answer_text, selected_option_ids, evidence_draft, row_version")
      .eq("attempt_id", attemptRow.id)
      .maybeSingle(),
    client
      .from("submissions")
      .select("id, state, latest_version_number")
      .eq("attempt_id", attemptRow.id)
      .maybeSingle(),
    client
      .from("attempt_hint_usage")
      .select("hint_id, first_used_at")
      .eq("attempt_id", attemptRow.id)
      .order("first_used_at", { ascending: true }),
  ]);
  if (draftResult.error || submissionResult.error || hintUsageResult.error) {
    throw new Error("tasks.attempt_detail_read_failed", {
      cause: draftResult.error ?? submissionResult.error ?? hintUsageResult.error,
    });
  }
  const draft = draftResult.data;
  const submission = submissionResult.data;
  const versionAndReviewResults = submission
    ? await Promise.all([
        client
          .from("submission_versions")
          .select(
            "id, version_number, answer_text, selected_option_ids, elapsed_seconds, submitted_at",
          )
          .eq("submission_id", submission.id)
          .order("version_number", { ascending: false }),
        client
          .from("reviews")
          .select("id, decision, comment, reviewer_id, submission_version_id, created_at")
          .eq("submission_id", submission.id)
          .order("created_at", { ascending: false }),
      ])
    : null;
  if (
    versionAndReviewResults?.[0].error ||
    versionAndReviewResults?.[1].error
  ) {
    throw new Error("tasks.submission_history_read_failed", {
      cause:
        versionAndReviewResults[0].error ?? versionAndReviewResults[1].error,
    });
  }
  const versions = versionAndReviewResults?.[0].data ?? [];
  const reviews = versionAndReviewResults?.[1].data ?? [];
  const latestVersion = versions?.[0];
  const snapshotResults = latestVersion
    ? await Promise.all([
        client
          .from("submission_version_evidence")
          .select(
            "position, evidence_id, evidence!submission_version_evidence_evidence_fk(id, evidence_kind, title, source_uri, captured_at)",
          )
          .eq("submission_version_id", latestVersion.id)
          .order("position", { ascending: true }),
        client
          .from("submission_version_hint_usage")
          .select("hint_id, first_used_at")
          .eq("submission_version_id", latestVersion.id)
          .order("first_used_at", { ascending: true }),
      ])
    : null;
  if (snapshotResults?.[0].error || snapshotResults?.[1].error) {
    throw new Error("tasks.submission_snapshot_read_failed", {
      cause: snapshotResults[0].error ?? snapshotResults[1].error,
    });
  }
  const versionNumbers = new Map(
    versions.map((version) => [version.id, version.version_number]),
  );
  const history = (reviews ?? []).flatMap((review, index) =>
    review.decision === "accepted" || review.decision === "revision_required"
      ? [{
          id: review.id,
          decision: review.decision,
          comment: review.comment,
          reviewerId: review.reviewer_id,
          createdAt: iso(review.created_at),
          version:
            versionNumbers.get(review.submission_version_id) ??
            Math.max(1, (reviews?.length ?? 0) - index),
        }]
      : [],
  );
  const answerText = draft?.answer_text ?? latestVersion?.answer_text ?? "";
  const selectedAnswerIds =
    draft?.selected_option_ids ?? latestVersion?.selected_option_ids ?? [];
  const evidence = draft
    ? readDraftEvidence(draft.evidence_draft)
    : readPersistedEvidence(snapshotResults?.[0].data ?? []);
  const hintUsage = draft || !latestVersion
    ? (hintUsageResult.data ?? []).map((usage) => ({
        hintId: usage.hint_id,
        usedAt: iso(usage.first_used_at),
      }))
    : readPersistedHintUsage(snapshotResults?.[1].data);

  const attempt = AttemptDetailSchema.parse({
    id: attemptRow.id,
    taskId,
    learnerId: attemptRow.learner_id,
    groupId: attemptRow.cohort_id,
    attemptNumber: attemptRow.sequence_number,
    state: attemptState(attemptRow.state),
    version: Math.max(1, attemptRow.row_version),
    draftVersion: draft?.row_version ?? 0,
    createdAt: iso(attemptRow.created_at),
    updatedAt: iso(attemptRow.updated_at),
    ...(attemptRow.submitted_at ? { submittedAt: iso(attemptRow.submitted_at) } : {}),
    ...(attemptRow.accepted_at ? { reviewedAt: iso(attemptRow.accepted_at) } : {}),
    answerText,
    selectedAnswerIds,
    evidence,
    hintUsage,
    solvingDurationSeconds: latestVersion?.elapsed_seconds ?? attemptRow.elapsed_seconds,
    startedAt: iso(attemptRow.started_at),
    ...(latestVersion
      ? {
          immutableSnapshot: {
            taskVersionId: `${taskId}:${task.version}`,
            answerText: latestVersion.answer_text,
            selectedAnswerIds: latestVersion.selected_option_ids,
            evidence,
            hintUsage,
            solvingDurationSeconds: latestVersion.elapsed_seconds,
          },
        }
      : {}),
    ...(history[0] ? { latestReview: history[0] } : {}),
    reviewHistory: history,
  });

  return { task, enrollmentId, attempt };
}
