import "server-only";

import { z } from "zod";

import { getPrincipal } from "@/app/[locale]/_data/principal";
import { readActiveQuestionTrainers } from "@/features/cohorts/server/active-trainers";
import { createServerClient } from "@/shared/database/server";
import type { Locale } from "@/shared/i18n/config";

import {
  canTrainerActOnQuestion,
  isQuestionHistoryState,
  isQuestionQueueState,
  QuestionContextSchema,
  QuestionDetailViewSchema,
  QuestionSummarySchema,
  type QuestionContext,
  type QuestionDetailView,
  type QuestionSummary,
} from "../question-workflow-model";
import type { TrainerCandidate } from "../trainer-question-actions";

const timestampSchema = z.string().min(1);

const questionRowSchema = z.object({
  id: z.string().uuid(),
  organization_id: z.string().uuid(),
  learner_id: z.string().uuid(),
  cohort_id: z.string().uuid(),
  task_id: z.string().uuid(),
  content_version_id: z.string().uuid(),
  assigned_trainer_id: z.string().uuid().nullable(),
  state: z.enum(["open", "assigned", "transferred", "answered", "archived"]),
  subject: z.string().min(1),
  row_version: z.number().int().positive(),
  created_at: timestampSchema,
  updated_at: timestampSchema,
  answered_at: timestampSchema.nullable(),
  archived_at: timestampSchema.nullable(),
  question_messages: z.array(z.object({
    id: z.string().uuid(),
    author_id: z.string().uuid(),
    body: z.string().min(1),
    message_kind: z.enum(["message", "answer", "system"]),
    created_at: timestampSchema,
  })),
  question_transfers: z.array(z.object({
    id: z.string().uuid(),
    from_trainer_id: z.string().uuid(),
    to_trainer_id: z.string().uuid(),
    reason: z.string().min(1),
    created_at: timestampSchema,
  })),
});

type QuestionRow = z.infer<typeof questionRowSchema>;
type ServerClient = Awaited<ReturnType<typeof createServerClient>>;

type QuestionSnapshotRpcClient = {
  rpc(
    name:
      | "list_my_available_question_contexts"
      | "list_my_question_task_contexts",
    args: { p_locale: Locale },
  ): Promise<{ data: unknown; error: unknown }>;
  rpc(
    name: "list_my_question_participant_contexts",
  ): Promise<{ data: unknown; error: unknown }>;
};

function questionSnapshotRpcClient(client: ServerClient): QuestionSnapshotRpcClient {
  // Generated DB types are refreshed only after the coordinated migration wave.
  return client as unknown as QuestionSnapshotRpcClient;
}

const QUESTION_GRAPH =
  "id, organization_id, learner_id, cohort_id, task_id, content_version_id, assigned_trainer_id, state, subject, row_version, created_at, updated_at, answered_at, archived_at, question_messages(id, author_id, body, message_kind, created_at), question_transfers(id, from_trainer_id, to_trainer_id, reason, created_at)";

const availableQuestionContextRowSchema = z.object({
  cohort_id: z.string().uuid(),
  cohort_name: z.string().trim().min(1),
  task_id: z.string().uuid(),
  task_title: z.string().trim().min(1),
}).strict();

const historicalQuestionTaskContextRowSchema = z.object({
  question_id: z.string().uuid(),
  task_title: z.string().trim().min(1),
}).strict();

const questionParticipantContextRowSchema = z.object({
  question_id: z.string().uuid(),
  user_id: z.string().uuid(),
  display_name: z.string().trim().min(1),
}).strict();

function iso(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error("questions.invalid_timestamp");
  return date.toISOString();
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}

function canManageQuestions(roles: readonly string[], permissions: readonly string[]): boolean {
  return (
    roles.some((role) => role === "trainer" || role === "admin") &&
    permissions.some(
      (permission) => permission === "question.manage" || permission === "cohort.manage",
    )
  );
}

type ContextMaps = {
  cohortNames: ReadonlyMap<string, string>;
  profileNames: ReadonlyMap<string, string>;
  questionTaskTitles: ReadonlyMap<string, string>;
};

async function readContextMaps(
  client: ServerClient,
  locale: Locale,
  rows: readonly QuestionRow[],
): Promise<ContextMaps> {
  if (rows.length === 0) {
    return {
      cohortNames: new Map(),
      profileNames: new Map(),
      questionTaskTitles: new Map(),
    };
  }

  const cohortIds = unique(rows.map((row) => row.cohort_id));
  const profileIds = unique(rows.flatMap((row) => [
    row.learner_id,
    ...(row.assigned_trainer_id ? [row.assigned_trainer_id] : []),
    ...row.question_messages.map((message) => message.author_id),
    ...row.question_transfers.flatMap((transfer) => [
      transfer.from_trainer_id,
      transfer.to_trainer_id,
    ]),
  ]));
  const [cohorts, historicalTaskContexts, participants] = await Promise.all([
    client.from("cohorts").select("id, name").in("id", cohortIds),
    questionSnapshotRpcClient(client).rpc(
      "list_my_question_task_contexts",
      { p_locale: locale },
    ),
    questionSnapshotRpcClient(client).rpc(
      "list_my_question_participant_contexts",
    ),
  ]);
  if (cohorts.error || historicalTaskContexts.error || participants.error) {
    throw new Error("questions.context_read_failed", {
      cause: cohorts.error ?? historicalTaskContexts.error ?? participants.error,
    });
  }

  const questionTaskTitles = new Map(
    historicalQuestionTaskContextRowSchema.array()
      .parse(historicalTaskContexts.data ?? [])
      .map((context) => [context.question_id, context.task_title] as const),
  );
  const requestedQuestionIds = new Set(rows.map((row) => row.id));
  const expectedParticipantKeys = new Set(rows.flatMap((row) => [
    row.learner_id,
    ...(row.assigned_trainer_id ? [row.assigned_trainer_id] : []),
    ...row.question_messages.map((message) => message.author_id),
    ...row.question_transfers.flatMap((transfer) => [
      transfer.from_trainer_id,
      transfer.to_trainer_id,
    ]),
  ].map((userId) => `${row.id}:${userId}`)));
  const participantRows = questionParticipantContextRowSchema.array()
    .parse(participants.data ?? [])
    .filter((participant) => requestedQuestionIds.has(participant.question_id));
  const participantKeys = new Set<string>();
  const profileNames = new Map<string, string>();
  for (const participant of participantRows) {
    const key = `${participant.question_id}:${participant.user_id}`;
    if (
      participantKeys.has(key) ||
      !expectedParticipantKeys.has(key) ||
      (profileNames.has(participant.user_id) &&
        profileNames.get(participant.user_id) !== participant.display_name)
    ) {
      throw new Error("questions.participant_scope_mismatch");
    }
    participantKeys.add(key);
    profileNames.set(participant.user_id, participant.display_name);
  }
  if (
    profileIds.some((userId) => !profileNames.has(userId)) ||
    participantKeys.size !== expectedParticipantKeys.size
  ) {
    throw new Error("questions.participant_context_missing");
  }

  return {
    cohortNames: new Map(cohorts.data.map((cohort) => [cohort.id, cohort.name])),
    profileNames,
    questionTaskTitles,
  };
}

function summary(row: QuestionRow, maps: ContextMaps): QuestionSummary {
  const assignedTrainerName = row.assigned_trainer_id
    ? maps.profileNames.get(row.assigned_trainer_id) ?? row.assigned_trainer_id
    : undefined;
  return QuestionSummarySchema.parse({
    id: row.id,
    learnerId: row.learner_id,
    learnerName: maps.profileNames.get(row.learner_id) ?? row.learner_id,
    cohortId: row.cohort_id,
    cohortName: maps.cohortNames.get(row.cohort_id) ?? row.cohort_id,
    taskId: row.task_id,
    taskTitle: maps.questionTaskTitles.get(row.id) ?? row.task_id,
    subject: row.subject,
    state: row.state,
    version: row.row_version,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
    ...(row.assigned_trainer_id ? { assignedTrainerId: row.assigned_trainer_id } : {}),
    ...(assignedTrainerName ? { assignedTrainerName } : {}),
  });
}

function detail(row: QuestionRow, maps: ContextMaps): QuestionDetailView {
  const base = summary(row, maps);
  return QuestionDetailViewSchema.parse({
    ...base,
    ...(row.answered_at ? { answeredAt: iso(row.answered_at) } : {}),
    ...(row.archived_at ? { archivedAt: iso(row.archived_at) } : {}),
    messages: row.question_messages
      .toSorted((left, right) => Date.parse(left.created_at) - Date.parse(right.created_at))
      .map((message) => ({
        id: message.id,
        authorId: message.author_id,
        authorName:
          maps.profileNames.get(message.author_id) ??
          (message.author_id === row.learner_id ? base.learnerName : message.author_id),
        authorKind: message.author_id === row.learner_id ? "learner" : "trainer",
        body: message.body,
        kind: message.message_kind,
        createdAt: iso(message.created_at),
      })),
    transfers: row.question_transfers
      .toSorted((left, right) => Date.parse(left.created_at) - Date.parse(right.created_at))
      .map((transfer) => ({
        id: transfer.id,
        fromTrainerId: transfer.from_trainer_id,
        fromTrainerName:
          maps.profileNames.get(transfer.from_trainer_id) ?? transfer.from_trainer_id,
        toTrainerId: transfer.to_trainer_id,
        toTrainerName:
          maps.profileNames.get(transfer.to_trainer_id) ?? transfer.to_trainer_id,
        reason: transfer.reason,
        createdAt: iso(transfer.created_at),
      })),
  });
}

async function readLearnerContexts(
  client: ServerClient,
  locale: Locale,
): Promise<QuestionContext[]> {
  const { data, error } = await questionSnapshotRpcClient(client).rpc(
    "list_my_available_question_contexts",
    { p_locale: locale },
  );
  if (error) {
    throw new Error("questions.context_task_read_failed", { cause: error });
  }

  return availableQuestionContextRowSchema.array().parse(data ?? []).map(
    (context) => QuestionContextSchema.parse({
      cohortId: context.cohort_id,
      cohortName: context.cohort_name,
      taskId: context.task_id,
      taskTitle: context.task_title,
    }),
  );
}

export async function readLearnerQuestionWorkspace(locale: Locale): Promise<{
  contexts: readonly QuestionContext[];
  questions: readonly QuestionSummary[];
}> {
  const [client, principal] = await Promise.all([
    createServerClient(),
    getPrincipal(),
  ]);
  if (!principal.roles.includes("learner")) throw new Error("questions.forbidden");

  const [questionResult, contexts] = await Promise.all([
    client
      .from("questions")
      .select(QUESTION_GRAPH)
      .eq("learner_id", principal.userId)
      .order("updated_at", { ascending: false }),
    readLearnerContexts(client, locale),
  ]);
  if (questionResult.error) {
    throw new Error("questions.list_read_failed", { cause: questionResult.error });
  }
  const rows = questionRowSchema.array().parse(questionResult.data);
  const maps = await readContextMaps(client, locale, rows);
  return { contexts, questions: rows.map((row) => summary(row, maps)) };
}

export async function readLearnerQuestionDetail(
  locale: Locale,
  questionId: string,
): Promise<QuestionDetailView | null> {
  const [client, principal] = await Promise.all([
    createServerClient(),
    getPrincipal(),
  ]);
  if (!principal.roles.includes("learner")) return null;
  const { data, error } = await client
    .from("questions")
    .select(QUESTION_GRAPH)
    .eq("id", questionId)
    .eq("learner_id", principal.userId)
    .maybeSingle();
  if (error) throw new Error("questions.detail_read_failed", { cause: error });
  if (!data) return null;
  const row = questionRowSchema.parse(data);
  const maps = await readContextMaps(client, locale, [row]);
  return detail(row, maps);
}

export async function readTrainerQuestionQueue(
  locale: Locale,
  history: boolean,
): Promise<readonly QuestionSummary[]> {
  const [client, principal] = await Promise.all([
    createServerClient(),
    getPrincipal(),
  ]);
  if (!canManageQuestions(principal.roles, principal.permissions)) {
    throw new Error("questions.forbidden");
  }
  const states = history ? ["answered", "archived"] as const : ["open", "assigned", "transferred"] as const;
  const { data, error } = await client
    .from("questions")
    .select(QUESTION_GRAPH)
    .in("state", [...states])
    .order("updated_at", { ascending: history });
  if (error) throw new Error("questions.queue_read_failed", { cause: error });

  const canManageAll = principal.permissions.includes("cohort.manage");
  const rows = questionRowSchema.array().parse(data).filter((row) => {
    const relevantState = history
      ? isQuestionHistoryState(row.state)
      : isQuestionQueueState(row.state);
    if (!relevantState) return false;
    if (canManageAll || row.state === "open") return true;
    return row.assigned_trainer_id === principal.userId;
  });
  const maps = await readContextMaps(client, locale, rows);
  return rows.map((row) => summary(row, maps));
}

export async function readTrainerQuestionDetail(
  locale: Locale,
  questionId: string,
): Promise<{
  canAct: boolean;
  candidates: readonly TrainerCandidate[];
  isOwner: boolean;
  question: QuestionDetailView;
} | null> {
  const [client, principal] = await Promise.all([
    createServerClient(),
    getPrincipal(),
  ]);
  if (!canManageQuestions(principal.roles, principal.permissions)) return null;
  const { data, error } = await client
    .from("questions")
    .select(QUESTION_GRAPH)
    .eq("id", questionId)
    .maybeSingle();
  if (error) throw new Error("questions.detail_read_failed", { cause: error });
  if (!data) return null;

  const row = questionRowSchema.parse(data);
  const maps = await readContextMaps(client, locale, [row]);
  const question = detail(row, maps);
  const canAct = canTrainerActOnQuestion(question, principal.userId);
  const candidates = canAct
    ? await readActiveQuestionTrainers(client, question.cohortId, principal.userId)
    : [];
  return {
    canAct,
    candidates,
    isOwner: question.assignedTrainerId === principal.userId,
    question,
  };
}
