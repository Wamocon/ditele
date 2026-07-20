import { describe, expect, it, vi } from "vitest";

import type { Principal } from "@/shared/auth/types";

import {
  AnalyticsError,
  authorizeAnalyticsScope,
  captureAnalyticsEvent,
  conversionRate,
  deleteAnalyticsSubjectData,
} from "./service";

const event = { id: "event-1", schemaVersion: 1 as const, name: "task.submitted" as const, category: "learning" as const, subjectId: "learner-1", organizationId: "org-1", occurredAt: "2026-07-17T12:00:00.000Z", properties: { task_id: "task-1", duration_seconds: 120 } };
const consent = { subjectId: "learner-1", product: false, learning: true, recordedAt: "2026-07-17T10:00:00.000Z" };
const pseudonymizer = { pseudonymize: vi.fn().mockResolvedValue(`sub_${"a".repeat(24)}`) };

describe("analytics", () => {
  it("captures a minimized event with matching consent", async () => {
    const sink = { append: vi.fn().mockResolvedValue(undefined) };
    await expect(captureAnalyticsEvent(sink, event, consent, pseudonymizer)).resolves.toEqual({
      ...event,
      subjectId: `sub_${"a".repeat(24)}`,
    });
    expect(sink.append).toHaveBeenCalledOnce();
    expect(sink.append).toHaveBeenCalledWith(expect.objectContaining({
      subjectId: `sub_${"a".repeat(24)}`,
      schemaVersion: 1,
    }));
    expect(pseudonymizer.pseudonymize).toHaveBeenCalledWith("learner-1");
  });

  it("rejects consentless learning analytics and sensitive keys or values before persistence", async () => {
    const sink = { append: vi.fn() };
    await expect(captureAnalyticsEvent(sink, event, null, pseudonymizer)).rejects.toEqual(new AnalyticsError("analytics.consent_required"));
    await expect(captureAnalyticsEvent(sink, { ...event, properties: { submission_answer: "secret" } }, consent, pseudonymizer)).rejects.toEqual(new AnalyticsError("analytics.sensitive_property"));
    await expect(captureAnalyticsEvent(sink, { ...event, properties: { label: "learner@example.com" } }, consent, pseudonymizer)).rejects.toEqual(new AnalyticsError("analytics.sensitive_property"));
    expect(sink.append).not.toHaveBeenCalled();
  });

  it("rejects free-form, nested, oversized, wrong-version, and withdrawn-consent events", async () => {
    const sink = { append: vi.fn() };
    await expect(captureAnalyticsEvent(sink, { ...event, properties: { ...event.properties, label: "clicked" } }, consent, pseudonymizer)).rejects.toThrow();
    await expect(captureAnalyticsEvent(sink, { ...event, properties: { task_id: { nested: "task-1" }, duration_seconds: 120 } }, consent, pseudonymizer)).rejects.toThrow();
    await expect(captureAnalyticsEvent(sink, { ...event, properties: { task_id: "x".repeat(129), duration_seconds: 120 } }, consent, pseudonymizer)).rejects.toThrow();
    await expect(captureAnalyticsEvent(sink, { ...event, schemaVersion: 2 }, consent, pseudonymizer)).rejects.toThrow();
    await expect(captureAnalyticsEvent(sink, event, { ...consent, withdrawnAt: "2026-07-17T11:00:00.000Z" }, pseudonymizer)).rejects.toEqual(new AnalyticsError("analytics.consent_required"));
    expect(sink.append).not.toHaveBeenCalled();
  });

  it("enforces organization scope for dashboards", () => {
    const principal: Principal = { userId: "admin-1", sessionId: "s1", organizationId: "org-1", primaryRole: "organization_admin", roles: ["organization_admin"], permissions: ["analytics.read"], cohortIds: [] };
    expect(() => authorizeAnalyticsScope(principal, "org-1")).not.toThrow();
    expect(() => authorizeAnalyticsScope(principal, "org-2")).toThrowError(new AnalyticsError("analytics.forbidden"));
    expect(() => authorizeAnalyticsScope(principal, null)).toThrowError(new AnalyticsError("analytics.forbidden"));
  });

  it("propagates deletion using only the pseudonymous subject reference", async () => {
    const sink = { deleteForSubject: vi.fn().mockResolvedValue(undefined) };
    await deleteAnalyticsSubjectData(sink, pseudonymizer, "learner-1");
    expect(sink.deleteForSubject).toHaveBeenCalledWith(`sub_${"a".repeat(24)}`);
  });

  it("calculates defined rates without NaN or invalid counts", () => {
    expect(conversionRate(4, 3)).toBe(0.75);
    expect(conversionRate(0, 0)).toBe(0);
    expect(() => conversionRate(2, 3)).toThrow(RangeError);
  });
});
