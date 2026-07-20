import { z } from "zod";

import { QuestionStateSchema, type QuestionState } from "./model/question";

export const QuestionContextSchema = z.object({
  cohortId: z.string().uuid(),
  cohortName: z.string().min(1),
  taskId: z.string().uuid(),
  taskTitle: z.string().min(1),
});

export type QuestionContext = z.infer<typeof QuestionContextSchema>;

export const QuestionSummarySchema = z.object({
  id: z.string().uuid(),
  learnerId: z.string().uuid(),
  learnerName: z.string().min(1),
  cohortId: z.string().uuid(),
  cohortName: z.string().min(1),
  taskId: z.string().uuid(),
  taskTitle: z.string().min(1),
  subject: z.string().min(1),
  state: QuestionStateSchema,
  version: z.number().int().positive(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  assignedTrainerId: z.string().uuid().optional(),
  assignedTrainerName: z.string().min(1).optional(),
});

export type QuestionSummary = z.infer<typeof QuestionSummarySchema>;

export const QuestionMessageViewSchema = z.object({
  id: z.string().uuid(),
  authorId: z.string().uuid(),
  authorName: z.string().min(1),
  authorKind: z.enum(["learner", "trainer"]),
  body: z.string().min(1),
  kind: z.enum(["message", "answer", "system"]),
  createdAt: z.string().datetime(),
});

export type QuestionMessageView = z.infer<typeof QuestionMessageViewSchema>;

export const QuestionTransferViewSchema = z.object({
  id: z.string().uuid(),
  fromTrainerId: z.string().uuid(),
  fromTrainerName: z.string().min(1),
  toTrainerId: z.string().uuid(),
  toTrainerName: z.string().min(1),
  reason: z.string().min(1),
  createdAt: z.string().datetime(),
});

export type QuestionTransferView = z.infer<typeof QuestionTransferViewSchema>;

export const QuestionDetailViewSchema = QuestionSummarySchema.extend({
  answeredAt: z.string().datetime().optional(),
  archivedAt: z.string().datetime().optional(),
  messages: z.array(QuestionMessageViewSchema),
  transfers: z.array(QuestionTransferViewSchema),
});

export type QuestionDetailView = z.infer<typeof QuestionDetailViewSchema>;

export function isQuestionQueueState(state: QuestionState): boolean {
  return state === "open" || state === "assigned" || state === "transferred";
}

export function isQuestionHistoryState(state: QuestionState): boolean {
  return state === "answered" || state === "archived";
}

export function canTrainerActOnQuestion(
  question: Pick<QuestionSummary, "assignedTrainerId" | "state">,
  trainerId: string,
): boolean {
  return (
    (question.state === "assigned" || question.state === "transferred") &&
    question.assignedTrainerId === trainerId
  );
}

