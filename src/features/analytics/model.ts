import { z } from "zod";

export const AnalyticsCategorySchema = z.enum(["necessary", "product", "learning"]);
export type AnalyticsCategory = z.infer<typeof AnalyticsCategorySchema>;

export const AnalyticsEventNameSchema = z.enum([
  "catalog.viewed",
  "enrollment.requested",
  "task.submitted",
  "review.completed",
  "skill.mastery_updated",
  "lab.validation_completed",
  "ai.coach_used",
]);

const AnalyticsIdentifierSchema = z.string().trim().min(1).max(128);
const AnalyticsEventBaseSchema = z.object({
  id: z.string().min(1),
  schemaVersion: z.literal(1),
  subjectId: AnalyticsIdentifierSchema.nullable(),
  organizationId: AnalyticsIdentifierSchema.nullable(),
  occurredAt: z.string().datetime(),
}).strict();

export const AnalyticsEventSchema = z.discriminatedUnion("name", [
  AnalyticsEventBaseSchema.extend({
    name: z.literal("catalog.viewed"),
    category: z.literal("product"),
    properties: z.object({
      course_id: AnalyticsIdentifierSchema,
      locale: z.enum(["en", "de", "ru"]),
    }).strict(),
  }),
  AnalyticsEventBaseSchema.extend({
    name: z.literal("enrollment.requested"),
    category: z.literal("product"),
    properties: z.object({ course_id: AnalyticsIdentifierSchema }).strict(),
  }),
  AnalyticsEventBaseSchema.extend({
    name: z.literal("task.submitted"),
    category: z.literal("learning"),
    properties: z.object({
      task_id: AnalyticsIdentifierSchema,
      duration_seconds: z.number().int().nonnegative().max(86_400),
      attempt_number: z.number().int().positive().max(100).optional(),
      hint_used: z.boolean().optional(),
      evidence_count: z.number().int().nonnegative().max(100).optional(),
    }).strict(),
  }),
  AnalyticsEventBaseSchema.extend({
    name: z.literal("review.completed"),
    category: z.literal("learning"),
    properties: z.object({
      task_id: AnalyticsIdentifierSchema,
      decision: z.enum(["accepted", "revision_required"]),
      score: z.number().finite().min(0).max(100).optional(),
    }).strict(),
  }),
  AnalyticsEventBaseSchema.extend({
    name: z.literal("skill.mastery_updated"),
    category: z.literal("learning"),
    properties: z.object({
      skill_id: AnalyticsIdentifierSchema,
      previous_level: z.number().finite().min(0).max(1),
      current_level: z.number().finite().min(0).max(1),
      evidence_count: z.number().int().nonnegative().max(10_000).optional(),
    }).strict(),
  }),
  AnalyticsEventBaseSchema.extend({
    name: z.literal("lab.validation_completed"),
    category: z.literal("learning"),
    properties: z.object({
      lab_template_id: AnalyticsIdentifierSchema,
      outcome: z.enum(["passed", "failed", "error"]),
      duration_seconds: z.number().int().nonnegative().max(86_400).optional(),
    }).strict(),
  }),
  AnalyticsEventBaseSchema.extend({
    name: z.literal("ai.coach_used"),
    category: z.literal("learning"),
    properties: z.object({
      mode: z.enum(["recommendation", "learning", "assessment", "trainer_draft"]),
      outcome: z.enum(["answered", "refused", "unavailable", "escalated"]),
      hint_level: z.number().int().min(0).max(3),
    }).strict(),
  }),
]);
export type AnalyticsEvent = z.infer<typeof AnalyticsEventSchema>;

export const AnalyticsSubjectReferenceSchema = z.string().regex(/^sub_[A-Za-z0-9_-]{16,128}$/);
export type PseudonymizedAnalyticsEvent = AnalyticsEvent extends infer Event
  ? Event extends { subjectId: string | null }
    ? Omit<Event, "subjectId"> & { subjectId: string | null }
    : never
  : never;

export const AnalyticsConsentSchema = z.object({
  subjectId: z.string().min(1),
  product: z.boolean(),
  learning: z.boolean(),
  recordedAt: z.string().datetime(),
  withdrawnAt: z.string().datetime().nullable().optional(),
});
export type AnalyticsConsent = z.infer<typeof AnalyticsConsentSchema>;

export const AnalyticsMetricSchema = z.object({
  key: z.string().min(1),
  value: z.number().finite(),
  definition: z.string().trim().min(1),
  calculatedAt: z.string().datetime(),
});
export type AnalyticsMetric = z.infer<typeof AnalyticsMetricSchema>;
