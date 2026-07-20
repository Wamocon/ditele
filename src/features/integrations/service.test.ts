import { describe, expect, it, vi } from "vitest";

import type { Principal } from "@/shared/auth/types";

import { IntegrationConnectionSchema, IntegrationKindSchema } from "./model";
import { IntegrationError, deliverOutboxRecord, enqueueIntegrationEvent, nextRetryAt, reconcileAcknowledgements, replayDeadLetter } from "./service";

const now = new Date("2026-07-17T12:00:00.000Z");
const event = { id: "event-1", type: "review.completed", schemaVersion: 1, correlationId: "correlation-1", organizationId: "org-1", occurredAt: now.toISOString(), payload: { learner_id: "learner-1", private_answer: "not shared" } };
const connection = { id: "connection-1", organizationId: "org-1", kind: "webhook" as const, state: "active" as const, allowedEventTypes: ["review.completed"], allowedPayloadFields: ["learner_id"], maxAttempts: 3 };
const record = { id: "outbox-1", event, connectionId: "connection-1", state: "pending" as const, attempts: 0, nextAttemptAt: null, lastErrorCode: null, acknowledgementId: null, version: 1 };

describe("integrations", () => {
  it.each(["eloomi", "lti", "xapi", "cmi5", "webhook", "oidc"] as const)(
    "keeps the canonical %s provider kind aligned with persistence",
    (kind) => {
      expect(IntegrationKindSchema.parse(kind)).toBe(kind);
      expect(IntegrationConnectionSchema.parse({ ...connection, kind })).toMatchObject({
        kind,
        organizationId: "org-1",
      });
    },
  );

  it("rejects tenantless connections and tenantless events at the external-delivery boundary", async () => {
    const repository = {
      findByEventAndConnection: vi.fn(),
      enqueue: vi.fn(),
      save: vi.fn(),
    };

    expect(() =>
      IntegrationConnectionSchema.parse({ ...connection, organizationId: null }),
    ).toThrow();
    await expect(
      enqueueIntegrationEvent(repository, connection, {
        ...event,
        organizationId: null,
      }),
    ).rejects.toEqual(new IntegrationError("integrations.forbidden"));
    expect(repository.enqueue).not.toHaveBeenCalled();
  });

  it("enqueues idempotently per connection and event", async () => {
    const repository = { findByEventAndConnection: vi.fn().mockResolvedValue(record), enqueue: vi.fn(), save: vi.fn() };
    await expect(enqueueIntegrationEvent(repository, connection, event)).resolves.toEqual(record);
    expect(repository.enqueue).not.toHaveBeenCalled();
  });

  it("delivers a versioned minimized payload and records acknowledgement", async () => {
    const repository = { findByEventAndConnection: vi.fn(), enqueue: vi.fn(), save: vi.fn().mockImplementation((value) => value) };
    const adapter = { deliver: vi.fn().mockResolvedValue({ delivered: true, acknowledgementId: "ack-1" }) };
    await expect(deliverOutboxRecord({ repository, adapter }, connection, record, now)).resolves.toMatchObject({ state: "delivered", acknowledgementId: "ack-1" });
    expect(adapter.deliver).toHaveBeenCalledWith(expect.objectContaining({ schemaVersion: 1, payload: { learner_id: "learner-1" } }));
    expect(repository.save).toHaveBeenNthCalledWith(1, expect.objectContaining({ state: "processing" }));
  });

  it("schedules bounded retry then dead-letters exhausted delivery", async () => {
    const repository = { findByEventAndConnection: vi.fn(), enqueue: vi.fn(), save: vi.fn().mockImplementation((value) => value) };
    const adapter = { deliver: vi.fn().mockResolvedValue({ delivered: false, errorCode: "timeout", retryable: true }) };
    await expect(deliverOutboxRecord({ repository, adapter }, connection, { ...record, attempts: 2 }, now)).resolves.toMatchObject({ state: "dead_letter", attempts: 3 });
    expect(nextRetryAt(now, 1)).toBe("2026-07-17T12:00:15.000Z");
  });

  it("does not deliver inactive connections or terminal cancelled records", async () => {
    const repository = { findByEventAndConnection: vi.fn(), enqueue: vi.fn(), save: vi.fn() };
    const adapter = { deliver: vi.fn() };
    await expect(deliverOutboxRecord(
      { repository, adapter },
      { ...connection, state: "inactive" },
      record,
      now,
    )).rejects.toEqual(new IntegrationError("integrations.connection_unavailable"));
    expect(repository.save).not.toHaveBeenCalled();
    expect(adapter.deliver).not.toHaveBeenCalled();

    await expect(deliverOutboxRecord(
      { repository, adapter },
      connection,
      { ...record, state: "cancelled" },
      now,
    )).resolves.toMatchObject({ state: "cancelled" });
    expect(repository.save).not.toHaveBeenCalled();
    expect(adapter.deliver).not.toHaveBeenCalled();
  });

  it("requires scoped permission and dead-letter state for replay", async () => {
    const repository = { findByEventAndConnection: vi.fn(), enqueue: vi.fn(), save: vi.fn().mockImplementation((value) => value) };
    const admin: Principal = { userId: "admin-1", sessionId: "s1", organizationId: "org-1", primaryRole: "integration_admin", roles: ["integration_admin"], permissions: ["integration.replay"], cohortIds: [] };
    await expect(replayDeadLetter(repository, admin, connection, { ...record, state: "dead_letter" })).resolves.toMatchObject({ state: "retry_scheduled", attempts: 0 });
    await expect(replayDeadLetter(repository, { ...admin, organizationId: "org-2" }, connection, { ...record, state: "dead_letter" })).rejects.toEqual(new IntegrationError("integrations.forbidden"));
    await expect(
      replayDeadLetter(
        repository,
        admin,
        { ...connection, organizationId: null },
        { ...record, state: "dead_letter" },
      ),
    ).rejects.toThrow();
  });

  it("reconciles missing and unexpected acknowledgements", () => {
    expect(reconcileAcknowledgements("connection-1", ["ack-1", "ack-2"], ["ack-2", "ack-3"], now.toISOString())).toMatchObject({ missingAcknowledgements: ["ack-1"], unexpectedAcknowledgements: ["ack-3"] });
  });
});
