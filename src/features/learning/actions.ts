"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/shared/auth/guard";
import {
  saveAttemptDraft,
  startAttempt,
  submitAttempt,
  type DefectReport,
  type SavedDraft,
  type StartedAttempt,
  type SubmittedAttempt,
} from "@/shared/data/learning";
import type { Result } from "@/shared/data/result";

/**
 * Every action re-checks the role. A layout guard does not protect a POST
 * (MASTER_PLAN §9.3) — and the database is still the real boundary underneath:
 * the learning RPCs are ownership-scoped, so a forged attempt id is refused
 * there even if this check were bypassed.
 *
 * Only a student mutates. Trainers and admins reach the workspace read-only.
 */
async function requireStudent(locale: string) {
  await requireRole(["student"], locale);
}

export async function startAttemptAction(input: {
  locale: string;
  taskId: string;
  enrollmentId: string;
}): Promise<Result<StartedAttempt>> {
  await requireStudent(input.locale);
  const result = await startAttempt({
    locale: input.locale,
    taskId: input.taskId,
    enrollmentId: input.enrollmentId,
  });
  if (result.ok) revalidatePath(`/${input.locale}/learn/tasks/${input.taskId}`);
  return result;
}

export async function saveDraftAction(input: {
  locale: string;
  attemptId: string;
  answerText: string;
  selectedOptionIds: string[];
  usedHintIds: string[];
  defect: DefectReport | null;
  elapsedSeconds: number;
  expectedDraftVersion: number;
}): Promise<Result<SavedDraft>> {
  await requireStudent(input.locale);
  // No revalidatePath here: autosave fires every 20s and re-rendering the whole
  // route under the user's cursor would be worse than useless.
  return saveAttemptDraft({
    locale: input.locale,
    attemptId: input.attemptId,
    answerText: input.answerText,
    selectedOptionIds: input.selectedOptionIds,
    usedHintIds: input.usedHintIds,
    defect: input.defect,
    elapsedSeconds: input.elapsedSeconds,
    expectedDraftVersion: input.expectedDraftVersion,
  });
}

export async function submitAttemptAction(input: {
  locale: string;
  taskId: string;
  attemptId: string;
  answerText: string;
  selectedOptionIds: string[];
  expectedVersion: number;
  evidence: { title: string; sourceUri: string } | null;
}): Promise<Result<SubmittedAttempt>> {
  await requireStudent(input.locale);
  const result = await submitAttempt({
    locale: input.locale,
    attemptId: input.attemptId,
    answerText: input.answerText,
    selectedOptionIds: input.selectedOptionIds,
    expectedVersion: input.expectedVersion,
    evidence: input.evidence,
  });
  if (result.ok) {
    revalidatePath(`/${input.locale}/learn/tasks/${input.taskId}`);
    revalidatePath(`/${input.locale}/learn`);
  }
  return result;
}
