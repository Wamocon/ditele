import { z } from "zod";

import type { Database } from "@/shared/database/database.types";

import {
  correlationIdSchema,
  expectedVersionSchema,
  idempotencyKeySchema,
  utcDateTimeSchema,
  uuidSchema,
} from "./common";

type DatabaseEnrollmentState = Database["public"]["Enums"]["enrollment_state"];
type CanonicalEnrollmentStateMap = {
  readonly [State in DatabaseEnrollmentState]: State;
};

const enrollmentApiStates = {
  requested: "requested",
  approved: "approved",
  rejected: "rejected",
  assigned: "assigned",
  cancelled: "cancelled",
  completed: "completed",
} as const satisfies CanonicalEnrollmentStateMap;

export const enrollmentApiStateSchema = z.enum(enrollmentApiStates);

export const requestEnrollmentInputSchema = z.object({
  courseId: uuidSchema,
  requestNote: z.string().trim().max(2000).nullable().optional(),
  idempotencyKey: idempotencyKeySchema,
});

export const enrollmentSchema = z.object({
  id: uuidSchema,
  courseId: uuidSchema,
  cohortId: uuidSchema.nullable(),
  state: enrollmentApiStateSchema,
  version: expectedVersionSchema,
  createdAt: utcDateTimeSchema,
  updatedAt: utcDateTimeSchema,
});

export const attemptApiStateSchema = z.enum([
  "draft",
  "submitted",
  "revision_required",
  "resubmitted",
  "accepted",
  "abandoned",
]);

export const saveAttemptDraftInputSchema = z.object({
  attemptId: uuidSchema,
  expectedVersion: z.number().int().nonnegative(),
  answerText: z.string().max(100_000),
  selectedOptionIds: z.array(uuidSchema).max(200),
  evidenceDraft: z.array(z.record(z.string(), z.unknown())).max(100),
});

export const submitAttemptInputSchema = z.object({
  attemptId: uuidSchema,
  expectedVersion: expectedVersionSchema,
  idempotencyKey: idempotencyKeySchema,
  answerText: z.string().max(100_000),
  selectedOptionIds: z.array(uuidSchema).max(200),
  evidenceRefs: z.array(uuidSchema).max(100),
  correlationId: correlationIdSchema,
});

export const createQuestionInputSchema = z.object({
  cohortId: uuidSchema,
  taskId: uuidSchema,
  subject: z.string().trim().min(1).max(500),
  body: z.string().trim().min(1).max(20_000),
  idempotencyKey: idempotencyKeySchema,
  correlationId: correlationIdSchema,
});

export const archiveQuestionInputSchema = z.object({
  questionId: uuidSchema,
  expectedVersion: expectedVersionSchema,
  correlationId: correlationIdSchema,
});

export type RequestEnrollmentInput = z.infer<typeof requestEnrollmentInputSchema>;
export type Enrollment = z.infer<typeof enrollmentSchema>;
export type SaveAttemptDraftInput = z.infer<typeof saveAttemptDraftInputSchema>;
export type SubmitAttemptInput = z.infer<typeof submitAttemptInputSchema>;
export type CreateQuestionInput = z.infer<typeof createQuestionInputSchema>;
export type ArchiveQuestionInput = z.infer<typeof archiveQuestionInputSchema>;
