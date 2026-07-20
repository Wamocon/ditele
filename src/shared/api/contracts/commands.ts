import { z } from "zod";

import {
  correlationIdSchema,
  expectedVersionSchema,
  idempotencyKeySchema,
  uuidSchema,
} from "./common";

export const auditEventInputSchema = z.object({
  eventType: z.string().min(1),
  aggregateType: z.string().min(1),
  aggregateId: uuidSchema.optional(),
  correlationId: correlationIdSchema,
  causationId: uuidSchema.optional(),
  metadata: z.record(z.string(), z.unknown()).default({}),
});

export const notificationInputSchema = z.object({
  recipientId: uuidSchema,
  eventType: z.string().min(1),
  templateKey: z.string().min(1),
  deduplicationKey: z.string().min(1).max(240),
  payload: z.record(z.string(), z.unknown()).default({}),
});

export const commandContextSchema = z.object({
  expectedVersion: expectedVersionSchema.optional(),
  idempotencyKey: idempotencyKeySchema.optional(),
  audit: auditEventInputSchema,
  notification: notificationInputSchema.optional(),
});

export type AuditEventInput = z.infer<typeof auditEventInputSchema>;
export type NotificationInput = z.infer<typeof notificationInputSchema>;
export type CommandContext = z.infer<typeof commandContextSchema>;

