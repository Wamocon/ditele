import { z } from "zod";

export const CatalogLocaleSchema = z.enum(["en", "de", "ru"]);

export type CatalogLocale = z.infer<typeof CatalogLocaleSchema>;

export const LocalizedTextSchema = z.object({
  en: z.string().trim().min(1),
  de: z.string().trim().min(1).optional(),
  ru: z.string().trim().min(1).optional(),
});

export type LocalizedText = z.infer<typeof LocalizedTextSchema>;

export const CourseAvailabilitySchema = z.enum([
  "open",
  "request_required",
  "waitlist",
  "closed",
]);

export const CatalogCourseSchema = z.object({
  id: z.string().min(1),
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  version: z.number().int().positive(),
  title: LocalizedTextSchema,
  summary: LocalizedTextSchema,
  imageUrl: z.string().url().optional(),
  durationMinutes: z.number().int().nonnegative(),
  taskCount: z.number().int().nonnegative(),
  availability: CourseAvailabilitySchema,
  tags: z.array(z.string().trim().min(1)).max(20),
  publishedAt: z.string().datetime(),
});

export type CatalogCourse = z.infer<typeof CatalogCourseSchema>;

export const CatalogCourseDetailSchema = CatalogCourseSchema.extend({
  description: LocalizedTextSchema,
  learningOutcomes: z.array(LocalizedTextSchema).min(1),
  landingUrl: z.string().url().optional(),
  prerequisites: z.array(LocalizedTextSchema),
});

export type CatalogCourseDetail = z.infer<typeof CatalogCourseDetailSchema>;

export const CatalogQuerySchema = z.object({
  locale: CatalogLocaleSchema,
  search: z.string().trim().max(120).default(""),
  tag: z.string().trim().max(50).optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(1).max(48).default(12),
});

export type CatalogQuery = z.infer<typeof CatalogQuerySchema>;

export const CatalogPageSchema = z.object({
  items: z.array(CatalogCourseSchema),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  total: z.number().int().nonnegative(),
});

export type CatalogPage = z.infer<typeof CatalogPageSchema>;

export function localizedText(value: LocalizedText, locale: CatalogLocale): string {
  return value[locale] ?? value.en;
}
