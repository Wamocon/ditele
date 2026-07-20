"use server";

import { randomUUID } from "node:crypto";

import type { PostgrestError } from "@supabase/supabase-js";
import type { Route } from "next";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { getPrincipal } from "@/app/[locale]/_data/principal";
import { learnerProfileCopy } from "@/features/identity/profile-copy";
import {
  parseUpdateProfileForm,
  type ProfileActionState,
} from "@/features/identity/profile-model";
import { hasPermission, hasRole } from "@/shared/auth/authorization";
import { AuthenticationRequiredError } from "@/shared/auth/errors";
import { createServerClient } from "@/shared/database/server";
import { isLocale, locales, type Locale } from "@/shared/i18n/config";

const freshProfileSchema = z.object({
  user_id: z.string().uuid(),
  row_version: z.number().int().positive(),
});

function actionState(
  status: ProfileActionState["status"],
  message: string,
  fieldErrors?: ProfileActionState["fieldErrors"],
): ProfileActionState {
  return { status, message, ...(fieldErrors ? { fieldErrors } : {}) };
}

function validationFailure(
  locale: Locale,
  error: unknown,
): ProfileActionState {
  const labels = learnerProfileCopy[locale];
  if (!(error instanceof z.ZodError)) {
    return actionState("error", labels.invalidInput);
  }
  const fieldErrors: {
    displayName?: string;
    locale?: string;
    timezone?: string;
  } = {};
  for (const issue of error.issues) {
    const field = issue.path[0];
    if (field === "displayName") {
      fieldErrors.displayName = labels.invalidDisplayName;
    } else if (field === "locale") {
      fieldErrors.locale = labels.invalidLocale;
    } else if (field === "timezone") {
      fieldErrors.timezone = labels.invalidTimezone;
    }
  }
  return actionState("error", labels.invalidInput, fieldErrors);
}

function rpcFailure(
  locale: Locale,
  error: PostgrestError,
): ProfileActionState {
  const labels = learnerProfileCopy[locale];
  if (error.code === "40001") {
    return actionState("conflict", labels.conflict);
  }
  if (error.code === "42501") return actionState("error", labels.forbidden);
  if (error.code === "22023" || error.code === "23514") {
    return actionState("error", labels.invalidInput);
  }
  return actionState("error", labels.failed);
}

export async function updateLearnerProfileAction(
  localeValue: string,
  previousState: ProfileActionState,
  formData: FormData,
): Promise<ProfileActionState> {
  void previousState;
  const routeLocale = isLocale(localeValue) ? localeValue : "en";
  let input: ReturnType<typeof parseUpdateProfileForm>;
  try {
    input = parseUpdateProfileForm(formData);
  } catch (error) {
    return validationFailure(routeLocale, error);
  }

  let principal;
  try {
    principal = await getPrincipal();
  } catch (error) {
    return actionState(
      "error",
      error instanceof AuthenticationRequiredError
        ? learnerProfileCopy[routeLocale].sessionExpired
        : learnerProfileCopy[routeLocale].failed,
    );
  }
  if (
    !hasRole(principal, "learner")
    || !hasPermission(principal, "profile.update_self")
  ) {
    return actionState("error", learnerProfileCopy[routeLocale].forbidden);
  }

  const client = await createServerClient();
  const { data: freshData, error: freshError } = await client
    .from("profiles")
    .select("user_id, row_version")
    .eq("user_id", principal.userId)
    .maybeSingle();
  if (freshError) {
    return actionState("error", learnerProfileCopy[routeLocale].failed);
  }
  const fresh = freshProfileSchema.safeParse(freshData);
  if (!fresh.success || fresh.data.user_id !== principal.userId) {
    return actionState("error", learnerProfileCopy[routeLocale].forbidden);
  }
  const { error } = await client.rpc("update_own_profile", {
    p_correlation_id: randomUUID(),
    p_display_name: input.displayName,
    p_expected_version: input.expectedVersion,
    p_idempotency_key: input.idempotencyKey,
    p_locale: input.locale,
    p_timezone: input.timezone,
  });
  if (error) return rpcFailure(routeLocale, error);

  for (const locale of locales) {
    revalidatePath(`/${locale}/learn/profile`);
  }
  redirect(`/${input.locale}/learn/profile?notice=saved` as Route);
}
