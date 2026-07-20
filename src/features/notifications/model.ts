import { z } from "zod";

export const NotificationTypeSchema = z.enum([
  "enrollment_decided",
  "review_decided",
  "question_answered",
  "certificate_issued",
  "integration_failed",
]);
export type NotificationType = z.infer<typeof NotificationTypeSchema>;

export const NotificationChannelSchema = z.enum(["in_app", "email", "push"]);
export type NotificationChannel = z.infer<typeof NotificationChannelSchema>;

export const NotificationSchema = z.object({
  id: z.string().min(1),
  recipientId: z.string().min(1),
  organizationId: z.string().min(1).nullable(),
  type: NotificationTypeSchema,
  titleKey: z.string().min(1),
  bodyKey: z.string().min(1),
  targetPath: z.string().startsWith("/"),
  readAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  sourceEventId: z.string().min(1),
});
export type Notification = z.infer<typeof NotificationSchema>;

export const NotificationPreferenceSchema = z.object({
  recipientId: z.string().min(1),
  type: NotificationTypeSchema,
  channel: NotificationChannelSchema,
  enabled: z.boolean(),
});
export type NotificationPreference = z.infer<typeof NotificationPreferenceSchema>;

export const NotificationEventSchema = z.object({
  id: z.string().min(1),
  recipientId: z.string().min(1),
  organizationId: z.string().min(1).nullable(),
  type: NotificationTypeSchema,
  titleKey: z.string().min(1),
  bodyKey: z.string().min(1),
  targetPath: z.string().startsWith("/"),
  occurredAt: z.string().datetime(),
});
export type NotificationEvent = z.infer<typeof NotificationEventSchema>;

export const DeliveryInstructionSchema = z.object({
  notification: NotificationSchema,
  channels: z.array(NotificationChannelSchema).min(1),
});
export type DeliveryInstruction = z.infer<typeof DeliveryInstructionSchema>;
