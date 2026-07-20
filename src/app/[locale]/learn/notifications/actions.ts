"use server";

import { randomUUID } from "node:crypto";

import type { PostgrestError } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getPrincipal } from "@/app/[locale]/_data/principal";
import { learnerNotificationCopy } from "@/features/notifications/learner-copy";
import {
  learnerNotificationChannels,
  parseMarkAllNotificationsReadForm,
  parseMarkNotificationReadForm,
  parseSetNotificationPreferenceForm,
  type LearnerNotificationActionState,
} from "@/features/notifications/learner-model";
import { hasRole } from "@/shared/auth/authorization";
import { AuthenticationRequiredError } from "@/shared/auth/errors";
import { createServerClient } from "@/shared/database/server";
import { isLocale, type Locale } from "@/shared/i18n/config";

const freshNotificationSchema = z.object({
  id: z.string().uuid(),
  recipient_id: z.string().uuid(),
  row_version: z.number().int().positive(),
  read_at: z.string().nullable(),
  cancelled_at: z.string().nullable(),
  state: z.enum(["pending", "delivered", "read", "failed", "cancelled"]),
});
const freshPreferenceSchema = z.object({
  channel: z.enum(learnerNotificationChannels),
  row_version: z.number().int().positive(),
});

function state(
  status: LearnerNotificationActionState["status"],
  message: string,
): LearnerNotificationActionState {
  return { status, message };
}

function localeOrEnglish(value: string): Locale {
  return isLocale(value) ? value : "en";
}

function rpcFailure(
  locale: Locale,
  error: PostgrestError,
): LearnerNotificationActionState {
  const labels = learnerNotificationCopy[locale];
  if (error.code === "40001") return state("conflict", labels.conflict);
  if (error.code === "42501") return state("error", labels.forbidden);
  if (error.code === "22023" || error.code === "23514") {
    return state("error", labels.invalidInput);
  }
  return state("error", labels.failed);
}

async function readLearnerPrincipal(locale: Locale) {
  try {
    const principal = await getPrincipal();
    if (!hasRole(principal, "learner")) {
      return { ok: false as const, state: state("error", learnerNotificationCopy[locale].forbidden) };
    }
    return { ok: true as const, principal };
  } catch (error) {
    return {
      ok: false as const,
      state: state(
        "error",
        error instanceof AuthenticationRequiredError
          ? learnerNotificationCopy[locale].sessionExpired
          : learnerNotificationCopy[locale].failed,
      ),
    };
  }
}

export async function markLearnerNotificationReadAction(
  localeValue: string,
  previousState: LearnerNotificationActionState,
  formData: FormData,
): Promise<LearnerNotificationActionState> {
  void previousState;
  const locale = localeOrEnglish(localeValue);
  const labels = learnerNotificationCopy[locale];
  let input: ReturnType<typeof parseMarkNotificationReadForm>;
  try {
    input = parseMarkNotificationReadForm(formData);
  } catch {
    return state("error", labels.invalidInput);
  }
  const access = await readLearnerPrincipal(locale);
  if (!access.ok) return access.state;

  const client = await createServerClient();
  const { data: freshData, error: freshError } = await client
    .from("notifications")
    .select("id, recipient_id, row_version, read_at, cancelled_at, state")
    .eq("id", input.notificationId)
    .eq("recipient_id", access.principal.userId)
    .maybeSingle();
  if (freshError) return state("error", labels.failed);
  const fresh = freshNotificationSchema.safeParse(freshData);
  if (
    !fresh.success
    || fresh.data.recipient_id !== access.principal.userId
    || fresh.data.cancelled_at !== null
    || fresh.data.state === "cancelled"
  ) {
    return state("error", labels.forbidden);
  }

  const { error } = await client.rpc("mark_notification_read", {
    p_correlation_id: randomUUID(),
    p_expected_version: input.expectedVersion,
    p_idempotency_key: input.idempotencyKey,
    p_notification_id: input.notificationId,
  });
  if (error) return rpcFailure(locale, error);
  revalidatePath(`/${locale}/learn/notifications`);
  return state("success", labels.markReadSuccess);
}

export async function markAllLearnerNotificationsReadAction(
  localeValue: string,
  previousState: LearnerNotificationActionState,
  formData: FormData,
): Promise<LearnerNotificationActionState> {
  void previousState;
  const locale = localeOrEnglish(localeValue);
  const labels = learnerNotificationCopy[locale];
  let input: ReturnType<typeof parseMarkAllNotificationsReadForm>;
  try {
    input = parseMarkAllNotificationsReadForm(formData);
  } catch {
    return state("error", labels.invalidInput);
  }
  const access = await readLearnerPrincipal(locale);
  if (!access.ok) return access.state;

  const client = await createServerClient();
  const { error: inboxError } = await client
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("recipient_id", access.principal.userId)
    .is("read_at", null)
    .is("cancelled_at", null)
    .neq("state", "cancelled")
    .lte("created_at", input.before);
  if (inboxError) return state("error", labels.failed);

  const { error } = await client.rpc("mark_all_notifications_read", {
    p_before: input.before,
    p_correlation_id: randomUUID(),
    p_idempotency_key: input.idempotencyKey,
  });
  if (error) return rpcFailure(locale, error);
  revalidatePath(`/${locale}/learn/notifications`);
  return state("success", labels.markAllReadSuccess);
}

export async function setLearnerNotificationPreferenceAction(
  localeValue: string,
  previousState: LearnerNotificationActionState,
  formData: FormData,
): Promise<LearnerNotificationActionState> {
  void previousState;
  const locale = localeOrEnglish(localeValue);
  const labels = learnerNotificationCopy[locale];
  let input: ReturnType<typeof parseSetNotificationPreferenceForm>;
  try {
    input = parseSetNotificationPreferenceForm(formData);
  } catch {
    return state("error", labels.invalidInput);
  }
  const access = await readLearnerPrincipal(locale);
  if (!access.ok) return access.state;

  const client = await createServerClient();
  const { data: freshData, error: freshError } = await client
    .from("notification_preferences")
    .select("channel, row_version")
    .eq("user_id", access.principal.userId)
    .eq("event_family", input.eventFamily)
    .in("channel", [...learnerNotificationChannels]);
  if (freshError) return state("error", labels.failed);
  const fresh = z.array(freshPreferenceSchema).safeParse(freshData ?? []);
  if (!fresh.success) return state("error", labels.failed);

  const { error } = await client.rpc("set_notification_family_preferences", {
    p_correlation_id: randomUUID(),
    p_email_enabled: input.emailEnabled,
    p_event_family: input.eventFamily,
    p_expected_email_version: input.expectedEmailVersion,
    p_expected_in_app_version: input.expectedInAppVersion,
    p_expected_push_version: input.expectedPushVersion,
    p_idempotency_key: input.idempotencyKey,
    p_in_app_enabled: input.inAppEnabled,
    p_push_enabled: input.pushEnabled,
  });
  if (error) return rpcFailure(locale, error);
  revalidatePath(`/${locale}/learn/notifications`);
  return state("success", labels.preferenceSaved);
}
