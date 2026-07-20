import { z } from "zod";

export const uuidSchema = z.string().uuid();
export const utcDateTimeSchema = z.string().datetime({ offset: true });
export const correlationIdSchema = uuidSchema;
export const idempotencyKeySchema = z.string().min(16).max(200);
export const expectedVersionSchema = z.number().int().positive();

export const fieldErrorsSchema = z.record(z.string(), z.array(z.string()));

export const apiErrorSchema = z.object({
  code: z.string().min(1),
  message_key: z.string().min(1),
  field_errors: fieldErrorsSchema,
  correlation_id: correlationIdSchema,
  retryable: z.boolean(),
});

export const errorEnvelopeSchema = z.object({ error: apiErrorSchema });

export function successEnvelopeSchema<TSchema extends z.ZodType>(schema: TSchema) {
  return z.object({
    data: schema,
    meta: z.object({ correlation_id: correlationIdSchema }),
  });
}

export const cursorPageMetaSchema = z.object({
  correlation_id: correlationIdSchema,
  next_cursor: z.string().min(1).nullable(),
});

export function cursorPageSchema<TSchema extends z.ZodType>(schema: TSchema) {
  return z.object({
    data: z.array(schema),
    meta: cursorPageMetaSchema,
  });
}

export type ApiError = z.infer<typeof apiErrorSchema>;
export type ErrorEnvelope = z.infer<typeof errorEnvelopeSchema>;

