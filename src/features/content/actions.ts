"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/shared/auth/guard";
import type { DataError, Result } from "@/shared/data/result";
import {
  archiveVersion,
  createCourse,
  createStage,
  createTask,
  createVersion,
  decideReview,
  deleteStage,
  deleteTask,
  loadArchiveImpact,
  publishVersion,
  reorderStages,
  reorderTasks,
  setCourseState,
  setTaskGateQuestion,
  setTaskAssessment,
  setTaskHints,
  setTaskSkills,
  submitForReview,
  updateCourseMeta,
  updateTask,
  upsertCourseLocalization,
  upsertStageLocalization,
  type ArchiveImpact,
} from "@/shared/data/content";
import type { RecordState } from "./model";

/**
 * ⚠️ A layout guard does not protect a POST (MASTER_PLAN §9.3). Every action
 * here re-checks the role before touching data, and the database checks again
 * through RLS and the `content.manage` / `content.publish` permissions.
 */
async function requireAdmin(locale: string): Promise<void> {
  await requireRole(["admin"], locale);
}

export type ActionState =
  | { status: "idle" }
  | { status: "ok"; message?: string }
  | { status: "error"; message: string };

const failed = (error: DataError): ActionState => ({ status: "error", message: error.message });

function settle(result: Result<unknown>): ActionState {
  return result.ok ? { status: "ok" } : failed(result.error);
}

function revalidateStudio(locale: string, courseId: string, versionId: string): void {
  revalidatePath(`/${locale}/admin/courses/${courseId}/versions/${versionId}`);
  revalidatePath(`/${locale}/admin/courses/${courseId}`);
  revalidatePath(`/${locale}/admin/courses`);
  revalidatePath(`/${locale}/admin/tasks`);
  revalidatePath(`/${locale}/admin`);
}

/* ── Course ───────────────────────────────────────────────────────────── */

export interface CreateCourseFields {
  locale: string;
  slug: string;
  defaultLocale: string;
  estimatedMinutes: number | null;
  titleDe: string;
  summaryDe: string;
  descriptionDe: string;
  titleEn: string;
  summaryEn: string;
  titleRu: string;
  summaryRu: string;
  /**
   * Course media — FEATURE_BUILD_PLAN §1.1. Optional so the existing callers
   * and tests keep compiling; blank is normalised to null so an untouched field
   * writes nothing rather than an empty string that would fail the protocol
   * CHECK constraints added in 20260728100000.
   */
  heroImageUrl?: string;
  examVideoUrl?: string;
  completionVideoUrl?: string;
}

export async function createCourseAction(
  fields: CreateCourseFields
): Promise<ActionState & { courseId?: string; versionId?: string }> {
  await requireAdmin(fields.locale);

  const blankToNull = (value: string | undefined) => {
    const trimmed = (value ?? "").trim();
    return trimmed === "" ? null : trimmed;
  };

  const localizations = [
    {
      locale: "de",
      title: fields.titleDe,
      summary: fields.summaryDe,
      descriptionHtml: fields.descriptionDe,
      // The two motivational videos (§1.1). Written on the German row only,
      // matching how every other piece of course content is authored here.
      examVideoUrl: blankToNull(fields.examVideoUrl),
      completionVideoUrl: blankToNull(fields.completionVideoUrl),
    },
  ];
  // EN and RU are optional at creation but mandatory before review, so an empty
  // row is written only when there is something to write.
  if (fields.titleEn.trim() || fields.summaryEn.trim()) {
    localizations.push({
      locale: "en",
      title: fields.titleEn,
      summary: fields.summaryEn,
      descriptionHtml: "",
      // The videos are authored on the German row only; an EN/RU row that
      // repeated the same URL would claim a translation that does not exist.
      examVideoUrl: null,
      completionVideoUrl: null,
    });
  }
  if (fields.titleRu.trim() || fields.summaryRu.trim()) {
    localizations.push({
      locale: "ru",
      title: fields.titleRu,
      summary: fields.summaryRu,
      descriptionHtml: "",
      examVideoUrl: null,
      completionVideoUrl: null,
    });
  }

  const result = await createCourse({
    slug: fields.slug,
    defaultLocale: fields.defaultLocale,
    estimatedMinutes: fields.estimatedMinutes,
    heroImageUrl: blankToNull(fields.heroImageUrl),
    localizations,
  });
  if (!result.ok) return failed(result.error);

  revalidatePath(`/${fields.locale}/admin/courses`);
  revalidatePath(`/${fields.locale}/admin`);
  return { status: "ok", courseId: result.data.courseId, versionId: result.data.versionId };
}

export async function saveCourseMetaAction(input: {
  locale: string;
  courseId: string;
  slug: string;
  defaultLocale: string;
  estimatedMinutes: number | null;
}): Promise<ActionState> {
  await requireAdmin(input.locale);
  const result = await updateCourseMeta(input);
  revalidatePath(`/${input.locale}/admin/courses/${input.courseId}`);
  revalidatePath(`/${input.locale}/admin/courses`);
  return settle(result);
}

export async function saveCourseLocalizationAction(input: {
  locale: string;
  courseId: string;
  contentLocale: string;
  title: string;
  summary: string;
  descriptionHtml: string;
}): Promise<ActionState> {
  await requireAdmin(input.locale);
  const result = await upsertCourseLocalization({
    courseId: input.courseId,
    locale: input.contentLocale,
    title: input.title,
    summary: input.summary,
    descriptionHtml: input.descriptionHtml,
  });
  revalidatePath(`/${input.locale}/admin/courses/${input.courseId}`);
  revalidatePath(`/${input.locale}/admin/courses`);
  return settle(result);
}

export async function setCourseStateAction(input: {
  locale: string;
  courseId: string;
  state: RecordState;
}): Promise<ActionState> {
  await requireAdmin(input.locale);
  const result = await setCourseState(input.courseId, input.state);
  revalidatePath(`/${input.locale}/admin/courses/${input.courseId}`);
  revalidatePath(`/${input.locale}/admin/courses`);
  return settle(result);
}

export async function createVersionAction(input: {
  locale: string;
  courseId: string;
}): Promise<ActionState & { versionId?: string }> {
  await requireAdmin(input.locale);
  const result = await createVersion(input.courseId);
  if (!result.ok) return failed(result.error);
  revalidatePath(`/${input.locale}/admin/courses/${input.courseId}`);
  return { status: "ok", versionId: result.data.versionId };
}

/* ── Stages ───────────────────────────────────────────────────────────── */

export async function addStageAction(input: {
  locale: string;
  courseId: string;
  versionId: string;
}): Promise<ActionState> {
  await requireAdmin(input.locale);
  const result = await createStage({ versionId: input.versionId, courseId: input.courseId });
  revalidateStudio(input.locale, input.courseId, input.versionId);
  return settle(result);
}

export async function saveStageAction(input: {
  locale: string;
  courseId: string;
  versionId: string;
  stageId: string;
  localizations: { locale: string; title: string; descriptionHtml: string }[];
}): Promise<ActionState> {
  await requireAdmin(input.locale);
  for (const entry of input.localizations) {
    const result = await upsertStageLocalization({
      stageId: input.stageId,
      locale: entry.locale,
      title: entry.title,
      descriptionHtml: entry.descriptionHtml,
    });
    if (!result.ok) return failed(result.error);
  }
  revalidateStudio(input.locale, input.courseId, input.versionId);
  return { status: "ok" };
}

export async function deleteStageAction(input: {
  locale: string;
  courseId: string;
  versionId: string;
  stageId: string;
  remainingOrder: string[];
}): Promise<ActionState> {
  await requireAdmin(input.locale);
  const result = await deleteStage(input.stageId);
  if (!result.ok) return failed(result.error);
  // Positions must stay contiguous from zero or the readiness assertion fails.
  const reordered = await reorderStages(input.versionId, input.remainingOrder);
  revalidateStudio(input.locale, input.courseId, input.versionId);
  return settle(reordered);
}

export async function reorderStagesAction(input: {
  locale: string;
  courseId: string;
  versionId: string;
  orderedIds: string[];
}): Promise<ActionState> {
  await requireAdmin(input.locale);
  const result = await reorderStages(input.versionId, input.orderedIds);
  revalidateStudio(input.locale, input.courseId, input.versionId);
  return settle(result);
}

/* ── Tasks ────────────────────────────────────────────────────────────── */

export async function addTaskAction(input: {
  locale: string;
  courseId: string;
  versionId: string;
  stageId: string;
}): Promise<ActionState> {
  await requireAdmin(input.locale);
  const result = await createTask({
    versionId: input.versionId,
    courseId: input.courseId,
    stageId: input.stageId,
  });
  revalidateStudio(input.locale, input.courseId, input.versionId);
  return settle(result);
}

export interface SaveTaskFields {
  locale: string;
  courseId: string;
  versionId: string;
  taskId: string;
  kind: string;
  expectedMinutes: number | null;
  targetUrl: string | null;
  /** The Arena gate — null clears it. */
  requiredHuntScenarioId: string | null;
  /**
   * The pre-task question, as a {locale: text} map, or null to remove it.
   * Written through `set_task_gate_question` rather than a direct upsert
   * because task_gate_questions is RPC-only (I-003) and the command also
   * enforces the three-locale rule the snapshot validator will apply later.
   */
  gateQuestion: Record<string, string> | null;
  localizations: { locale: string; title: string; instructionsHtml: string }[];
  hints: { translations: Record<string, string> }[];
  skills: { skillId: string; weightBasisPoints: number; evidenceRequired: boolean }[];
  assessment: {
    question: Record<string, string>;
    selectionMode: "single" | "multiple";
    options: { labels: Record<string, string>; isCorrect: boolean }[];
  } | null;
}

export async function saveTaskAction(fields: SaveTaskFields): Promise<ActionState> {
  await requireAdmin(fields.locale);

  const updated = await updateTask({
    taskId: fields.taskId,
    kind: fields.kind,
    expectedMinutes: fields.expectedMinutes,
    targetUrl: fields.targetUrl,
    requiredHuntScenarioId: fields.requiredHuntScenarioId,
    localizations: fields.localizations,
  });
  if (!updated.ok) return failed(updated.error);

  const gate = await setTaskGateQuestion(fields.taskId, fields.gateQuestion);
  if (!gate.ok) return failed(gate.error);

  const hints = await setTaskHints(fields.taskId, fields.hints);
  if (!hints.ok) return failed(hints.error);

  const skills = await setTaskSkills(fields.taskId, fields.skills);
  if (!skills.ok) return failed(skills.error);

  const assessment = await setTaskAssessment(fields.taskId, fields.assessment);
  if (!assessment.ok) return failed(assessment.error);

  revalidateStudio(fields.locale, fields.courseId, fields.versionId);
  return { status: "ok" };
}

export async function deleteTaskAction(input: {
  locale: string;
  courseId: string;
  versionId: string;
  stageId: string;
  taskId: string;
  remainingOrder: string[];
}): Promise<ActionState> {
  await requireAdmin(input.locale);
  const result = await deleteTask(input.taskId);
  if (!result.ok) return failed(result.error);
  const reordered = await reorderTasks(input.stageId, input.remainingOrder);
  revalidateStudio(input.locale, input.courseId, input.versionId);
  return settle(reordered);
}

export async function reorderTasksAction(input: {
  locale: string;
  courseId: string;
  versionId: string;
  stageId: string;
  orderedIds: string[];
}): Promise<ActionState> {
  await requireAdmin(input.locale);
  const result = await reorderTasks(input.stageId, input.orderedIds);
  revalidateStudio(input.locale, input.courseId, input.versionId);
  return settle(result);
}

/* ── Lifecycle ────────────────────────────────────────────────────────── */

export async function submitForReviewAction(input: {
  locale: string;
  courseId: string;
  versionId: string;
}): Promise<ActionState> {
  await requireAdmin(input.locale);
  const result = await submitForReview(input.versionId);
  revalidateStudio(input.locale, input.courseId, input.versionId);
  return settle(result);
}

export async function decideReviewAction(input: {
  locale: string;
  courseId: string;
  versionId: string;
  decision: "approved" | "changes_requested";
  comment: string;
}): Promise<ActionState> {
  await requireAdmin(input.locale);
  if (!input.comment.trim()) {
    return { status: "error", message: "Ein Kommentar ist für die Entscheidung erforderlich." };
  }
  const result = await decideReview(input.versionId, input.decision, input.comment);
  revalidateStudio(input.locale, input.courseId, input.versionId);
  return settle(result);
}

export async function publishVersionAction(input: {
  locale: string;
  courseId: string;
  versionId: string;
}): Promise<ActionState> {
  await requireAdmin(input.locale);
  const result = await publishVersion(input.versionId);
  revalidateStudio(input.locale, input.courseId, input.versionId);
  return settle(result);
}

export async function loadArchiveImpactAction(input: {
  locale: string;
  versionId: string;
}): Promise<ActionState & { impact?: ArchiveImpact }> {
  await requireAdmin(input.locale);
  const result = await loadArchiveImpact(input.versionId);
  if (!result.ok) return failed(result.error);
  return { status: "ok", impact: result.data };
}

export async function archiveVersionAction(input: {
  locale: string;
  courseId: string;
  versionId: string;
  reason: string;
  impactFingerprint: string;
}): Promise<ActionState> {
  await requireAdmin(input.locale);
  if (!input.reason.trim()) {
    return { status: "error", message: "Eine Begründung ist erforderlich." };
  }
  const result = await archiveVersion(input.versionId, input.reason, input.impactFingerprint);
  revalidateStudio(input.locale, input.courseId, input.versionId);
  return settle(result);
}
