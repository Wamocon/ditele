import "server-only";

import { z } from "zod";
import { createServerClient } from "@/shared/database/server";
import { requirePrincipal } from "@/shared/auth/principal";
import { err, ok, type Result } from "./result";
import { failPostgrest, shapeError } from "./profile";
import {
  createQuestion,
  listMyAvailableQuestionContexts,
  listMyQuestionParticipantContexts,
} from "./rpc";

/**
 * WS-3 · the learner's side of Q&A.
 *
 * Three sources have to be stitched together, because no single RPC returns a
 * question list:
 *   1. `questions`                              — the rows themselves (RLS-scoped)
 *   2. `list_my_question_task_contexts`          — question_id → task_title
 *   3. `list_my_question_participant_contexts`   — question_id → participant names
 *
 * The names matter: a learner cannot read another user's `profiles` row (their
 * own is the only one RLS returns), so the trainer's display name is only
 * reachable through the participant-context RPC.
 */

const QuestionSchema = z.object({
  id: z.string(),
  subject: z.string(),
  state: z.string(),
  task_id: z.string(),
  cohort_id: z.string(),
  learner_id: z.string(),
  assigned_trainer_id: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
  answered_at: z.string().nullable(),
  archived_at: z.string().nullable(),
  row_version: z.number(),
});

export type QuestionRow = z.infer<typeof QuestionSchema>;

export interface QuestionListItem extends QuestionRow {
  taskTitle: string | null;
  isWaiting: boolean;
}

const TaskContextSchema = z.object({
  question_id: z.string(),
  task_title: z.string().nullable(),
});

const ParticipantSchema = z.object({
  question_id: z.string(),
  user_id: z.string(),
  display_name: z.string().nullable(),
});

export type QuestionParticipant = z.infer<typeof ParticipantSchema>;

const AvailableContextSchema = z.object({
  cohort_id: z.string(),
  cohort_name: z.string().nullable(),
  task_id: z.string(),
  task_title: z.string().nullable(),
});

export type QuestionContext = z.infer<typeof AvailableContextSchema>;

const MessageSchema = z.object({
  id: z.string(),
  question_id: z.string(),
  author_id: z.string(),
  body: z.string(),
  message_kind: z.string(),
  created_at: z.string(),
});

export type QuestionMessage = z.infer<typeof MessageSchema>;

/** A question is "waiting" until a trainer has answered it. */
const WAITING_STATES = new Set(["open", "assigned", "transferred"]);

async function taskTitlesByQuestion(): Promise<Map<string, string | null>> {
  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc("list_my_question_task_contexts", { p_locale: "de" });
  if (error) return new Map();
  const parsed = z.array(TaskContextSchema).safeParse(data ?? []);
  if (!parsed.success) return new Map();
  return new Map(parsed.data.map((row) => [row.question_id, row.task_title]));
}

/**
 * Waiting questions first, then newest activity first — the order a learner
 * checking "did anyone answer me" actually wants.
 */
export async function listMyQuestions(
  args: { limit?: number; offset?: number } = {}
): Promise<Result<{ items: QuestionListItem[]; total: number }>> {
  const limit = args.limit ?? 50;
  const offset = args.offset ?? 0;
  const supabase = await createServerClient();

  const [{ data, error, count }, titles] = await Promise.all([
    supabase
      .from("questions")
      .select("*", { count: "exact" })
      .order("updated_at", { ascending: false })
      .range(offset, offset + limit - 1),
    taskTitlesByQuestion(),
  ]);

  if (error) return failPostgrest(error);
  const parsed = z.array(QuestionSchema).safeParse(data ?? []);
  if (!parsed.success) return shapeError("Die Fragen");

  const items = parsed.data
    .map((row) => ({
      ...row,
      taskTitle: titles.get(row.id) ?? null,
      isWaiting: WAITING_STATES.has(row.state),
    }))
    .sort((a, b) => {
      if (a.isWaiting !== b.isWaiting) return a.isWaiting ? -1 : 1;
      return b.updated_at.localeCompare(a.updated_at);
    });

  return ok({ items, total: count ?? items.length });
}

export interface QuestionThread {
  question: QuestionRow;
  taskTitle: string | null;
  messages: QuestionMessage[];
  /** user_id → display name, for message authorship. */
  participants: Map<string, string>;
  myUserId: string;
}

export async function getQuestionThread(questionId: string): Promise<Result<QuestionThread>> {
  const principal = await requirePrincipal().catch(() => null);
  if (!principal) return err({ code: "AUTH", message: "Nicht angemeldet.", retryable: false });

  const supabase = await createServerClient();
  const [questionResponse, messagesResponse, participantsResult, titles] = await Promise.all([
    supabase.from("questions").select("*").eq("id", questionId).maybeSingle(),
    supabase
      .from("question_messages")
      .select("*")
      .eq("question_id", questionId)
      .order("created_at", { ascending: true }),
    listMyQuestionParticipantContexts(),
    taskTitlesByQuestion(),
  ]);

  if (questionResponse.error) return failPostgrest(questionResponse.error);
  if (!questionResponse.data) {
    return err({ code: "PGRST116", message: "Nicht gefunden.", retryable: false });
  }
  const question = QuestionSchema.safeParse(questionResponse.data);
  if (!question.success) return shapeError("Die Frage");

  if (messagesResponse.error) return failPostgrest(messagesResponse.error);
  const messages = z.array(MessageSchema).safeParse(messagesResponse.data ?? []);
  if (!messages.success) return shapeError("Der Frageverlauf");

  const participants = new Map<string, string>();
  if (participantsResult.ok) {
    const parsed = z.array(ParticipantSchema).safeParse(participantsResult.data);
    if (parsed.success) {
      for (const row of parsed.data) {
        if (row.question_id === questionId && row.display_name) {
          participants.set(row.user_id, row.display_name);
        }
      }
    }
  }

  return ok({
    question: question.data,
    taskTitle: titles.get(questionId) ?? null,
    messages: messages.data,
    participants,
    myUserId: principal.userId,
  });
}

/** The "ask about which task" picker. Empty when nothing is assigned yet. */
export async function listAskableContexts(locale: string): Promise<Result<QuestionContext[]>> {
  const result = await listMyAvailableQuestionContexts(locale);
  if (!result.ok) return result;
  const parsed = z.array(AvailableContextSchema).safeParse(result.data);
  if (!parsed.success) return shapeError("Die Aufgabenauswahl");
  return ok(parsed.data);
}

export async function askQuestion(args: {
  taskId: string;
  cohortId: string;
  subject: string;
  body: string;
}): Promise<Result<{ id: string }>> {
  const result = await createQuestion({
    taskId: args.taskId,
    cohortId: args.cohortId,
    subject: args.subject,
    body: args.body,
    // The RPC rejects an idempotency key outside 16–200 characters.
    idempotencyKey: `question:${crypto.randomUUID()}`,
  });
  if (!result.ok) return result;

  const parsed = z.object({ id: z.string() }).safeParse(result.data);
  if (!parsed.success) return shapeError("Die neue Frage");
  return ok(parsed.data);
}
