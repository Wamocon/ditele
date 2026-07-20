import type { Principal } from "@/shared/auth/types";

import {
  AdapterResultSchema,
  CanonicalDomainEventSchema,
  IntegrationConnectionSchema,
  OutboxRecordSchema,
  ReconciliationResultSchema,
  type AdapterResult,
  type CanonicalDomainEvent,
  type IntegrationConnection,
  type OutboxRecord,
  type ReconciliationResult,
} from "./model";

export class IntegrationError extends Error {
  constructor(readonly code: "integrations.forbidden" | "integrations.connection_unavailable" | "integrations.event_not_allowed" | "integrations.invalid_replay" | "integrations.stale_record") {
    super(code);
    this.name = "IntegrationError";
  }
}

export interface OutboxRepository {
  findByEventAndConnection(eventId: string, connectionId: string): Promise<unknown | null>;
  enqueue(input: { event: CanonicalDomainEvent; connectionId: string }): Promise<unknown>;
  save(record: OutboxRecord): Promise<unknown>;
}

export interface IntegrationAdapter {
  deliver(input: { eventId: string; eventType: string; schemaVersion: number; correlationId: string; occurredAt: string; payload: Readonly<Record<string, string | number | boolean | null>> }): Promise<unknown>;
}

export async function enqueueIntegrationEvent(
  repository: OutboxRepository,
  connectionInput: unknown,
  eventInput: unknown,
): Promise<OutboxRecord> {
  const connection = IntegrationConnectionSchema.parse(connectionInput);
  const event = CanonicalDomainEventSchema.parse(eventInput);
  if (connection.organizationId !== event.organizationId) throw new IntegrationError("integrations.forbidden");
  if (!connection.allowedEventTypes.includes(event.type)) throw new IntegrationError("integrations.event_not_allowed");
  const existing = await repository.findByEventAndConnection(event.id, connection.id);
  if (existing) return OutboxRecordSchema.parse(existing);
  return OutboxRecordSchema.parse(await repository.enqueue({ event, connectionId: connection.id }));
}

export function nextRetryAt(now: Date, attempts: number): string {
  const seconds = Math.min(3600, 15 * 2 ** Math.max(0, attempts - 1));
  return new Date(now.getTime() + seconds * 1000).toISOString();
}

function mappedPayload(connection: IntegrationConnection, event: CanonicalDomainEvent) {
  return Object.fromEntries(Object.entries(event.payload).filter(([key]) => connection.allowedPayloadFields.includes(key)));
}

export async function deliverOutboxRecord(
  dependencies: { repository: OutboxRepository; adapter: IntegrationAdapter },
  connectionInput: unknown,
  recordInput: unknown,
  now: Date,
): Promise<OutboxRecord> {
  const connection = IntegrationConnectionSchema.parse(connectionInput);
  let record = OutboxRecordSchema.parse(recordInput);
  if (record.connectionId !== connection.id || record.event.organizationId !== connection.organizationId) throw new IntegrationError("integrations.forbidden");
  if (connection.state !== "active") throw new IntegrationError("integrations.connection_unavailable");
  if (!["pending", "retry_scheduled"].includes(record.state)) return record;
  record = OutboxRecordSchema.parse(await dependencies.repository.save({ ...record, state: "processing", attempts: record.attempts + 1, version: record.version + 1 }));
  let result: AdapterResult;
  try {
    result = AdapterResultSchema.parse(await dependencies.adapter.deliver({
      eventId: record.event.id,
      eventType: record.event.type,
      schemaVersion: record.event.schemaVersion,
      correlationId: record.event.correlationId,
      occurredAt: record.event.occurredAt,
      payload: mappedPayload(connection, record.event),
    }));
  } catch {
    result = { delivered: false, errorCode: "provider_exception", retryable: true };
  }
  if (result.delivered) {
    return OutboxRecordSchema.parse(await dependencies.repository.save({ ...record, state: "delivered", acknowledgementId: result.acknowledgementId, nextAttemptAt: null, lastErrorCode: null, version: record.version + 1 }));
  }
  const exhausted = !result.retryable || record.attempts >= connection.maxAttempts;
  return OutboxRecordSchema.parse(await dependencies.repository.save({
    ...record,
    state: exhausted ? "dead_letter" : "retry_scheduled",
    nextAttemptAt: exhausted ? null : nextRetryAt(now, record.attempts),
    lastErrorCode: result.errorCode,
    version: record.version + 1,
  }));
}

export async function replayDeadLetter(repository: OutboxRepository, principal: Principal, connectionInput: unknown, recordInput: unknown): Promise<OutboxRecord> {
  const connection = IntegrationConnectionSchema.parse(connectionInput);
  const record = OutboxRecordSchema.parse(recordInput);
  const tenantMatches = connection.organizationId === principal.organizationId;
  if (!tenantMatches || !principal.permissions.includes("integration.replay")) throw new IntegrationError("integrations.forbidden");
  if (record.connectionId !== connection.id || record.state !== "dead_letter") throw new IntegrationError("integrations.invalid_replay");
  return OutboxRecordSchema.parse(await repository.save({ ...record, state: "retry_scheduled", attempts: 0, nextAttemptAt: null, lastErrorCode: null, version: record.version + 1 }));
}

export function reconcileAcknowledgements(connectionId: string, localAcknowledgementIds: readonly string[], externalAcknowledgementIds: readonly string[], checkedAt: string): ReconciliationResult {
  const local = new Set(localAcknowledgementIds);
  const external = new Set(externalAcknowledgementIds);
  return ReconciliationResultSchema.parse({
    connectionId,
    missingAcknowledgements: [...local].filter((id) => !external.has(id)).sort(),
    unexpectedAcknowledgements: [...external].filter((id) => !local.has(id)).sort(),
    checkedAt,
  });
}
