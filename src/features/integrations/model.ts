import { z } from "zod";

import { DELIVERY_STATES } from "@/entities/integration/state-machine";
import { RECORD_STATES } from "@/entities/common/persistence-states";

const CanonicalValueSchema = z.union([z.string().max(1000), z.number().finite(), z.boolean(), z.null()]);

export const IntegrationKindSchema = z.enum([
  "eloomi",
  "lti",
  "xapi",
  "cmi5",
  "webhook",
  "oidc",
]);
export type IntegrationKind = z.infer<typeof IntegrationKindSchema>;

export const CanonicalDomainEventSchema = z.object({
  id: z.string().min(1),
  type: z.string().regex(/^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)+$/),
  schemaVersion: z.number().int().positive(),
  correlationId: z.string().min(1),
  organizationId: z.string().min(1).nullable(),
  occurredAt: z.string().datetime(),
  payload: z.record(z.string().max(80), CanonicalValueSchema),
});
export type CanonicalDomainEvent = z.infer<typeof CanonicalDomainEventSchema>;

export const IntegrationConnectionStateSchema = z.enum(RECORD_STATES);
export const IntegrationDeliveryStateSchema = z.enum(DELIVERY_STATES);

export const IntegrationConnectionSchema = z.object({
  id: z.string().min(1),
  organizationId: z.string().min(1),
  kind: IntegrationKindSchema,
  state: IntegrationConnectionStateSchema,
  allowedEventTypes: z.array(z.string().min(1)),
  allowedPayloadFields: z.array(z.string().min(1)),
  maxAttempts: z.number().int().min(1).max(20),
}).strict();
export type IntegrationConnection = z.infer<typeof IntegrationConnectionSchema>;

export const OutboxRecordSchema = z.object({
  id: z.string().min(1),
  event: CanonicalDomainEventSchema,
  connectionId: z.string().min(1),
  state: IntegrationDeliveryStateSchema,
  attempts: z.number().int().nonnegative(),
  nextAttemptAt: z.string().datetime().nullable(),
  lastErrorCode: z.string().min(1).nullable(),
  acknowledgementId: z.string().min(1).nullable(),
  version: z.number().int().positive(),
}).strict();
export type OutboxRecord = z.infer<typeof OutboxRecordSchema>;

export const AdapterResultSchema = z.discriminatedUnion("delivered", [
  z.object({ delivered: z.literal(true), acknowledgementId: z.string().min(1) }),
  z.object({ delivered: z.literal(false), errorCode: z.string().min(1), retryable: z.boolean() }),
]);
export type AdapterResult = z.infer<typeof AdapterResultSchema>;

export const ReconciliationResultSchema = z.object({
  connectionId: z.string().min(1),
  missingAcknowledgements: z.array(z.string().min(1)),
  unexpectedAcknowledgements: z.array(z.string().min(1)),
  checkedAt: z.string().datetime(),
});
export type ReconciliationResult = z.infer<typeof ReconciliationResultSchema>;

export const IntegrationHealthSchema = z.object({
  connectionId: z.string().min(1),
  status: z.enum(["healthy", "degraded", "unavailable", "not_configured"]),
  pendingCount: z.number().int().nonnegative(),
  deadLetterCount: z.number().int().nonnegative(),
  oldestPendingAt: z.string().datetime().nullable(),
  checkedAt: z.string().datetime(),
});
export type IntegrationHealth = z.infer<typeof IntegrationHealthSchema>;
