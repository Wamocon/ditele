"use server";

import { randomUUID } from "node:crypto";

import type { Route } from "next";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { getPrincipal } from "@/app/[locale]/_data/principal";
import { questionWorkflowCopy } from "@/features/mentoring/question-workflow-copy";
import {
  parseAnswerQuestionForm,
  parseClaimQuestionForm,
  parseTransferQuestionForm,
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

function redirectQuestionConflict(locale: Locale, questionId: string): never {
  redirect(
    `/${locale}/trainer/questions/${questionId}?notice=stale` as Route,
  );
}

function redirectQuestionClaimed(locale: Locale, questionId: string): never {
  redirect(
    `/${locale}/trainer/questions/${questionId}?notice=claimed` as Route,
  );
}

function canManageQuestion(
  roles: readonly string[],
  permissions: readonly string[],
): boolean {
  return (
    roles.includes("trainer") &&
    permissions.includes("question.manage")
  );
}

function validationState(
  locale: Locale,
  error: z.ZodError,
): QuestionActionState {
  const copy = questionWorkflowCopy[locale].trainer;
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) {
    const field = issue.path[0];
    if (field === "body" || field === "reason" || field === "toTrainerId") {
      fieldErrors[field] = copy.invalidInput;
    }
  }
  return state("error", copy.invalidInput, fieldErrors);
}

async function principalForAction(locale: Locale): Promise<
  | { ok: true; principal: Awaited<ReturnType<typeof getPrincipal>> }
  | { ok: false; actionState: QuestionActionState }
> {
  const copy = questionWorkflowCopy[locale].trainer;
  try {
    const principal = await getPrincipal();
    if (!canManageQuestion(principal.roles, principal.permissions)) {
      return { ok: false, actionState: state("error", copy.forbidden) };
    }
    return { ok: true, principal };
  } catch (error) {
    return {
      ok: false,
      actionState: state(
        "error",
        error instanceof AuthenticationRequiredError
          ? copy.sessionExpired
          : copy.failed,
      ),
    };
  }
}

async function ownedQuestion(
  client: Awaited<ReturnType<typeof createServerClient>>,
  questionId: string,
  trainerId: string,
) {
  const { data, error } = await client
    .from("questions")
    .select("id, assigned_trainer_id, state, row_version, cohort_id, task_id")
    .eq("id", questionId)
    .maybeSingle();
  if (error) throw new Error("questions.action_read_failed", { cause: error });
  if (
    !data ||
    data.assigned_trainer_id !== trainerId ||
    (data.state !== "assigned" && data.state !== "transferred")
  ) {
    return null;
  }
  return data;
}

export async function claimQuestionAction(
  localeValue: string,
  previousState: QuestionActionState,
  formData: FormData,
): Promise<QuestionActionState> {
  void previousState;
  const locale = localeOrEnglish(localeValue);
  const copy = questionWorkflowCopy[locale].trainer;
  let input: ReturnType<typeof parseClaimQuestionForm>;
  try {
    input = parseClaimQuestionForm(formData);
  } catch (error) {
    return error instanceof z.ZodError
      ? validationState(locale, error)
      : state("error", copy.invalidInput);
  }

  const principalResult = await principalForAction(locale);
  if (!principalResult.ok) return principalResult.actionState;
  const client = await createServerClient();
  const { data: question, error: readError } = await client
    .from("questions")
    .select("id, cohort_id, state, row_version")
    .eq("id", input.questionId)
    .maybeSingle();
  if (readError) return state("error", copy.failed);
  if (
    !question ||
    !principalResult.principal.cohortIds.includes(question.cohort_id)
  ) {
    return state("error", copy.forbidden);
  }
  if (
    question.row_version !== input.expectedVersion ||
    question.state !== "open"
  ) {
    redirectQuestionConflict(locale, input.questionId);
  }

  const { error } = await client.rpc("claim_question", {
    p_correlation_id: randomUUID(),
    p_expected_version: input.expectedVersion,
    p_idempotency_key: input.idempotencyKey,
    p_question_id: input.questionId,
  });
  if (error) {
    if (error.code === "40001") {
      redirectQuestionConflict(locale, input.questionId);
    }
    if (error.code === "42501") return state("error", copy.forbidden);
    if (error.code === "22023") return state("error", copy.invalidInput);
    return state("error", copy.failed);
  }

  revalidatePath(`/${locale}/trainer/questions`);
  revalidatePath(`/${locale}/trainer/questions/${input.questionId}`);
  revalidatePath(`/${locale}/learn/questions/${input.questionId}`);
  redirectQuestionClaimed(locale, input.questionId);
}

export async function answerQuestionAction(
  localeValue: string,
  previousState: QuestionActionState,
  formData: FormData,
): Promise<QuestionActionState> {
  void previousState;
  const locale = localeOrEnglish(localeValue);
  const copy = questionWorkflowCopy[locale].trainer;
  let input: ReturnType<typeof parseAnswerQuestionForm>;
  try {
    input = parseAnswerQuestionForm(formData);
  } catch (error) {
    return error instanceof z.ZodError
      ? validationState(locale, error)
      : state("error", copy.invalidInput);
  }

  const principalResult = await principalForAction(locale);
  if (!principalResult.ok) return principalResult.actionState;
  const client = await createServerClient();
  let question;
  try {
    question = await ownedQuestion(
      client,
      input.questionId,
      principalResult.principal.userId,
    );
  } catch {
    return state("error", copy.failed);
  }
  if (!question) return state("error", copy.forbidden);
  if (question.row_version !== input.expectedVersion) {
    redirectQuestionConflict(locale, input.questionId);
  }

  const { error } = await client.rpc("answer_question", {
    p_body: input.body,
    p_correlation_id: randomUUID(),
    p_expected_version: input.expectedVersion,
    p_idempotency_key: input.idempotencyKey,
    p_question_id: input.questionId,
  });
  if (error) {
    if (error.code === "40001") {
      redirectQuestionConflict(locale, input.questionId);
    }
    if (error.code === "42501") return state("error", copy.forbidden);
    if (error.code === "22023") return state("error", copy.invalidInput);
    return state("error", copy.failed);
  }

  revalidatePath(`/${locale}/trainer/questions`);
  revalidatePath(`/${locale}/trainer/questions/archive`);
  revalidatePath(`/${locale}/trainer/questions/${input.questionId}`);
  revalidatePath(`/${locale}/learn/questions/${input.questionId}`);
  revalidatePath(`/${locale}/learn/tasks/${question.task_id}`);
  redirect(`/${locale}/trainer/questions/archive` as Route);
}

export async function transferQuestionAction(
  localeValue: string,
  previousState: QuestionActionState,
  formData: FormData,
): Promise<QuestionActionState> {
  void previousState;
  const locale = localeOrEnglish(localeValue);
  const copy = questionWorkflowCopy[locale].trainer;
  let input: ReturnType<typeof parseTransferQuestionForm>;
  try {
    input = parseTransferQuestionForm(formData);
  } catch (error) {
    return error instanceof z.ZodError
      ? validationState(locale, error)
      : state("error", copy.invalidInput);
  }

  const principalResult = await principalForAction(locale);
  if (!principalResult.ok) return principalResult.actionState;
  if (input.toTrainerId === principalResult.principal.userId) {
    return state("error", copy.invalidTarget);
  }
  const client = await createServerClient();
  let question;
  try {
    question = await ownedQuestion(
      client,
      input.questionId,
      principalResult.principal.userId,
    );
  } catch {
    return state("error", copy.failed);
  }
  if (!question) return state("error", copy.forbidden);
  if (question.row_version !== input.expectedVersion) {
    redirectQuestionConflict(locale, input.questionId);
  }

  const { error } = await client.rpc("transfer_question", {
    p_correlation_id: randomUUID(),
    p_expected_version: input.expectedVersion,
    p_idempotency_key: input.idempotencyKey,
    p_question_id: input.questionId,
    p_reason: input.reason,
    p_to_trainer_id: input.toTrainerId,
  });
  if (error) {
    if (error.code === "40001") {
      redirectQuestionConflict(locale, input.questionId);
    }
    if (error.code === "42501") return state("error", copy.forbidden);
    if (error.code === "23514") return state("error", copy.invalidTarget);
    if (error.code === "22023") return state("error", copy.invalidInput);
    return state("error", copy.failed);
  }

  revalidatePath(`/${locale}/trainer/questions`);
  revalidatePath(`/${locale}/trainer/questions/${input.questionId}`);
  revalidatePath(`/${locale}/learn/questions/${input.questionId}`);
  redirect(`/${locale}/trainer/questions` as Route);
}
