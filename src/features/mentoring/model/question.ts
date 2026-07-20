import { z } from "zod";

export const QuestionStateSchema = z.enum([
  "open",
  "assigned",
  "transferred",
  "answered",
  "archived",
]);

export type QuestionState = z.infer<typeof QuestionStateSchema>;

export const QuestionMessageSchema = z.object({
  id: z.string().min(1),
  author: z.object({
    id: z.string().min(1),
    kind: z.enum(["learner", "trainer"]),
  }),
  body: z.string().trim().min(1).max(10_000),
  createdAt: z.string().datetime(),
});

export type QuestionMessage = z.infer<typeof QuestionMessageSchema>;

export const QuestionTransferSchema = z.object({
  id: z.string().min(1),
  fromTrainerId: z.string().min(1).optional(),
  toTrainerId: z.string().min(1),
  reason: z.string().trim().min(1).max(1000).optional(),
  state: z.enum(["pending", "accepted", "failed"]),
  createdAt: z.string().datetime(),
});

export const QuestionEventSchema = z.object({
  id: z.string().min(1),
  type: z.enum(["created", "assigned", "transferred", "answered", "archived"]),
  actorId: z.string().min(1),
  createdAt: z.string().datetime(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const QuestionThreadSchema = z.object({
  id: z.string().min(1),
  taskId: z.string().min(1),
  learnerId: z.string().min(1),
  groupId: z.string().min(1),
  state: QuestionStateSchema,
  version: z.number().int().positive(),
  assignedTrainerId: z.string().min(1).optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  answeredAt: z.string().datetime().optional(),
  archivedAt: z.string().datetime().optional(),
  messages: z.array(QuestionMessageSchema),
  transferHistory: z.array(QuestionTransferSchema),
  history: z.array(QuestionEventSchema),
});

export type QuestionThread = z.infer<typeof QuestionThreadSchema>;

export const CreateQuestionInputSchema = z.object({
  taskId: z.string().min(1),
  groupId: z.string().min(1),
  body: z.string().trim().min(1).max(10_000),
  idempotencyKey: z.string().trim().min(12).max(128),
});

export type CreateQuestionInput = z.infer<typeof CreateQuestionInputSchema>;

export const ArchiveQuestionInputSchema = z.object({
  questionId: z.string().min(1),
  expectedVersion: z.number().int().positive(),
  idempotencyKey: z.string().trim().min(12).max(128),
});

export type ArchiveQuestionInput = z.infer<typeof ArchiveQuestionInputSchema>;

const QUESTION_TRANSITIONS: Readonly<Record<QuestionState, readonly QuestionState[]>> = {
  open: ["assigned", "archived"],
  assigned: ["transferred", "answered", "archived"],
  transferred: ["assigned", "archived"],
  answered: ["archived"],
  archived: [],
};

export function canTransitionQuestion(from: QuestionState, to: QuestionState): boolean {
  return QUESTION_TRANSITIONS[from].includes(to);
}
