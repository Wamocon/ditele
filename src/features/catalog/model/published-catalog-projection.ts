import { z } from "zod";

import {
  CatalogCourseDetailSchema,
  CatalogCourseSchema,
  CatalogLocaleSchema,
  type CatalogCourse,
  type CatalogCourseDetail,
  type CatalogLocale,
  type LocalizedText,
} from "./catalog";

const LocalizedCatalogMapSchema = z
  .object({
    en: z.string().trim().min(1),
    de: z.string().trim().min(1),
    ru: z.string().trim().min(1),
  })
  .strict();

export const PublicCatalogProjectionRowSchema = z
  .object({
    course_id: z.uuid(),
    slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    title: z.string().trim().min(1),
    summary: z.string().trim().min(1),
    resolved_locale: CatalogLocaleSchema,
    default_locale: CatalogLocaleSchema,
    estimated_minutes: z.number().int().nonnegative(),
    version_number: z.number().int().positive(),
    published_at: z.string().datetime({ offset: true }),
    task_count: z.number().int().nonnegative(),
    title_localizations: LocalizedCatalogMapSchema,
    summary_localizations: LocalizedCatalogMapSchema,
  })
  .strict();

export type PublicCatalogProjectionRow = z.infer<
  typeof PublicCatalogProjectionRowSchema
>;

const PublicCatalogLocalizationSchema = z
  .object({
    locale: CatalogLocaleSchema,
    title: z.string().trim().min(1),
    summary: z.string().trim().min(1),
    description_html: z.string().trim().min(1),
    learning_outcomes: z.array(z.string().trim().min(1)).min(1),
  })
  .strict();

export const PublicCatalogCourseProjectionRowSchema = z
  .object({
    course_id: z.uuid(),
    slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    default_locale: CatalogLocaleSchema,
    estimated_minutes: z.number().int().nonnegative(),
    version_number: z.number().int().positive(),
    published_at: z.string().datetime({ offset: true }),
    task_count: z.number().int().nonnegative(),
    localizations: z
      .array(PublicCatalogLocalizationSchema)
      .length(3)
      .refine(
        (localizations) =>
          new Set(localizations.map((localization) => localization.locale)).size === 3,
        "catalog.duplicate_localization",
      ),
  })
  .strict();

export type PublicCatalogCourseProjectionRow = z.infer<
  typeof PublicCatalogCourseProjectionRowSchema
>;

function baseCourse(
  row: Pick<
    PublicCatalogCourseProjectionRow,
    | "course_id"
    | "slug"
    | "version_number"
    | "estimated_minutes"
    | "task_count"
    | "published_at"
  >,
  title: LocalizedText,
  summary: LocalizedText,
): CatalogCourse {
  return CatalogCourseSchema.parse({
    id: row.course_id,
    slug: row.slug,
    version: row.version_number,
    title,
    summary,
    durationMinutes: row.estimated_minutes,
    taskCount: row.task_count,
    availability: "request_required",
    tags: [],
    publishedAt: new Date(row.published_at).toISOString(),
  });
}

export function toCatalogCourse(input: unknown): CatalogCourse {
  const row = PublicCatalogProjectionRowSchema.parse(input);

  return baseCourse(
    row,
    row.title_localizations,
    row.summary_localizations,
  );
}

function localizedValues(
  rows: PublicCatalogCourseProjectionRow["localizations"],
  select: (row: PublicCatalogCourseProjectionRow["localizations"][number]) => string,
): LocalizedText {
  const values = new Map(rows.map((row) => [row.locale, select(row)]));

  return {
    en: values.get("en")!,
    de: values.get("de")!,
    ru: values.get("ru")!,
  };
}

function plainTextFromHtml(value: string): string {
  return value
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function toCatalogCourseDetail(input: unknown): CatalogCourseDetail {
  const row = PublicCatalogCourseProjectionRowSchema.parse(input);
  const localizationByLocale = new Map(
    row.localizations.map((localization) => [localization.locale, localization]),
  );
  const englishOutcomes = localizationByLocale.get("en")!.learning_outcomes;
  const germanOutcomes = localizationByLocale.get("de")!.learning_outcomes;
  const russianOutcomes = localizationByLocale.get("ru")!.learning_outcomes;

  return CatalogCourseDetailSchema.parse({
    ...baseCourse(
      row,
      localizedValues(row.localizations, (localization) => localization.title),
      localizedValues(row.localizations, (localization) => localization.summary),
    ),
    description: localizedValues(row.localizations, (localization) =>
      plainTextFromHtml(localization.description_html),
    ),
    learningOutcomes: englishOutcomes.map((englishOutcome, index) => ({
      en: englishOutcome,
      ...(germanOutcomes[index] ? { de: germanOutcomes[index] } : {}),
      ...(russianOutcomes[index] ? { ru: russianOutcomes[index] } : {}),
    })),
    prerequisites: [],
  });
}

export function catalogProjectionMatchesSearch(
  input: PublicCatalogProjectionRow,
  locale: CatalogLocale,
  search: string,
): boolean {
  const normalizedSearch = search.trim().toLocaleLowerCase(locale);
  if (!normalizedSearch) return true;

  return `${input.title} ${input.summary}`
    .toLocaleLowerCase(locale)
    .includes(normalizedSearch);
}
