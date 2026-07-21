/**
 * WS-5 content-authoring model.
 *
 * Types live here rather than in `src/shared/data/content.ts` because that file
 * is `server-only` and the studio's Client Components need the same shapes.
 * Everything in this file is pure — no imports, no I/O, safe on both sides.
 */

export const CONTENT_LOCALES = ["de", "en", "ru"] as const;
export type ContentLocale = (typeof CONTENT_LOCALES)[number];

/**
 * ⚠️ `tasks.task_kind` is a CHECK constraint, not an enum — it is typed `string`
 * in database.types.ts, so TypeScript will not catch a wrong value.
 * Allowed values (migration …091000 line 247): practical | knowledge | placement.
 */
export const TASK_KINDS = ["knowledge", "practical", "placement"] as const;
export type TaskKind = (typeof TASK_KINDS)[number];

export function isTaskKind(value: string): value is TaskKind {
  return (TASK_KINDS as readonly string[]).includes(value);
}

export type ContentVersionState = "draft" | "in_review" | "published" | "archived";
export type RecordState = "draft" | "active" | "inactive" | "archived";

/** A published or archived version is immutable — the studio renders read-only. */
export function isVersionEditable(state: ContentVersionState): boolean {
  return state === "draft" || state === "in_review";
}

export type LocalizedMap = Partial<Record<string, string>>;

export function pickLocalized(map: LocalizedMap | null | undefined, locale: string): string {
  if (!map) return "";
  return map[locale] || map.de || map.en || Object.values(map).find(Boolean) || "";
}

/* ── Course list & detail ─────────────────────────────────────────────── */

export interface CourseLocalization {
  locale: string;
  title: string;
  summary: string;
  descriptionHtml: string;
  learningOutcomes: string[];
}

export interface AdminCourseRow {
  id: string;
  slug: string;
  state: RecordState;
  defaultLocale: string;
  estimatedMinutes: number | null;
  updatedAt: string;
  title: string;
  versionCount: number;
  latestVersionId: string | null;
  latestVersionNumber: number | null;
  latestVersionState: ContentVersionState | null;
  taskCount: number;
}

export interface ContentVersionSummary {
  id: string;
  versionNumber: number;
  state: ContentVersionState;
  changeSummary: string | null;
  publishedAt: string | null;
  rowVersion: number;
  stageCount: number;
  taskCount: number;
}

export interface AdminCourseDetail {
  id: string;
  slug: string;
  state: RecordState;
  defaultLocale: string;
  estimatedMinutes: number | null;
  updatedAt: string;
  localizations: CourseLocalization[];
  versions: ContentVersionSummary[];
}

/* ── Studio ───────────────────────────────────────────────────────────── */

export interface StageLocalization {
  locale: string;
  title: string;
  descriptionHtml: string;
}

export interface TaskLocalization {
  locale: string;
  title: string;
  instructionsHtml: string;
}

export interface TaskHint {
  id: string;
  position: number;
  translations: LocalizedMap;
}

export interface TaskOption {
  id: string;
  optionKey: string;
  position: number;
  labels: LocalizedMap;
  isCorrect: boolean;
}

export interface TaskAssessment {
  question: LocalizedMap;
  selectionMode: string;
  minimumSelections: number;
  maximumSelections: number | null;
}

export interface TaskSkillMapping {
  id: string;
  skillId: string;
  mappingVersion: number;
  weightBasisPoints: number;
  evidenceRequired: boolean;
}

export interface StudioTask {
  id: string;
  stageId: string;
  position: number;
  kind: string;
  state: RecordState;
  targetUrl: string | null;
  expectedMinutes: number | null;
  localizations: TaskLocalization[];
  hints: TaskHint[];
  options: TaskOption[];
  assessment: TaskAssessment | null;
  skills: TaskSkillMapping[];
}

export interface StudioStage {
  id: string;
  position: number;
  state: RecordState;
  localizations: StageLocalization[];
  tasks: StudioTask[];
}

export interface SkillOption {
  id: string;
  code: string;
  labels: LocalizedMap;
}

export interface LatestContentReview {
  decision: string;
  comment: string | null;
  createdAt: string;
  expectedRowVersion: number;
}

export interface StudioWorkspace {
  versionId: string;
  versionNumber: number;
  versionState: ContentVersionState;
  changeSummary: string | null;
  rowVersion: number;
  publishedAt: string | null;
  courseId: string;
  courseSlug: string;
  courseTitle: string;
  courseLocalizations: CourseLocalization[];
  stages: StudioStage[];
  skills: SkillOption[];
  latestReview: LatestContentReview | null;
}

/* ── Task inventory ───────────────────────────────────────────────────── */

export interface TaskInventoryRow {
  id: string;
  title: string;
  kind: string;
  state: RecordState;
  expectedMinutes: number | null;
  courseId: string;
  courseTitle: string;
  stageTitle: string;
  versionId: string | null;
  versionNumber: number | null;
  versionState: ContentVersionState | null;
}

/* ── Readiness — mirrors app_private.assert_content_version_ready ─────── */

/**
 * The database runs these same rules inside `submit_content_for_review`,
 * `decide_content_review('approved')` and `publish_content_version`, each time
 * raising a bare `23514`. Recomputing them here is what turns "die Aktion konnte
 * nicht ausgeführt werden" into a checklist that says which task is missing its
 * Russian title.
 *
 * Source: migration …099200 line 781 (render readiness) and …099600 line 592
 * (competency graph readiness).
 */
export type ReadinessKey =
  | "checkCourseLocales"
  | "checkStageExists"
  | "checkStagePositions"
  | "checkStageLocales"
  | "checkStageTasks"
  | "checkTaskPositions"
  | "checkTaskLocales"
  | "checkTaskHints"
  | "checkTaskSkills"
  | "checkAssessments";

export interface ReadinessCheck {
  key: ReadinessKey;
  ok: boolean;
  /** Which stage/task is at fault. Already human-readable, not a key. */
  detail?: string | undefined;
}

const TOTAL_BASIS_POINTS = 10000;

function hasAllLocales(entries: { locale: string }[], required = CONTENT_LOCALES): boolean {
  return required.every((locale) => entries.some((entry) => entry.locale === locale));
}

function isFilled(value: string | null | undefined): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

function contiguousFromZero(positions: number[]): boolean {
  if (positions.length === 0) return true;
  const sorted = [...positions].sort((a, b) => a - b);
  return sorted[0] === 0 && sorted[sorted.length - 1] === sorted.length - 1;
}

function stageLabel(stage: StudioStage, index: number): string {
  const localized = stage.localizations.find((l) => l.locale === "de") ?? stage.localizations[0];
  return isFilled(localized?.title) ? String(localized?.title) : `Stufe ${index + 1}`;
}

function taskLabel(task: StudioTask, index: number): string {
  const localized = task.localizations.find((l) => l.locale === "de") ?? task.localizations[0];
  return isFilled(localized?.title) ? String(localized?.title) : `Aufgabe ${index + 1}`;
}

export function buildReadiness(workspace: StudioWorkspace): ReadinessCheck[] {
  const stages = workspace.stages;
  const tasks = stages.flatMap((stage) => stage.tasks);

  const courseLocalesOk =
    hasAllLocales(workspace.courseLocalizations) &&
    CONTENT_LOCALES.every((locale) => {
      const entry = workspace.courseLocalizations.find((l) => l.locale === locale);
      return (
        isFilled(entry?.title) && isFilled(entry?.summary) && isFilled(entry?.descriptionHtml)
      );
    });
  const missingCourseLocales = CONTENT_LOCALES.filter((locale) => {
    const entry = workspace.courseLocalizations.find((l) => l.locale === locale);
    return !(isFilled(entry?.title) && isFilled(entry?.summary) && isFilled(entry?.descriptionHtml));
  });

  const stagesMissingLocales = stages
    .map((stage, index) => ({ stage, index }))
    .filter(
      ({ stage }) =>
        !hasAllLocales(stage.localizations) ||
        !CONTENT_LOCALES.every((locale) => {
          const entry = stage.localizations.find((l) => l.locale === locale);
          return isFilled(entry?.title) && isFilled(entry?.descriptionHtml);
        })
    )
    .map(({ stage, index }) => stageLabel(stage, index));

  const stagesWithoutTasks = stages
    .map((stage, index) => ({ stage, index }))
    .filter(({ stage }) => stage.tasks.length === 0)
    .map(({ stage, index }) => stageLabel(stage, index));

  const stagesWithBadTaskOrder = stages
    .map((stage, index) => ({ stage, index }))
    .filter(({ stage }) => !contiguousFromZero(stage.tasks.map((task) => task.position)))
    .map(({ stage, index }) => stageLabel(stage, index));

  const tasksMissingLocales = tasks
    .map((task, index) => ({ task, index }))
    .filter(
      ({ task }) =>
        !hasAllLocales(task.localizations) ||
        !CONTENT_LOCALES.every((locale) => {
          const entry = task.localizations.find((l) => l.locale === locale);
          return isFilled(entry?.title) && isFilled(entry?.instructionsHtml);
        })
    )
    .map(({ task, index }) => taskLabel(task, index));

  const tasksWithBadHints = tasks
    .map((task, index) => ({ task, index }))
    .filter(
      ({ task }) =>
        task.hints.some(
          (hint) => !CONTENT_LOCALES.every((locale) => isFilled(hint.translations[locale]))
        ) || !contiguousFromZero(task.hints.map((hint) => hint.position))
    )
    .map(({ task, index }) => taskLabel(task, index));

  const tasksWithBadSkills = tasks
    .map((task, index) => ({ task, index }))
    .filter(({ task }) => {
      if (task.skills.length === 0) return true;
      const versions = new Set(task.skills.map((skill) => skill.mappingVersion));
      if (versions.size !== 1) return true;
      const total = task.skills.reduce((sum, skill) => sum + skill.weightBasisPoints, 0);
      return total !== TOTAL_BASIS_POINTS;
    })
    .map(({ task, index }) => taskLabel(task, index));

  const tasksWithBadAssessment = tasks
    .map((task, index) => ({ task, index }))
    .filter(({ task }) => {
      if (!task.assessment) return task.options.length > 0;
      const assessment = task.assessment;
      if (!CONTENT_LOCALES.every((locale) => isFilled(assessment.question[locale]))) return true;
      if (assessment.selectionMode === "single") {
        if (assessment.minimumSelections !== 1 || assessment.maximumSelections !== 1) return true;
      }
      if (assessment.maximumSelections === null) return true;
      if (assessment.maximumSelections > task.options.length) return true;
      if (task.options.length < assessment.minimumSelections) return true;
      if (
        task.options.some(
          (option) => !CONTENT_LOCALES.every((locale) => isFilled(option.labels[locale]))
        )
      ) {
        return true;
      }
      const correct = task.options.filter((option) => option.isCorrect).length;
      return correct < assessment.minimumSelections || correct > assessment.maximumSelections;
    })
    .map(({ task, index }) => taskLabel(task, index));

  const join = (names: string[]): string | undefined =>
    names.length === 0 ? undefined : names.slice(0, 3).join(", ") + (names.length > 3 ? " …" : "");

  return [
    {
      key: "checkCourseLocales",
      ok: courseLocalesOk,
      detail: missingCourseLocales.length ? missingCourseLocales.join(", ").toUpperCase() : undefined,
    },
    { key: "checkStageExists", ok: stages.length > 0 },
    {
      key: "checkStagePositions",
      ok: contiguousFromZero(stages.map((stage) => stage.position)),
    },
    { key: "checkStageLocales", ok: stagesMissingLocales.length === 0, detail: join(stagesMissingLocales) },
    { key: "checkStageTasks", ok: stagesWithoutTasks.length === 0, detail: join(stagesWithoutTasks) },
    {
      key: "checkTaskPositions",
      ok: stagesWithBadTaskOrder.length === 0,
      detail: join(stagesWithBadTaskOrder),
    },
    { key: "checkTaskLocales", ok: tasksMissingLocales.length === 0, detail: join(tasksMissingLocales) },
    { key: "checkTaskHints", ok: tasksWithBadHints.length === 0, detail: join(tasksWithBadHints) },
    { key: "checkTaskSkills", ok: tasksWithBadSkills.length === 0, detail: join(tasksWithBadSkills) },
    {
      key: "checkAssessments",
      ok: tasksWithBadAssessment.length === 0,
      detail: join(tasksWithBadAssessment),
    },
  ];
}

export function isReady(checks: ReadinessCheck[]): boolean {
  return checks.every((check) => check.ok);
}
