import { z } from "zod";

import type { Locale } from "@/shared/i18n/config";

const localeSchema = z.enum(["en", "de", "ru"]);
const timestampSchema = z.string().min(1).refine(
  (value) => !Number.isNaN(Date.parse(value)),
  "Invalid database timestamp",
);
const localizationSchema = z.object({
  locale: localeSchema,
  title: z.string().trim().min(1),
});

export const adminTaskRowSchema = z.object({
  id: z.string().uuid(),
  course_id: z.string().uuid(),
  stage_id: z.string().uuid(),
  content_version_id: z.string().uuid().nullable(),
  position: z.number().int().nonnegative(),
  task_kind: z.enum(["practical", "knowledge", "placement"]),
  state: z.enum(["draft", "active", "inactive", "archived"]),
  target_url: z.string().url().nullable(),
  expected_minutes: z.number().int().positive().nullable(),
  row_version: z.number().int().positive(),
  updated_at: timestampSchema,
  task_localizations: z.array(localizationSchema),
  task_options: z.array(z.object({ id: z.string().uuid() })),
  task_hints: z.array(z.object({ id: z.string().uuid() })),
  task_assessments: z.object({ task_id: z.string().uuid() }).nullable(),
  courses: z.object({
    id: z.string().uuid(),
    slug: z.string().min(1),
    course_localizations: z.array(localizationSchema),
  }),
  stages: z.object({
    id: z.string().uuid(),
    position: z.number().int().nonnegative(),
    stage_localizations: z.array(localizationSchema),
  }),
  content_versions: z.object({
    id: z.string().uuid(),
    version_number: z.number().int().positive(),
    state: z.enum(["draft", "in_review", "published", "archived"]),
  }).nullable(),
});

export const adminTaskRowsSchema = z.array(adminTaskRowSchema);

export type AdminTaskListItem = {
  readonly id: string;
  readonly title: string;
  readonly resolvedLocale: Locale;
  readonly usedFallback: boolean;
  readonly completeLocales: readonly Locale[];
  readonly state: "draft" | "active" | "inactive" | "archived";
  readonly kind: "practical" | "knowledge" | "placement";
  readonly position: number;
  readonly stagePosition: number;
  readonly stageTitle: string;
  readonly courseId: string;
  readonly courseTitle: string;
  readonly versionNumber: number | null;
  readonly versionState: "draft" | "in_review" | "published" | "archived" | null;
  readonly expectedMinutes: number | null;
  readonly hasTarget: boolean;
  readonly hasAssessment: boolean;
  readonly optionCount: number;
  readonly hintCount: number;
  readonly rowVersion: number;
  readonly updatedAt: string;
};

function localized(
  rows: readonly z.infer<typeof localizationSchema>[],
  locale: Locale,
  fallback: string,
): { title: string; resolvedLocale: Locale; usedFallback: boolean } {
  const selected = rows.find((row) => row.locale === locale)
    ?? rows.find((row) => row.locale === "en")
    ?? rows[0];
  return {
    title: selected?.title ?? fallback,
    resolvedLocale: selected?.locale ?? locale,
    usedFallback: selected ? selected.locale !== locale : true,
  };
}

export function projectAdminTask(
  rowInput: unknown,
  locale: Locale,
): AdminTaskListItem {
  const row = adminTaskRowSchema.parse(rowInput);
  const task = localized(row.task_localizations, locale, row.id);
  const course = localized(row.courses.course_localizations, locale, row.courses.slug);
  const stage = localized(
    row.stages.stage_localizations,
    locale,
    `${course.title} · ${row.stages.position + 1}`,
  );
  return {
    id: row.id,
    title: task.title,
    resolvedLocale: task.resolvedLocale,
    usedFallback: task.usedFallback,
    completeLocales: (["en", "de", "ru"] as const).filter((candidate) =>
      row.task_localizations.some((item) => item.locale === candidate),
    ),
    state: row.state,
    kind: row.task_kind,
    position: row.position,
    stagePosition: row.stages.position,
    stageTitle: stage.title,
    courseId: row.course_id,
    courseTitle: course.title,
    versionNumber: row.content_versions?.version_number ?? null,
    versionState: row.content_versions?.state ?? null,
    expectedMinutes: row.expected_minutes,
    hasTarget: row.target_url !== null,
    hasAssessment: row.task_assessments !== null,
    optionCount: row.task_options.length,
    hintCount: row.task_hints.length,
    rowVersion: row.row_version,
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}
