"use server";

import { randomUUID } from "node:crypto";

import type { Route } from "next";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getPrincipal } from "@/app/[locale]/_data/principal";
import { AuthenticationRequiredError } from "@/shared/auth/errors";
import { createServerClient } from "@/shared/database/server";
import { isLocale, type Locale } from "@/shared/i18n/config";

import { reviewDetailCopy } from "./copy";
import {
  parseReviewDecisionForm,
  parseSubmissionTransferForm,
} from "./validation";

export type ReviewActionState = {
  readonly status: "idle" | "error" | "conflict";
  readonly message: string;
};

function messageState(
  status: ReviewActionState["status"],
  message: string,
): ReviewActionState {
  return { status, message };
}

function localeOrEnglish(value: string): Locale {
  return isLocale(value) ? value : "en";
}

function isReviewRole(roles: readonly string[]): boolean {
  return roles.some((role) => role === "trainer" || role === "admin");
}

function redirectToStaleSubmission(locale: Locale, submissionId: string): never {
  redirect(
    `/${locale}/trainer/submissions/${submissionId}?notice=stale` as Route,
  );
}

export async function decideSubmissionAction(
  localeValue: string,
  previousState: ReviewActionState,
  formData: FormData,
): Promise<ReviewActionState> {
  void previousState;
  const locale = localeOrEnglish(localeValue);
  const copy = reviewDetailCopy[locale];
  let input: ReturnType<typeof parseReviewDecisionForm>;
  try {
    input = parseReviewDecisionForm(formData);
  } catch {
    return messageState("error", copy.invalidInput);
  }

  let principal;
  try {
    principal = await getPrincipal();
  } catch (error) {
    if (error instanceof AuthenticationRequiredError) {
      return messageState("error", copy.sessionExpired);
    }
    return messageState("error", copy.failed);
  }
  if (
    !isReviewRole(principal.roles) ||
    !principal.permissions.some((permission) =>
      permission === "review.manage" || permission === "cohort.manage"
    )
  ) {
    return messageState("error", copy.forbidden);
  }

  const client = await createServerClient();
  const { data: submission, error: submissionError } = await client
    .from("submissions")
    .select("id, task_id, cohort_id, row_version, state, latest_version_number")
    .eq("id", input.submissionId)
    .maybeSingle();
  if (submissionError) return messageState("error", copy.failed);
  if (!submission) return messageState("error", copy.forbidden);

  const hasResourceScope =
    principal.cohortIds.includes(submission.cohort_id) ||
    principal.permissions.includes("cohort.manage");
  if (!hasResourceScope) return messageState("error", copy.forbidden);
  const { data: version, error: versionError } = await client
    .from("submission_versions")
    .select("id")
    .eq("submission_id", submission.id)
    .eq("version_number", submission.latest_version_number)
    .maybeSingle();
  if (versionError) return messageState("error", copy.failed);
  if (!version) redirectToStaleSubmission(locale, submission.id);

  const idempotencyKey =
    `review:${submission.id}:${input.expectedVersion}:${principal.userId}`;
  const { error: decisionError } = await client.rpc("decide_submission", {
    p_comment: input.comment,
    p_correlation_id: randomUUID(),
    p_criterion_scores: input.criterionScores.map((score) => ({
      criterion_id: score.criterion_id,
      points: score.points,
    })),
    p_decision: input.decision,
    p_expected_version: input.expectedVersion,
    p_idempotency_key: idempotencyKey,
    p_submission_id: submission.id,
    p_submission_version_id: version.id,
  });
  if (decisionError) {
    if (decisionError.code === "40001") {
      redirectToStaleSubmission(locale, submission.id);
    }
    if (decisionError.code === "42501") {
      return messageState("error", copy.forbidden);
    }
    if (decisionError.code === "22023") {
      if (decisionError.message.includes("idempotency key")) {
        redirectToStaleSubmission(locale, submission.id);
      }
      return messageState("error", copy.invalidRubric);
    }
    return messageState("error", copy.failed);
  }

  revalidatePath(`/${locale}/trainer`);
  revalidatePath(`/${locale}/trainer/submissions`);
  revalidatePath(`/${locale}/trainer/submissions/${submission.id}`);
  revalidatePath(`/${locale}/learn/tasks/${submission.task_id}`);
  redirect(`/${locale}/trainer/submissions` as Route);
}

export async function transferSubmissionAction(
  localeValue: string,
  previousState: ReviewActionState,
  formData: FormData,
): Promise<ReviewActionState> {
  void previousState;
  const locale = localeOrEnglish(localeValue);
  const copy = reviewDetailCopy[locale];
  let input: ReturnType<typeof parseSubmissionTransferForm>;
  try {
    input = parseSubmissionTransferForm(formData);
  } catch {
    return messageState("error", copy.invalidInput);
  }

  let principal;
  try {
    principal = await getPrincipal();
    if (
      !isReviewRole(principal.roles) ||
      !principal.permissions.some((permission) =>
        permission === "review.manage" || permission === "cohort.manage"
      )
    ) {
      return messageState("error", copy.forbidden);
    }
  } catch (error) {
    if (error instanceof AuthenticationRequiredError) {
      return messageState("error", copy.sessionExpired);
    }
    return messageState("error", copy.transferFailed);
  }

  if (input.toTrainerId === principal.userId) {
    return messageState("error", copy.invalidTransferTarget);
  }

  const client = await createServerClient();
  const { data: submission, error: readError } = await client
    .from("submissions")
    .select("id, task_id, cohort_id, row_version, state")
    .eq("id", input.submissionId)
    .maybeSingle();
  if (readError) return messageState("error", copy.transferFailed);
  if (!submission) return messageState("error", copy.forbidden);

  const hasResourceScope =
    principal.cohortIds.includes(submission.cohort_id) ||
    principal.permissions.includes("cohort.manage");
  if (!hasResourceScope) return messageState("error", copy.forbidden);
  if (
    submission.row_version !== input.expectedVersion ||
    (submission.state !== "submitted" && submission.state !== "resubmitted")
  ) {
    redirectToStaleSubmission(locale, submission.id);
  }

  const { error: transferError } = await client.rpc("transfer_submission", {
    p_correlation_id: randomUUID(),
    p_expected_version: input.expectedVersion,
    p_idempotency_key: input.idempotencyKey,
    p_reason: input.reason,
    p_submission_id: input.submissionId,
    p_to_trainer_id: input.toTrainerId,
  });
  if (transferError) {
    if (transferError.code === "40001") {
      redirectToStaleSubmission(locale, submission.id);
    }
    if (transferError.code === "42501") {
      return messageState("error", copy.forbidden);
    }
    if (transferError.code === "23514") {
      return messageState("error", copy.invalidTransferTarget);
    }
    if (transferError.code === "22023") {
      return messageState("error", copy.invalidInput);
    }
    return messageState("error", copy.transferFailed);
  }

  revalidatePath(`/${locale}/trainer`);
  revalidatePath(`/${locale}/trainer/submissions`);
  revalidatePath(`/${locale}/trainer/submissions/${submission.id}`);
  redirect(`/${locale}/trainer/submissions` as Route);
}
