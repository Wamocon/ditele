import type { PostgrestError } from "@supabase/supabase-js";
import { z } from "zod";

const uuidSchema = z.string().uuid();
const localeSchema = z.enum(["en", "de", "ru"]);
const perspectiveSchema = z.enum(["admin", "trainer"]);
const idempotencyKeySchema = z.string().trim().min(16).max(200);
const reasonSchema = z.string().trim().min(3).max(1_000);
const utcDateTimeInputSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/)
  .refine(
    (value) => !Number.isNaN(Date.parse(`${value}:00.000Z`)),
    "Invalid UTC date and time",
  )
  .transform((value) => `${value}:00.000Z`);

const optionalUtcDateTimeInputSchema = z.union([
  z.literal("").transform(() => null),
  utcDateTimeInputSchema,
]);

export const cohortTransitionCommandSchema = z.object({
  cohortId: uuidSchema,
  expectedVersion: z.coerce.number().int().positive(),
  targetState: z.enum(["active", "completed", "cancelled"]),
  reason: reasonSchema,
  idempotencyKey: idempotencyKeySchema,
  locale: localeSchema,
  perspective: perspectiveSchema,
});

export const taskScheduleCommandSchema = z
  .object({
    cohortId: uuidSchema,
    taskId: uuidSchema,
    expectedVersion: z.coerce.number().int().nonnegative(),
    availableFrom: optionalUtcDateTimeInputSchema,
    dueAt: optionalUtcDateTimeInputSchema,
    reason: reasonSchema,
    idempotencyKey: idempotencyKeySchema,
    locale: localeSchema,
    perspective: perspectiveSchema,
  })
  .superRefine((value, context) => {
    if (
      value.availableFrom !== null &&
      value.dueAt !== null &&
      Date.parse(value.dueAt) <= Date.parse(value.availableFrom)
    ) {
      context.addIssue({
        code: "custom",
        path: ["dueAt"],
        message: "Due date must be after availability",
      });
    }
  });

export type CohortCommandActionState = {
  readonly status: "idle" | "error";
  readonly message: string;
  readonly fieldErrors?: Readonly<Record<string, string>>;
};

export const cohortCommandInitialState: CohortCommandActionState = {
  status: "idle",
  message: "",
};

function formValue(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

export function parseCohortTransitionForm(formData: FormData) {
  return cohortTransitionCommandSchema.parse({
    cohortId: formValue(formData, "cohortId"),
    expectedVersion: formValue(formData, "expectedVersion"),
    targetState: formValue(formData, "targetState"),
    reason: formValue(formData, "reason"),
    idempotencyKey: formValue(formData, "idempotencyKey"),
    locale: formValue(formData, "locale"),
    perspective: formValue(formData, "perspective"),
  });
}

export function parseTaskScheduleForm(formData: FormData) {
  return taskScheduleCommandSchema.parse({
    cohortId: formValue(formData, "cohortId"),
    taskId: formValue(formData, "taskId"),
    expectedVersion: formValue(formData, "expectedVersion"),
    availableFrom: formValue(formData, "availableFrom"),
    dueAt: formValue(formData, "dueAt"),
    reason: formValue(formData, "reason"),
    idempotencyKey: formValue(formData, "idempotencyKey"),
    locale: formValue(formData, "locale"),
    perspective: formValue(formData, "perspective"),
  });
}

export type CohortCommandFailure =
  | "stale"
  | "forbidden"
  | "illegal_transition"
  | "invalid_schedule"
  | "idempotency"
  | "input"
  | "failed";

export function classifyCohortCommandRpcError(
  error: Pick<PostgrestError, "code" | "message">,
  operation: "transition" | "schedule",
): CohortCommandFailure {
  if (error.code === "40001") return "stale";
  if (error.code === "42501") return "forbidden";
  if (
    error.code === "22023" &&
    error.message.toLowerCase().includes("idempotency key")
  ) {
    return "idempotency";
  }
  if (error.code === "22023") return "input";
  if (error.code === "23514") {
    return operation === "transition" ? "illegal_transition" : "invalid_schedule";
  }
  return "failed";
}

export function localDateTimeValue(value: string | null): string {
  return value ? new Date(value).toISOString().slice(0, 16) : "";
}
