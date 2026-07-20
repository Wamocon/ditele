"use server";

import { createHash, randomUUID } from "node:crypto";

import { z } from "zod";

import { getPrincipal } from "@/app/[locale]/_data/principal";
import {
  SaveAttemptDraftInputSchema,
  SubmitAttemptInputSchema,
  type AttemptDetail,
  type SaveAttemptDraftInput,
  type SubmitAttemptInput,
} from "@/features/tasks/model/attempt";
import {
  CreateExternalEvidenceInputSchema,
  type CreateExternalEvidenceInput,
} from "@/features/tasks/model/external-evidence";
import type { Json } from "@/shared/database/database.types";
import { createServerClient } from "@/shared/database/server";

import { readTaskWorkspace } from "./data";

const UuidSchema = z.string().uuid();
const TaskActionContextSchema = z.object({
  enrollmentId: UuidSchema,
  groupId: UuidSchema,
  taskId: UuidSchema,
}).strict();
type TaskActionContext = z.infer<typeof TaskActionContextSchema>;

type TaskServerClient = Awaited<ReturnType<typeof createServerClient>>;
type SubmitAttemptCommand = {
  p_attempt_id: string;
  p_expected_version: number;
  p_idempotency_key: string;
  p_answer_text: string;
  p_selected_option_ids: string[];
  p_evidence_refs: string[];
  p_correlation_id: string;
};

const ExactAttemptStartSchema = z.object({
  attempt_id: UuidSchema,
  organization_id: UuidSchema,
  enrollment_id: UuidSchema,
  cohort_id: UuidSchema,
  course_id: UuidSchema,
  content_version_id: UuidSchema,
  task_id: UuidSchema,
  attempt_state: z.enum([
    "in_progress",
    "submitted",
    "revision_required",
    "resubmitted",
  ]),
  attempt_row_version: z.number().int().positive(),
  replayed: z.boolean(),
  correlation_id: UuidSchema,
}).strict();

const ExternalEvidenceRowSchema = z.object({
  id: UuidSchema,
  organization_id: UuidSchema,
  owner_id: UuidSchema,
  task_id: UuidSchema,
  evidence_kind: z.literal("external"),
  title: z.string().trim().min(1).max(255),
  source_uri: z.string().url(),
  sha256_hex: z.string().regex(/^[0-9a-f]{64}$/),
  captured_at: z.string().datetime({ offset: true }),
});

function validateIdentifiers(
  context: TaskActionContext,
  input: SaveAttemptDraftInput | SubmitAttemptInput,
): void {
  UuidSchema.parse(input.taskId);
  UuidSchema.parse(input.groupId);
  if (input.attemptId) UuidSchema.parse(input.attemptId);
  z.array(UuidSchema).parse(input.selectedAnswerIds);
  z.array(UuidSchema).parse(input.usedHintIds);
  z.string().min(16).max(128).parse(input.idempotencyKey);
  if (input.taskId !== context.taskId || input.groupId !== context.groupId) {
    throw new Error("tasks.context_mismatch");
  }
  if (!input.taskVersionId.startsWith(`${input.taskId}:`)) {
    throw new Error("tasks.invalid_task_version");
  }
}

function evidenceDraft(input: SaveAttemptDraftInput): Json {
  return input.evidence.map((item) => ({ ...item })) as Json;
}

function providerErrorCode(error: unknown): string | null {
  if (typeof error !== "object" || error === null || !("code" in error)) {
    return null;
  }
  return typeof error.code === "string" && error.code.length > 0
    ? error.code
    : null;
}

function isAmbiguousSubmissionFailure(error: unknown): boolean {
  const code = providerErrorCode(error);
  if (code === null) return true;
  // SQLSTATE and PostgREST errors are authoritative failed responses. Fetch,
  // proxy, and connection failures commonly have an empty or non-standard code
  // and may have lost a response after the transaction committed.
  return !/^(?:[0-9A-Z]{5}|PGRST\d+)$/.test(code);
}

async function executeSubmitAttempt(
  client: TaskServerClient,
  command: SubmitAttemptCommand,
): Promise<void> {
  let firstFailure: unknown;
  try {
    const { error } = await client.rpc("submit_attempt", command);
    if (!error) return;
    firstFailure = error;
  } catch (error) {
    firstFailure = error;
  }

  if (!isAmbiguousSubmissionFailure(firstFailure)) {
    throw new Error("tasks.submit_failed", { cause: firstFailure });
  }

  // The receipt is keyed by actor, operation, and idempotency key and also
  // binds the complete payload and expected version. Replaying this exact
  // command either returns the committed result or executes it once; it cannot
  // create a duplicate submission version, reward, audit event, or outbox event.
  let recoveryFailure: unknown;
  try {
    const { error } = await client.rpc("submit_attempt", command);
    if (!error) return;
    recoveryFailure = error;
  } catch (error) {
    recoveryFailure = error;
  }

  throw new Error("tasks.submit_failed", {
    cause: new AggregateError(
      [firstFailure, recoveryFailure],
      "submission response recovery failed",
    ),
  });
}

async function requireLearnerAttempt(
  context: TaskActionContext,
  input: { attemptId?: string | undefined; idempotencyKey: string },
): Promise<{
  attemptId: string;
  client: Awaited<ReturnType<typeof createServerClient>>;
  principal: Awaited<ReturnType<typeof getPrincipal>>;
}> {
  const [principal, client] = await Promise.all([
    getPrincipal(),
    createServerClient(),
  ]);
  if (
    !principal.roles.includes("learner") ||
    principal.organizationId === null
  ) {
    throw new Error("tasks.forbidden");
  }

  let attemptId = input.attemptId;
  if (!attemptId) {
    const { data, error } = await client.rpc("start_attempt", {
      p_enrollment_id: context.enrollmentId,
      p_task_id: context.taskId,
      p_idempotency_key: input.idempotencyKey,
      p_correlation_id: randomUUID(),
    });
    if (error) throw new Error("tasks.start_failed", { cause: error });
    const [started] = z.tuple([ExactAttemptStartSchema]).parse(data);
    if (
      started.enrollment_id !== context.enrollmentId ||
      started.cohort_id !== context.groupId ||
      started.task_id !== context.taskId ||
      started.organization_id !== principal.organizationId
    ) {
      throw new Error("tasks.start_context_mismatch");
    }
    attemptId = started.attempt_id;
  }

  const { data: attempt, error: attemptError } = await client
    .from("attempts")
    .select("id, organization_id, enrollment_id, learner_id, cohort_id, task_id")
    .eq("id", attemptId)
    .eq("learner_id", principal.userId)
    .maybeSingle();
  if (attemptError) {
    throw new Error("tasks.attempt_read_failed", { cause: attemptError });
  }
  if (
    !attempt ||
    attempt.id !== attemptId ||
    attempt.organization_id !== principal.organizationId ||
    attempt.enrollment_id !== context.enrollmentId ||
    attempt.learner_id !== principal.userId ||
    attempt.task_id !== context.taskId ||
    attempt.cohort_id !== context.groupId
  ) {
    throw new Error("tasks.forbidden");
  }

  return { attemptId, client, principal };
}

export async function saveAttemptDraftAction(
  unsafeContext: TaskActionContext,
  unsafeInput: SaveAttemptDraftInput,
): Promise<AttemptDetail> {
  const context = TaskActionContextSchema.parse(unsafeContext);
  const input = SaveAttemptDraftInputSchema.parse(unsafeInput);
  validateIdentifiers(context, input);
  const { attemptId, client } = await requireLearnerAttempt(context, input);

  const { error } = await client.rpc("save_attempt_draft", {
    p_attempt_id: attemptId,
    p_expected_draft_version: input.expectedVersion,
    p_answer_text: input.answerText,
    p_selected_option_ids: input.selectedAnswerIds,
    p_evidence_draft: evidenceDraft(input),
    p_elapsed_seconds: input.solvingDurationSeconds,
    p_used_hint_ids: input.usedHintIds,
  });
  if (error) throw new Error("tasks.save_failed", { cause: error });

  const workspace = await readTaskWorkspace(input.taskId);
  if (!workspace.attempt || workspace.attempt.id !== attemptId) {
    throw new Error("tasks.saved_attempt_unavailable");
  }
  return workspace.attempt;
}

export async function submitAttemptAction(
  unsafeContext: TaskActionContext,
  unsafeInput: SubmitAttemptInput,
): Promise<AttemptDetail> {
  const context = TaskActionContextSchema.parse(unsafeContext);
  const input = SubmitAttemptInputSchema.parse(unsafeInput);
  validateIdentifiers(context, input);
  z.array(UuidSchema).parse(input.evidence.map((item) => item.id));
  const { attemptId, client } = await requireLearnerAttempt(context, input);

  const command = {
    p_attempt_id: attemptId,
    p_expected_version: input.expectedVersion,
    p_idempotency_key: input.idempotencyKey,
    p_answer_text: input.answerText,
    p_selected_option_ids: input.selectedAnswerIds,
    p_evidence_refs: input.evidence.map((item) => item.id),
    p_correlation_id: randomUUID(),
  } satisfies SubmitAttemptCommand;
  await executeSubmitAttempt(client, command);

  const workspace = await readTaskWorkspace(input.taskId);
  if (!workspace.attempt || workspace.attempt.id !== attemptId) {
    throw new Error("tasks.submitted_attempt_unavailable");
  }
  return workspace.attempt;
}

function externalEvidenceDigest(title: string, sourceUri: string): string {
  return createHash("sha256")
    .update("ditele-external-evidence-reference-v1\0", "utf8")
    .update(title, "utf8")
    .update("\0", "utf8")
    .update(sourceUri, "utf8")
    .digest("hex");
}

export async function createExternalTaskEvidenceAction(
  unsafeContext: TaskActionContext,
  unsafeInput: CreateExternalEvidenceInput,
) {
  const context = TaskActionContextSchema.parse(unsafeContext);
  const input = CreateExternalEvidenceInputSchema.parse(unsafeInput);
  const { attemptId, client, principal } = await requireLearnerAttempt(
    context,
    input,
  );
  const digest = externalEvidenceDigest(input.title, input.sourceUri);
  const { data, error } = await client.rpc("create_external_task_evidence", {
      p_attempt_id: attemptId,
      p_title: input.title,
      p_source_uri: input.sourceUri,
      p_sha256_hex: digest,
      p_idempotency_key: input.idempotencyKey,
  });
  if (error) {
    throw new Error("tasks.evidence_create_failed", { cause: error });
  }
  const evidence = ExternalEvidenceRowSchema.parse(data);
  if (
    principal.organizationId === null ||
    evidence.organization_id !== principal.organizationId ||
    evidence.owner_id !== principal.userId ||
    evidence.task_id !== context.taskId ||
    evidence.title !== input.title ||
    evidence.source_uri !== input.sourceUri ||
    evidence.sha256_hex !== digest
  ) {
    throw new Error("tasks.evidence_context_mismatch");
  }
  return {
    id: evidence.id,
    kind: "link" as const,
    name: evidence.title,
    uri: evidence.source_uri,
    createdAt: new Date(evidence.captured_at).toISOString(),
  };
}
