import { z } from "zod";

const UuidSchema = z.string().uuid();
const IdempotencyKeySchema = z.string().trim().min(16).max(200);

export const CreateQuestionCommandSchema = z.object({
  cohortId: UuidSchema,
  taskId: UuidSchema,
  subject: z.string().trim().min(1).max(10_000),
  body: z.string().trim().min(1).max(10_000),
  idempotencyKey: IdempotencyKeySchema,
});

export const ArchiveQuestionCommandSchema = z.object({
  questionId: UuidSchema,
  expectedVersion: z.coerce.number().int().positive(),
});

export const AnswerQuestionCommandSchema = z.object({
  questionId: UuidSchema,
  expectedVersion: z.coerce.number().int().positive(),
  body: z.string().trim().min(1).max(10_000),
  idempotencyKey: IdempotencyKeySchema,
});

export const ClaimQuestionCommandSchema = z.object({
  questionId: UuidSchema,
  expectedVersion: z.coerce.number().int().positive(),
  idempotencyKey: IdempotencyKeySchema,
});

export const TransferQuestionCommandSchema = z.object({
  questionId: UuidSchema,
  expectedVersion: z.coerce.number().int().positive(),
  toTrainerId: UuidSchema,
  reason: z.string().trim().min(1).max(1_000),
  idempotencyKey: IdempotencyKeySchema,
});

export type QuestionActionState = {
  readonly status: "idle" | "error" | "conflict";
  readonly message: string;
  readonly fieldErrors?: Readonly<Record<string, string>>;
};

export const questionActionInitialState: QuestionActionState = {
  status: "idle",
  message: "",
};

function formValue(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

export function parseCreateQuestionForm(formData: FormData) {
  const [cohortId = "", taskId = ""] = formValue(formData, "context").split(":");
  return CreateQuestionCommandSchema.parse({
    cohortId,
    taskId,
    subject: formValue(formData, "subject"),
    body: formValue(formData, "body"),
    idempotencyKey: formValue(formData, "idempotencyKey"),
  });
}

export function parseArchiveQuestionForm(formData: FormData) {
  return ArchiveQuestionCommandSchema.parse({
    questionId: formValue(formData, "questionId"),
    expectedVersion: formValue(formData, "expectedVersion"),
  });
}

export function parseAnswerQuestionForm(formData: FormData) {
  return AnswerQuestionCommandSchema.parse({
    questionId: formValue(formData, "questionId"),
    expectedVersion: formValue(formData, "expectedVersion"),
    body: formValue(formData, "body"),
    idempotencyKey: formValue(formData, "idempotencyKey"),
  });
}

export function parseClaimQuestionForm(formData: FormData) {
  return ClaimQuestionCommandSchema.parse({
    questionId: formValue(formData, "questionId"),
    expectedVersion: formValue(formData, "expectedVersion"),
    idempotencyKey: formValue(formData, "idempotencyKey"),
  });
}

export function parseTransferQuestionForm(formData: FormData) {
  return TransferQuestionCommandSchema.parse({
    questionId: formValue(formData, "questionId"),
    expectedVersion: formValue(formData, "expectedVersion"),
    toTrainerId: formValue(formData, "toTrainerId"),
    reason: formValue(formData, "reason"),
    idempotencyKey: formValue(formData, "idempotencyKey"),
  });
}
