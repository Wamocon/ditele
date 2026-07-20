"use server";

import { randomUUID } from "node:crypto";

import type { Route } from "next";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { getPrincipal } from "@/app/[locale]/_data/principal";
import { questionWorkflowCopy } from "@/features/mentoring/question-workflow-copy";
import {
  parseArchiveQuestionForm,
  parseCreateQuestionForm,
  type QuestionActionState,
} from "@/features/mentoring/question-workflow-validation";
import { AuthenticationRequiredError } from "@/shared/auth/errors";
import { createServerClient } from "@/shared/database/server";
import { isLocale, type Locale } from "@/shared/i18n/config";

function localeOrEnglish(value: string): Locale {
  return isLocale(value) ? value : "en";
}

function state(
  status: QuestionActionState["status"],
  message: string,
  fieldErrors?: Readonly<Record<string, string>>,
): QuestionActionState {
  return { status, message, ...(fieldErrors ? { fieldErrors } : {}) };
}

function createValidationState(
  locale: Locale,
  error: z.ZodError,
): QuestionActionState {
  const copy = questionWorkflowCopy[locale].learner;
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) {
    const field = issue.path[0];
    if (field === "cohortId" || field === "taskId") {
      fieldErrors.context = copy.invalidInput;
    } else if (field === "subject" || field === "body") {
      fieldErrors[field] = copy.invalidInput;
    }
  }
  return state("error", copy.invalidInput, fieldErrors);
}

export async function createQuestionAction(
  localeValue: string,
  previousState: QuestionActionState,
  formData: FormData,
): Promise<QuestionActionState> {
  void previousState;
  const locale = localeOrEnglish(localeValue);
  const copy = questionWorkflowCopy[locale].learner;
  let input: ReturnType<typeof parseCreateQuestionForm>;
  try {
    input = parseCreateQuestionForm(formData);
  } catch (error) {
    return error instanceof z.ZodError
      ? createValidationState(locale, error)
      : state("error", copy.invalidInput);
  }

  let principal;
  try {
    principal = await getPrincipal();
  } catch (error) {
    return state(
      "error",
      error instanceof AuthenticationRequiredError
        ? copy.sessionExpired
        : copy.createFailed,
    );
  }
  if (!principal.roles.includes("learner")) {
    return state("error", copy.forbidden);
  }

  const client = await createServerClient();
  const { data, error } = await client.rpc("create_question", {
    p_body: input.body,
    p_cohort_id: input.cohortId,
    p_correlation_id: randomUUID(),
    p_idempotency_key: input.idempotencyKey,
    p_subject: input.subject,
    p_task_id: input.taskId,
  });
  if (error || !data) {
    if (error?.code === "42501") return state("error", copy.forbidden);
    if (error?.code === "22023" || error?.code === "23514") {
      return state("error", copy.invalidInput);
    }
    return state("error", copy.createFailed);
  }

  revalidatePath(`/${locale}/learn/questions`);
  revalidatePath(`/${locale}/learn/tasks/${input.taskId}`);
  redirect(`/${locale}/learn/questions/${data.id}` as Route);
}

export async function archiveQuestionAction(
  localeValue: string,
  previousState: QuestionActionState,
  formData: FormData,
): Promise<QuestionActionState> {
  void previousState;
  const locale = localeOrEnglish(localeValue);
  const copy = questionWorkflowCopy[locale].learner;
  let input: ReturnType<typeof parseArchiveQuestionForm>;
  try {
    input = parseArchiveQuestionForm(formData);
  } catch {
    return state("error", copy.invalidInput);
  }

  let principal;
  try {
    principal = await getPrincipal();
  } catch (error) {
    return state(
      "error",
      error instanceof AuthenticationRequiredError
        ? copy.sessionExpired
        : copy.archiveFailed,
    );
  }
  if (!principal.roles.includes("learner")) return state("error", copy.forbidden);

  const client = await createServerClient();
  const { data: question, error: questionError } = await client
    .from("questions")
    .select("id, learner_id, task_id")
    .eq("id", input.questionId)
    .eq("learner_id", principal.userId)
    .maybeSingle();
  if (questionError) return state("error", copy.archiveFailed);
  if (!question) return state("error", copy.forbidden);

  const { error } = await client.rpc("archive_question", {
    p_correlation_id: randomUUID(),
    p_expected_version: input.expectedVersion,
    p_question_id: input.questionId,
  });
  if (error) {
    if (error.code === "40001") return state("conflict", copy.archiveConflict);
    if (error.code === "42501") return state("error", copy.forbidden);
    return state("error", copy.archiveFailed);
  }

  revalidatePath(`/${locale}/learn/questions`);
  revalidatePath(`/${locale}/learn/questions/${input.questionId}`);
  revalidatePath(`/${locale}/learn/tasks/${question.task_id}`);
  redirect(`/${locale}/learn/questions` as Route);
}

