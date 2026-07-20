import "server-only";

import { z } from "zod";

import { hasPermission, hasRole } from "@/shared/auth/authorization";
import { AuthorizationDeniedError } from "@/shared/auth/errors";
import type { Principal } from "@/shared/auth/types";
import { createServerClient } from "@/shared/database/server";
import type { Locale } from "@/shared/i18n/config";

import {
  LEARNER_HISTORY_MAX_PAGE,
  LEARNER_HISTORY_PAGE_SIZE,
  LearnerHistoryEventKindSchema,
  LearnerHistoryPageNumberSchema,
  type LearnerHistoryEvent,
  type LearnerHistoryEventKind,
  type LearnerHistoryPage,
  type LearnerHistoryTarget,
} from "../model/learner-history";

const timestampSchema = z
  .string()
  .datetime({ offset: true });
const uuidSchema = z.string().uuid();
const maximumSnapshotClockSkewMs = 5 * 60 * 1_000;
const maximumRpcPageSize = 100;

const taskEventKinds = new Set<LearnerHistoryEventKind>([
  "attempt_started",
  "task_submitted",
  "task_resubmitted",
  "review_accepted",
  "review_revision_required",
  "question_asked",
  "question_answered",
  "question_archived",
]);
const questionEventKinds = new Set<LearnerHistoryEventKind>([
  "question_asked",
  "question_answered",
  "question_archived",
]);
const courseTargetEventKinds = new Set<LearnerHistoryEventKind>([
  "course_assigned",
  "course_completed",
  "attempt_started",
  "task_submitted",
  "task_resubmitted",
  "review_accepted",
  "review_revision_required",
]);

const learnerHistoryRpcRowSchema = z
  .object({
    event_id: z.string().trim().min(3).max(200),
    event_kind: LearnerHistoryEventKindSchema,
    occurred_at: timestampSchema,
    organization_id: uuidSchema,
    course_id: uuidSchema.nullable(),
    cohort_id: uuidSchema.nullable(),
    task_id: uuidSchema.nullable(),
    question_id: uuidSchema.nullable(),
    ordinal: z.number().int().positive().nullable(),
    course_title: z.string().trim().min(1).max(300).nullable(),
    task_title: z.string().trim().min(1).max(300).nullable(),
  })
  .strict()
  .superRefine((row, context) => {
    if (!row.event_id.startsWith(`${row.event_kind}:`)) {
      context.addIssue({
        code: "custom",
        message: "learner_history.event_identity_mismatch",
        path: ["event_id"],
      });
    }
    if (
      taskEventKinds.has(row.event_kind) &&
      (!row.course_id || !row.cohort_id || !row.task_id ||
        !row.course_title || !row.task_title)
    ) {
      context.addIssue({
        code: "custom",
        message: "learner_history.task_context_incomplete",
      });
    }
    if (questionEventKinds.has(row.event_kind) && !row.question_id) {
      context.addIssue({
        code: "custom",
        message: "learner_history.question_context_incomplete",
        path: ["question_id"],
      });
    }
  });

type LearnerHistoryRpcRow = z.infer<typeof learnerHistoryRpcRowSchema>;

type ServerClient = Awaited<ReturnType<typeof createServerClient>>;

function requireLearnerHistoryAccess(principal: Principal): string {
  if (
    !hasRole(principal, "learner") ||
    !hasPermission(principal, "cohort.read") ||
    principal.organizationId === null
  ) {
    throw new AuthorizationDeniedError("cohort.read");
  }
  return principal.organizationId;
}

export function resolveLearnerHistorySnapshot(
  input: string | undefined,
  now = new Date(),
): string {
  if (input === undefined) return now.toISOString();
  const parsed = timestampSchema.parse(input);
  const snapshot = new Date(parsed);
  if (snapshot.valueOf() > now.valueOf() + maximumSnapshotClockSkewMs) {
    throw new Error("learner_history.snapshot_is_in_the_future");
  }
  return snapshot.toISOString();
}

function isStrictlyBefore(
  previous: LearnerHistoryRpcRow,
  current: LearnerHistoryRpcRow,
): boolean {
  const previousMicros = timestampMicros(previous.occurred_at);
  const currentMicros = timestampMicros(current.occurred_at);
  return previousMicros > currentMicros ||
    (previousMicros === currentMicros && previous.event_id > current.event_id);
}

function timestampMicros(value: string): bigint {
  const fraction = /\.(\d{1,9})(?:Z|[+-]\d{2}:\d{2})$/.exec(value)?.[1] ?? "";
  const microseconds = fraction.slice(0, 6).padEnd(6, "0");
  const subMillisecondMicros = BigInt(microseconds.slice(3, 6));
  return BigInt(Date.parse(value)) * 1_000n + subMillisecondMicros;
}

function targetFor(row: LearnerHistoryRpcRow): LearnerHistoryTarget | null {
  if (row.question_id) return { type: "question", id: row.question_id };
  if (row.event_kind.startsWith("certificate_")) {
    return { type: "certificates" };
  }
  if (courseTargetEventKinds.has(row.event_kind) && row.course_id) {
    return { type: "course", id: row.course_id };
  }
  return null;
}

function projectEvent(row: LearnerHistoryRpcRow): LearnerHistoryEvent {
  return {
    id: row.event_id,
    kind: row.event_kind,
    occurredAt: new Date(row.occurred_at).toISOString(),
    courseTitle: row.course_title,
    taskTitle: row.task_title,
    ordinal: row.ordinal,
    target: targetFor(row),
  };
}

async function readHistoryWindow(
  client: ServerClient,
  organizationId: string,
  locale: Locale,
  snapshotAt: string,
  requiredRows: number,
): Promise<readonly LearnerHistoryRpcRow[]> {
  const rows: LearnerHistoryRpcRow[] = [];
  const eventIds = new Set<string>();
  let beforeOccurredAt: string | null = null;
  let beforeEventId: string | null = null;

  while (rows.length < requiredRows) {
    const limit = Math.min(maximumRpcPageSize, requiredRows - rows.length);
    const { data, error } = await client.rpc("list_my_learning_history", {
      p_locale: locale,
      p_snapshot_at: snapshotAt,
      p_limit: limit,
      ...(beforeOccurredAt && beforeEventId
        ? {
            p_before_occurred_at: beforeOccurredAt,
            p_before_event_id: beforeEventId,
          }
        : {}),
    });
    if (error) {
      throw new Error("learner_history.read_failed", { cause: error });
    }

    const batch = learnerHistoryRpcRowSchema.array().parse(data ?? []);
    for (const row of batch) {
      if (row.organization_id !== organizationId) {
        throw new Error(
          `learner_history.organization_scope_mismatch:${row.event_id}`,
        );
      }
      const previous = rows.at(-1);
      if (previous && !isStrictlyBefore(previous, row)) {
        throw new Error(`learner_history.order_mismatch:${row.event_id}`);
      }
      if (eventIds.has(row.event_id)) {
        throw new Error(`learner_history.duplicate_event:${row.event_id}`);
      }
      eventIds.add(row.event_id);
      rows.push(row);
    }

    if (batch.length < limit) break;
    const cursor = batch.at(-1);
    if (!cursor) break;
    beforeOccurredAt = cursor.occurred_at;
    beforeEventId = cursor.event_id;
  }
  return rows;
}

export async function readLearnerHistory(
  principal: Principal,
  locale: Locale,
  pageInput: number,
  snapshotInput?: string,
): Promise<LearnerHistoryPage> {
  const organizationId = requireLearnerHistoryAccess(principal);
  const page = LearnerHistoryPageNumberSchema.parse(pageInput);
  const snapshotAt = resolveLearnerHistorySnapshot(snapshotInput);
  const requiredRows = page * LEARNER_HISTORY_PAGE_SIZE + 1;
  const client = await createServerClient();
  const rows = await readHistoryWindow(
    client,
    organizationId,
    locale,
    snapshotAt,
    requiredRows,
  );
  const start = (page - 1) * LEARNER_HISTORY_PAGE_SIZE;
  const items = rows
    .slice(start, start + LEARNER_HISTORY_PAGE_SIZE)
    .map(projectEvent);
  const hasAdditionalEvents = rows.length > start + LEARNER_HISTORY_PAGE_SIZE;

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
