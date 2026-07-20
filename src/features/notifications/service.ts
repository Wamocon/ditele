import type { Principal } from "@/shared/auth/types";

import {
  DeliveryInstructionSchema,
  NotificationEventSchema,
  NotificationPreferenceSchema,
  NotificationSchema,
  type DeliveryInstruction,
  type NotificationChannel,
  type NotificationPreference,
} from "./model";

export class NotificationError extends Error {
  constructor(readonly code: "notifications.forbidden") {
    super(code);
    this.name = "NotificationError";
  }
}

export interface NotificationRepository {
  findBySourceEventId(eventId: string): Promise<unknown | null>;
  create(input: { event: ReturnType<typeof NotificationEventSchema.parse> }): Promise<unknown>;
  markRead(input: { notificationId: string; recipientId: string; readAt: string }): Promise<unknown>;
}

const defaultChannels: readonly NotificationChannel[] = ["in_app", "email"];

export async function planNotificationDelivery(
  repository: NotificationRepository,
  eventInput: unknown,
  preferencesInput: readonly NotificationPreference[],
): Promise<DeliveryInstruction> {
  const event = NotificationEventSchema.parse(eventInput);
  const preferences = preferencesInput.map((preference) => NotificationPreferenceSchema.parse(preference));
  const existing = await repository.findBySourceEventId(event.id);
  const notification = existing
    ? NotificationSchema.parse(existing)
    : NotificationSchema.parse(await repository.create({ event }));
  const channels = defaultChannels.filter((channel) => {
    const preference = preferences.find(
      (item) => item.recipientId === event.recipientId && item.type === event.type && item.channel === channel,
    );
    return preference?.enabled ?? channel === "in_app";
  });
  return DeliveryInstructionSchema.parse({ notification, channels: channels.length > 0 ? channels : ["in_app"] });
}

export async function markNotificationRead(
  repository: NotificationRepository,
  principal: Principal,
  notificationInput: unknown,
  readAt: string,
) {
  const notification = NotificationSchema.parse(notificationInput);
  if (notification.recipientId !== principal.userId) throw new NotificationError("notifications.forbidden");
  return NotificationSchema.parse(await repository.markRead({ notificationId: notification.id, recipientId: principal.userId, readAt }));
}
