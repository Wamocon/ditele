import { z } from "zod";

import type { Locale } from "@/shared/i18n/config";

export const recordStateSchema = z.enum(["draft", "active", "inactive", "archived"]);
export const contentVersionStateSchema = z.enum(["draft", "in_review", "published", "archived"]);
const localeSchema = z.enum(["en", "de", "ru"]);
const timestampSchema = z.string().datetime({ offset: true });
const nullableTimestampSchema = timestampSchema.nullable();

export const courseLocalizationRowSchema = z.object({
  locale: localeSchema,
  title: z.string().min(1),
  summary: z.string(),
  description_html: z.string(),
  learning_outcomes: z.array(z.unknown()),
});

export const contentVersionRowSchema = z.object({
  id: z.string().uuid(),
  version_number: z.number().int().positive(),
  state: contentVersionStateSchema,
  change_summary: z.string().nullable(),
  row_version: z.number().int().positive(),
  snapshot: z.record(z.string(), z.unknown()),
  created_at: timestampSchema,
  updated_at: timestampSchema,
  published_at: nullableTimestampSchema,
  published_by: z.string().uuid().nullable(),
  content_reviews: z.array(z.object({
    id: z.string().uuid(),
    decision: z.enum(["approved", "changes_requested"]),
    comment: z.string().min(1),
    created_at: timestampSchema,
    reviewer_id: z.string().uuid(),
    content_fingerprint: z.string().regex(/^[0-9a-f]{64}$/).nullable(),
    expected_content_version_row_version: z.number().int().positive().nullable(),
  })).default([]),
});

export const contentArchiveImpactSchema = z.object({
  content_version_id: z.string().uuid(),
  course_id: z.string().uuid(),
  row_version: z.number().int().positive(),
  snapshot_sha256: z.string().regex(/^[0-9a-f]{64}$/),
  task_count: z.number().int().nonnegative(),
  task_schedule_count: z.number().int().nonnegative(),
  attempt_count: z.number().int().nonnegative(),
  open_attempt_count: z.number().int().nonnegative(),
  submission_count: z.number().int().nonnegative(),
  fingerprint: z.string().regex(/^[0-9a-f]{64}$/),
});

const stageLocalizationRowSchema = z.object({
  locale: localeSchema,
  title: z.string().min(1),
  description_html: z.string(),
});

const taskLocalizationRowSchema = z.object({
  locale: localeSchema,
  title: z.string().min(1),
  instructions_html: z.string(),
  hint_text: z.string().nullable(),
});

const taskOptionRowSchema = z.object({
  id: z.string().uuid(),
  labels: z.record(z.string(), z.unknown()),
  position: z.number().int().nonnegative(),
});

const taskAssessmentRowSchema = z.object({
  question_translations: z.record(z.string(), z.unknown()),
  selection_mode: z.enum(["single", "multiple"]),
  minimum_selections: z.number().int().positive(),
  maximum_selections: z.number().int().positive().nullable(),
}).nullable();

const taskHintRowSchema = z.object({
  id: z.string().uuid(),
  position: z.number().int().nonnegative(),
  content_translations: z.record(z.string(), z.unknown()),
});

const taskRowSchema = z.object({
  id: z.string().uuid(),
  content_version_id: z.string().uuid().nullable(),
  position: z.number().int().nonnegative(),
  task_kind: z.enum(["practical", "knowledge", "placement"]),
  state: recordStateSchema,
  target_url: z.string().url().nullable(),
  expected_minutes: z.number().int().positive().nullable(),
  hint_penalty_basis_points: z.number().int().min(0).max(10_000),
  row_version: z.number().int().positive(),
  task_localizations: z.array(taskLocalizationRowSchema),
  task_options: z.array(taskOptionRowSchema),
  task_assessments: taskAssessmentRowSchema,
  task_hints: z.array(taskHintRowSchema),
});

const stageRowSchema = z.object({
  id: z.string().uuid(),
  content_version_id: z.string().uuid().nullable(),
  position: z.number().int().nonnegative(),
  state: recordStateSchema,
  row_version: z.number().int().positive(),
  stage_localizations: z.array(stageLocalizationRowSchema),
  tasks: z.array(taskRowSchema),
});

const mediaRowSchema = z.object({
  id: z.string().uuid(),
  stage_id: z.string().uuid().nullable(),
  media_kind: z.enum(["video", "image", "document", "evidence", "certificate"]),
  mime_type: z.string().min(1),
  byte_size: z.number().int().nonnegative(),
  state: recordStateSchema,
  created_at: timestampSchema,
});

export const adminCourseRowSchema = z.object({
  id: z.string().uuid(),
  organization_id: z.string().uuid().nullable(),
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  state: recordStateSchema,
  default_locale: localeSchema,
  estimated_minutes: z.number().int().positive().nullable(),
  row_version: z.number().int().positive(),
  updated_at: timestampSchema,
  course_localizations: z.array(courseLocalizationRowSchema),
  content_versions: z.array(contentVersionRowSchema),
  stages: z.array(stageRowSchema),
  media_assets: z.array(mediaRowSchema),
});

export const adminCourseListRowSchema = z.object({
  id: z.string().uuid(),
  organization_id: z.string().uuid().nullable(),
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  state: recordStateSchema,
  default_locale: localeSchema,
  estimated_minutes: z.number().int().positive().nullable(),
  row_version: z.number().int().positive(),
  updated_at: timestampSchema,
  course_localizations: z.array(courseLocalizationRowSchema),
  content_versions: z.array(z.object({
    id: z.string().uuid(),
    version_number: z.number().int().positive(),
    state: contentVersionStateSchema,
  })),
  stages: z.array(z.object({
    id: z.string().uuid(),
    tasks: z.array(z.object({ id: z.string().uuid() })),
  })),
});

export const adminCourseListRowsSchema = z.array(adminCourseListRowSchema);

type AdminCourseRow = z.infer<typeof adminCourseRowSchema>;
type AdminCourseListRow = z.infer<typeof adminCourseListRowSchema>;
type CourseLocalizationRow = z.infer<typeof courseLocalizationRowSchema>;

export type RecordState = z.infer<typeof recordStateSchema>;
export type ContentVersionState = z.infer<typeof contentVersionStateSchema>;
export type PreviewRole = "learner" | "trainer" | "admin";
export type ContentArchiveImpact = z.infer<typeof contentArchiveImpactSchema>;

export type ContentArchiveImpactResult =
  | { readonly status: "ready"; readonly impact: ContentArchiveImpact }
  | { readonly status: "forbidden" | "failed" };

export interface ResolvedLocalization<T> {
  readonly value: T;
  readonly resolvedLocale: Locale;
  readonly usedFallback: boolean;
}

export interface AdminCourseListItem {
  readonly id: string;
  readonly slug: string;
  readonly state: RecordState;
  readonly title: string;
  readonly summary: string;
  readonly resolvedLocale: Locale;
  readonly usedFallback: boolean;
  readonly completeLocales: readonly Locale[];
  readonly estimatedMinutes: number | null;
  readonly updatedAt: string;
  readonly versionCount: number;
  readonly latestVersion: {
    readonly id: string;
    readonly versionNumber: number;
    readonly state: ContentVersionState;
  } | null;
  readonly stageCount: number;
  readonly taskCount: number;
}

export interface AdminVersionSummary {
  readonly id: string;
  readonly versionNumber: number;
  readonly state: ContentVersionState;
  readonly changeSummary: string | null;
  readonly rowVersion: number;
  readonly updatedAt: string;
  readonly publishedAt: string | null;
  readonly reviewCount: number;
  readonly latestReview: {
    readonly decision: "approved" | "changes_requested";
    readonly comment: string;
    readonly createdAt: string;
    readonly current: boolean;
  } | null;
}

export interface AdminCourseDetail {
  readonly id: string;
  readonly slug: string;
  readonly state: RecordState;
  readonly title: string;
  readonly summary: string;
  readonly description: string;
  readonly resolvedLocale: Locale;
  readonly usedFallback: boolean;
  readonly estimatedMinutes: number | null;
  readonly rowVersion: number;
  readonly updatedAt: string;
  readonly localizations: readonly {
    readonly locale: Locale;
    readonly title: string;
    readonly summary: string;
    readonly description: string;
    readonly learningOutcomes: readonly string[];
    readonly complete: boolean;
  }[];
  readonly versions: readonly AdminVersionSummary[];
  readonly stageCount: number;
  readonly taskCount: number;
  readonly mediaCount: number;
}

export interface ContentReadinessIssue {
  readonly code: "missing_course_locale" | "missing_stage" | "missing_stage_locale" | "missing_task" | "missing_task_locale" | "invalid_position";
  readonly path: string;
}

export interface ContentVersionProjection {
  readonly courseId: string;
  readonly courseTitle: string;
  readonly courseDescription: string;
  readonly version: AdminVersionSummary;
  readonly locale: Locale;
  readonly resolvedLocale: Locale;
  readonly usedFallback: boolean;
  readonly role: PreviewRole;
  readonly stages: readonly {
    readonly id: string;
    readonly position: number;
    readonly title: string;
    readonly description: string;
    readonly resolvedLocale: Locale;
    readonly tasks: readonly {
      readonly id: string;
      readonly position: number;
      readonly title: string;
      readonly instructions: string;
      readonly resolvedLocale: Locale;
      readonly kind: "practical" | "knowledge" | "placement";
      readonly targetUrl: string | null;
      readonly expectedMinutes: number | null;
      readonly hasHint: boolean;
      readonly assessmentQuestion: string | null;
      readonly assessmentOptions: readonly string[];
    }[];
  }[];
  readonly issues: readonly ContentReadinessIssue[];
}

const localeOrder: readonly Locale[] = ["en", "de", "ru"];

function fallbackOrder(requested: Locale, defaultLocale: Locale): readonly Locale[] {
  return [...new Set<Locale>([requested, defaultLocale, "en", "de", "ru"])];
}

export function resolveLocalization<T extends { readonly locale: Locale }>(
  rows: readonly T[],
  requested: Locale,
  defaultLocale: Locale,
): ResolvedLocalization<T> | null {
  for (const candidate of fallbackOrder(requested, defaultLocale)) {
    const match = rows.find((row) => row.locale === candidate);
    if (match) {
      return { value: match, resolvedLocale: candidate, usedFallback: candidate !== requested };
    }
  }
  return null;
}

function plainText(value: string): string {
  return value
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#(?:39|x27);/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

export function safePlainTextFromHtml(value: string): string {
  return plainText(value);
}

function learningOutcomes(value: unknown): readonly string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

function completeCourseLocales(rows: readonly CourseLocalizationRow[]): readonly Locale[] {
  return localeOrder.filter((locale) => rows.some((row) =>
    row.locale === locale
    && row.title.trim().length > 0
    && row.summary.trim().length > 0
    && plainText(row.description_html).length > 0,
  ));
}

function versionSummary(row: AdminCourseRow["content_versions"][number]): AdminVersionSummary {
  const latestReview = row.content_reviews.toSorted((left, right) => {
    const created = right.created_at.localeCompare(left.created_at);
    return created === 0 ? right.id.localeCompare(left.id) : created;
  })[0];
  return {
    id: row.id,
    versionNumber: row.version_number,
    state: row.state,
    changeSummary: row.change_summary,
    rowVersion: row.row_version,
    updatedAt: row.updated_at,
    publishedAt: row.published_at,
    reviewCount: row.content_reviews.length,
    latestReview: latestReview
      ? {
          decision: latestReview.decision,
          comment: latestReview.comment,
          createdAt: latestReview.created_at,
          // decide_content_review records the inspected revision, then the
          // lifecycle update advances it once. Review-state graphs are
          // immutable; publication still rechecks the private fingerprint.
          current: row.state === "in_review"
            && latestReview.content_fingerprint !== null
            && latestReview.expected_content_version_row_version === row.row_version - 1,
        }
      : null,
  };
}

export function projectAdminCourseListItem(row: AdminCourseListRow, locale: Locale): AdminCourseListItem {
  const resolved = resolveLocalization(row.course_localizations, locale, row.default_locale);
  const versions = row.content_versions.toSorted((a, b) => b.version_number - a.version_number);
  const taskCount = row.stages.reduce((count, stage) => count + stage.tasks.length, 0);
  return {
    id: row.id,
    slug: row.slug,
    state: row.state,
    title: resolved?.value.title ?? row.slug,
    summary: resolved?.value.summary ?? "",
    resolvedLocale: resolved?.resolvedLocale ?? row.default_locale,
    usedFallback: resolved?.usedFallback ?? true,
    completeLocales: completeCourseLocales(row.course_localizations),
    estimatedMinutes: row.estimated_minutes,
    updatedAt: row.updated_at,
    versionCount: versions.length,
    latestVersion: versions[0]
      ? { id: versions[0].id, versionNumber: versions[0].version_number, state: versions[0].state }
      : null,
    stageCount: row.stages.length,
    taskCount,
  };
}

export function projectAdminCourseDetail(row: AdminCourseRow, locale: Locale): AdminCourseDetail {
  const resolved = resolveLocalization(row.course_localizations, locale, row.default_locale);
  return {
    id: row.id,
    slug: row.slug,
    state: row.state,
    title: resolved?.value.title ?? row.slug,
    summary: resolved?.value.summary ?? "",
    description: resolved ? plainText(resolved.value.description_html) : "",
    resolvedLocale: resolved?.resolvedLocale ?? row.default_locale,
    usedFallback: resolved?.usedFallback ?? true,
    estimatedMinutes: row.estimated_minutes,
    rowVersion: row.row_version,
    updatedAt: row.updated_at,
    localizations: localeOrder.map((itemLocale) => {
      const item = row.course_localizations.find((candidate) => candidate.locale === itemLocale);
      return {
        locale: itemLocale,
        title: item?.title ?? "",
        summary: item?.summary ?? "",
        description: item ? plainText(item.description_html) : "",
        learningOutcomes: item ? learningOutcomes(item.learning_outcomes) : [],
        complete: Boolean(
          item
          && item.title.trim()
          && item.summary.trim()
          && plainText(item.description_html),
        ),
      };
    }),
    versions: row.content_versions
      .toSorted((a, b) => b.version_number - a.version_number)
      .map(versionSummary),
    stageCount: row.stages.length,
    taskCount: row.stages.reduce((count, stage) => count + stage.tasks.length, 0),
    mediaCount: row.media_assets.length,
  };
}

function issue(
  issues: ContentReadinessIssue[],
  code: ContentReadinessIssue["code"],
  path: string,
): void {
  issues.push({ code, path });
}

function labelFromJson(labels: unknown, locale: Locale, defaultLocale: Locale): string {
  if (!labels || typeof labels !== "object" || Array.isArray(labels)) return "";
  const values = labels as Record<string, unknown>;
  for (const candidate of fallbackOrder(locale, defaultLocale)) {
    const value = values[candidate];
    if (typeof value === "string" && value.trim()) return value;
  }
  return "";
}

export function projectContentVersion(
  row: AdminCourseRow,
  contentVersionId: string,
  locale: Locale,
  role: PreviewRole,
): ContentVersionProjection | null {
  const versionRow = row.content_versions.find((version) => version.id === contentVersionId);
  if (!versionRow) return null;

  const courseLocalization = resolveLocalization(row.course_localizations, locale, row.default_locale);
  const versionStages = row.stages
    .filter((stage) => stage.content_version_id === contentVersionId)
    .toSorted((a, b) => a.position - b.position);
  const issues: ContentReadinessIssue[] = [];

  for (const requiredLocale of localeOrder) {
    const localization = row.course_localizations.find((item) => item.locale === requiredLocale);
    if (!localization || !localization.title.trim() || !localization.summary.trim() || !plainText(localization.description_html)) {
      issue(issues, "missing_course_locale", `course.${requiredLocale}`);
    }
  }
  if (versionStages.length === 0) {
    issue(issues, "missing_stage", "stages");
  }

  const stages = versionStages.map((stage, stageIndex) => {
    if (stage.position !== stageIndex) {
      issue(issues, "invalid_position", `stages.${stageIndex}.position`);
    }
    for (const requiredLocale of localeOrder) {
      const localization = stage.stage_localizations.find((item) => item.locale === requiredLocale);
      if (!localization || !localization.title.trim()) {
        issue(issues, "missing_stage_locale", `stages.${stageIndex}.${requiredLocale}`);
      }
    }
    const resolvedStage = resolveLocalization(stage.stage_localizations, locale, row.default_locale);
    const versionTasks = stage.tasks
      .filter((task) => task.content_version_id === contentVersionId)
      .toSorted((a, b) => a.position - b.position);
    if (versionTasks.length === 0) {
      issue(issues, "missing_task", `stages.${stageIndex}.tasks`);
    }
    const tasks = versionTasks.map((task, taskIndex) => {
      if (task.position !== taskIndex) {
        issue(issues, "invalid_position", `stages.${stageIndex}.tasks.${taskIndex}.position`);
      }
      for (const requiredLocale of localeOrder) {
        const localization = task.task_localizations.find((item) => item.locale === requiredLocale);
        if (!localization || !localization.title.trim() || !plainText(localization.instructions_html)) {
          issue(issues, "missing_task_locale", `stages.${stageIndex}.tasks.${taskIndex}.${requiredLocale}`);
        }
      }
      const resolvedTask = resolveLocalization(task.task_localizations, locale, row.default_locale);
      return {
        id: task.id,
        position: task.position,
        title: resolvedTask?.value.title ?? task.id,
        instructions: resolvedTask ? plainText(resolvedTask.value.instructions_html) : "",
        resolvedLocale: resolvedTask?.resolvedLocale ?? row.default_locale,
        kind: task.task_kind,
        targetUrl: task.target_url,
        expectedMinutes: task.expected_minutes,
        hasHint: Boolean(resolvedTask?.value.hint_text?.trim()) || task.task_hints.length > 0,
        assessmentQuestion: task.task_assessments
          ? labelFromJson(task.task_assessments.question_translations, locale, row.default_locale) || null
          : null,
        assessmentOptions: task.task_options
          .toSorted((a, b) => a.position - b.position)
          .map((option) => labelFromJson(option.labels, locale, row.default_locale))
          .filter((label) => label.length > 0),
      };
    });
    return {
      id: stage.id,
      position: stage.position,
      title: resolvedStage?.value.title ?? stage.id,
      description: resolvedStage ? plainText(resolvedStage.value.description_html) : "",
      resolvedLocale: resolvedStage?.resolvedLocale ?? row.default_locale,
      tasks,
    };
  });

  return {
    courseId: row.id,
    courseTitle: courseLocalization?.value.title ?? row.slug,
    courseDescription: courseLocalization ? plainText(courseLocalization.value.description_html) : "",
    version: versionSummary(versionRow),
    locale,
    resolvedLocale: courseLocalization?.resolvedLocale ?? row.default_locale,
    usedFallback: courseLocalization?.usedFallback ?? true,
    role,
    stages,
    issues,
  };
}
