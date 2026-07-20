import { z } from "zod";

import { locales } from "@/shared/i18n/config";

const commonCommandSchema = z.object({
  locale: z.enum(locales),
  courseId: z.string().uuid(),
  contentVersionId: z.string().uuid(),
  expectedVersion: z.coerce.number().int().positive(),
  idempotencyKey: z.string().trim().min(16).max(200),
});

export const contentReviewDecisionSchema = z.enum([
  "approved",
  "changes_requested",
]);

export const contentLifecycleCommandSchema = commonCommandSchema;

export const contentReviewCommandSchema = commonCommandSchema.extend({
  decision: contentReviewDecisionSchema,
  comment: z.string().trim().min(1).max(4_000),
});

export const contentArchiveCommandSchema = commonCommandSchema.extend({
  impactFingerprint: z.string().regex(/^[0-9a-f]{64}$/),
  reason: z.string().trim().min(1).max(2_000),
  confirmImpact: z.literal("confirmed"),
});

function values(formData: FormData): Record<string, FormDataEntryValue> {
  return Object.fromEntries(formData.entries());
}

export function parseContentLifecycleCommand(formData: FormData) {
  return contentLifecycleCommandSchema.parse(values(formData));
}

export function parseContentReviewCommand(formData: FormData) {
  return contentReviewCommandSchema.parse(values(formData));
}

export function parseContentArchiveCommand(formData: FormData) {
  return contentArchiveCommandSchema.parse(values(formData));
}

export type ContentLifecycleActionState = {
  readonly status: "idle" | "error";
  readonly message: string;
  readonly fieldErrors?: Readonly<{
    comment?: string;
    decision?: string;
    reason?: string;
    confirmImpact?: string;
  }>;
};

export const contentLifecycleInitialState: ContentLifecycleActionState = {
  status: "idle",
  message: "",
};

export type ContentLifecycleOperation = "submit" | "review" | "publish" | "archive";
export type ContentLifecycleRpcFailure =
  | "stale"
  | "forbidden"
  | "readiness"
  | "approval"
  | "idempotency"
  | "input"
  | "failed";

export function classifyContentLifecycleRpcError(
  error: { readonly code: string; readonly message: string },
  operation: ContentLifecycleOperation,
): ContentLifecycleRpcFailure {
  if (error.code === "40001") return "stale";
  if (error.code === "42501") return "forbidden";
  if (error.code === "23514") return operation === "publish" ? "approval" : "readiness";
  if (error.code === "22023") {
    return error.message.toLocaleLowerCase("en").includes("idempotency")
      ? "idempotency"
      : "input";
  }
  return "failed";
}
