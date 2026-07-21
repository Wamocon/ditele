"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/shared/auth/guard";
import type { Result } from "@/shared/data/result";
import {
  decideSubmission,
  transferSubmission,
  claimQuestion,
  answerQuestion,
  transferQuestion,
  archiveQuestion,
  updateTrainerProfile,
  type CriterionScore,
} from "@/shared/data/review";

/**
 * Every action re-checks the role. A route-group layout guard does not protect
 * a POST (00_MASTER_PLAN §9.3), and the database is still the real boundary —
 * these calls all go through SECURITY DEFINER RPCs that check permissions again.
 */
async function guard(locale: string) {
  await requireRole(["trainer", "admin"], locale);
}

export async function decideSubmissionAction(input: {
  locale: string;
  submissionId: string;
  submissionVersionId: string;
  expectedVersion: number;
  decision: "accepted" | "revision_required";
  comment: string;
  scores: CriterionScore[];
}): Promise<Result<{ state: string }>> {
  await guard(input.locale);
  const result = await decideSubmission(input);
  if (result.ok) {
    revalidatePath(`/${input.locale}/trainer/submissions/${input.submissionId}`);
    revalidatePath(`/${input.locale}/trainer/submissions`);
    revalidatePath(`/${input.locale}/trainer`);
  }
  return result;
}

export async function transferSubmissionAction(input: {
  locale: string;
  submissionId: string;
  expectedVersion: number;
  toTrainerId: string;
  reason: string;
}): Promise<Result<{ state: string }>> {
  await guard(input.locale);
  const result = await transferSubmission(input);
  if (result.ok) {
    revalidatePath(`/${input.locale}/trainer/submissions/${input.submissionId}`);
    revalidatePath(`/${input.locale}/trainer/submissions`);
    revalidatePath(`/${input.locale}/trainer`);
  }
  return result;
}

export async function claimQuestionAction(input: {
  locale: string;
  questionId: string;
  expectedVersion: number;
}): Promise<Result<null>> {
  await guard(input.locale);
  const result = await claimQuestion(input);
  if (result.ok) revalidateQuestions(input.locale, input.questionId);
  return result;
}

export async function answerQuestionAction(input: {
  locale: string;
  questionId: string;
  expectedVersion: number;
  body: string;
}): Promise<Result<null>> {
  await guard(input.locale);
  const result = await answerQuestion(input);
  if (result.ok) revalidateQuestions(input.locale, input.questionId);
  return result;
}

export async function transferQuestionAction(input: {
  locale: string;
  questionId: string;
  expectedVersion: number;
  toTrainerId: string;
  reason: string;
}): Promise<Result<null>> {
  await guard(input.locale);
  const result = await transferQuestion(input);
  if (result.ok) revalidateQuestions(input.locale, input.questionId);
  return result;
}

export async function archiveQuestionAction(input: {
  locale: string;
  questionId: string;
  expectedVersion: number;
}): Promise<Result<null>> {
  await guard(input.locale);
  const result = await archiveQuestion(input);
  if (result.ok) {
    revalidateQuestions(input.locale, input.questionId);
    revalidatePath(`/${input.locale}/trainer/questions/archive`);
  }
  return result;
}

export async function updateTrainerProfileAction(input: {
  locale: string;
  displayName: string;
  profileLocale: string;
  timezone: string;
  expectedVersion: number;
}): Promise<Result<null>> {
  await guard(input.locale);
  const result = await updateTrainerProfile({
    displayName: input.displayName,
    locale: input.profileLocale,
    timezone: input.timezone,
    expectedVersion: input.expectedVersion,
  });
  if (result.ok) revalidatePath(`/${input.locale}/trainer/profile`);
  return result;
}

function revalidateQuestions(locale: string, questionId: string) {
  revalidatePath(`/${locale}/trainer/questions/${questionId}`);
  revalidatePath(`/${locale}/trainer/questions`);
  revalidatePath(`/${locale}/trainer`);
}
