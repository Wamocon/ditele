"use server";

import { randomUUID } from "node:crypto";

import type { PostgrestError } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";

import { getPrincipal } from "@/app/[locale]/_data/principal";
import { hasRole } from "@/shared/auth/authorization";
import { AuthenticationRequiredError } from "@/shared/auth/errors";
import { createServerClient } from "@/shared/database/server";
import { isLocale, type Locale } from "@/shared/i18n/config";

import { ratingCopy } from "./rating-copy";
import {
  parseRatingForm,
  type RatingActionState,
  type RatingFormInput,
} from "./rating-model";

function rpcFailure(locale: Locale, error: PostgrestError): RatingActionState {
  const labels = ratingCopy[locale];
  if (error.code === "40001") return { status: "conflict", message: labels.conflict };
  if (error.code === "42501") return { status: "error", message: labels.forbidden };
  if (error.code === "22023" || error.code === "23514") {
    return { status: "error", message: labels.invalidInput };
  }
  return { status: "error", message: labels.failed };
}

export async function submitRatingAction(
  previousState: RatingActionState,
  formData: FormData,
): Promise<RatingActionState> {
  void previousState;
  const rawLocale = formData.get("locale");
  const fallbackLocale: Locale =
    typeof rawLocale === "string" && isLocale(rawLocale) ? rawLocale : "en";

  let input: RatingFormInput;
  try {
    input = parseRatingForm(formData);
  } catch {
    return { status: "error", message: ratingCopy[fallbackLocale].invalidInput };
  }

  let principal;
  try {
    principal = await getPrincipal();
  } catch (error) {
    return {
      status: "error",
      message:
        error instanceof AuthenticationRequiredError
          ? ratingCopy[input.locale].sessionExpired
          : ratingCopy[input.locale].failed,
    };
  }
  if (!hasRole(principal, "learner")) {
    return { status: "error", message: ratingCopy[input.locale].forbidden };
  }

  const client = await createServerClient();
  const { error } =
    input.ratingTarget === "course"
      ? await client.rpc("rate_course", {
          p_course_id: input.targetId,
          p_score: input.score,
          p_comment: input.comment,
          p_expected_version: input.expectedVersion,
          p_idempotency_key: input.idempotencyKey,
          p_correlation_id: randomUUID(),
        })
      : await client.rpc("rate_task", {
          p_task_id: input.targetId,
          p_score: input.score,
          p_comment: input.comment,
          p_expected_version: input.expectedVersion,
          p_idempotency_key: input.idempotencyKey,
          p_correlation_id: randomUUID(),
        });
  if (error) return rpcFailure(input.locale, error);

  const path =
    input.ratingTarget === "course"
      ? `/${input.locale}/learn/courses/${input.targetId}`
      : `/${input.locale}/learn/tasks/${input.targetId}`;
  revalidatePath(path);
  return { status: "success", message: ratingCopy[input.locale].saved };
}
