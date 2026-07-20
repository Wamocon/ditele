import { describe, expect, it, vi } from "vitest";

import type { Principal } from "@/shared/auth/types";

import { NotificationError, markNotificationRead, planNotificationDelivery } from "./service";

const event = { id: "event-1", recipientId: "learner-1", organizationId: "org-1", type: "review_decided" as const, titleKey: "notification.review.title", bodyKey: "notification.review.body", targetPath: "/en/learning/submission-1", occurredAt: "2026-07-17T12:00:00.000Z" };
const notification = { ...event, id: "notification-1", sourceEventId: event.id, createdAt: event.occurredAt, readAt: null };
const principal: Principal = { userId: "learner-1", sessionId: "s1", organizationId: "org-1", primaryRole: "learner", roles: ["learner"], permissions: [], cohortIds: [] };

describe("notifications", () => {
  it("deduplicates by domain event and respects channel opt-out", async () => {
    const repository = { findBySourceEventId: vi.fn().mockResolvedValue(notification), create: vi.fn(), markRead: vi.fn() };
    await expect(planNotificationDelivery(repository, event, [{ recipientId: "learner-1", type: "review_decided", channel: "email", enabled: false }])).resolves.toMatchObject({ channels: ["in_app"] });
    expect(repository.create).not.toHaveBeenCalled();
  });

  it("never disables the in-app record even when all delivery preferences are off", async () => {
    const repository = { findBySourceEventId: vi.fn().mockResolvedValue(notification), create: vi.fn(), markRead: vi.fn() };
    await expect(planNotificationDelivery(repository, event, [{ recipientId: "learner-1", type: "review_decided", channel: "in_app", enabled: false }])).resolves.toMatchObject({ channels: ["in_app"] });
  });

  it("allows only the recipient to mark a notification read", async () => {
    const repository = { findBySourceEventId: vi.fn(), create: vi.fn(), markRead: vi.fn().mockResolvedValue({ ...notification, readAt: event.occurredAt }) };
    await expect(markNotificationRead(repository, { ...principal, userId: "learner-2" }, notification, event.occurredAt)).rejects.toEqual(new NotificationError("notifications.forbidden"));
    await expect(markNotificationRead(repository, principal, notification, event.occurredAt)).resolves.toMatchObject({ readAt: event.occurredAt });
  });
});
