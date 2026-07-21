"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/shared/auth/guard";
import { newPasswordSchema } from "@/shared/auth/password-policy";
import { changeMyPassword, saveMyProfile } from "@/shared/data/profile";
import { signOut } from "@/shared/data/session";
import {
  NOTIFICATION_FAMILIES,
  saveNotificationFamilyPreference,
  type NotificationFamily,
} from "@/shared/data/notifications";
import { getWs3Messages } from "@/features/questions/i18n";

/** Every action re-checks the role — a layout guard does not protect a POST. */
async function guard(locale: string): Promise<void> {
  await requireRole(["student", "trainer", "admin"], locale);
}

export interface ProfileFormState {
  error: string | null;
  success: string | null;
  fieldErrors: { displayName?: string; password?: string };
}

/**
 * ⚠️ No initial-state constant lives here on purpose. A `"use server"` module
 * may export **only async functions** — any other export is replaced by a
 * server reference and reads as `undefined` in the client bundle. The symptom
 * is nasty: the route still answers 200, but the component throws during SSR
 * and the page silently arrives empty. The initial state is declared in the
 * client component instead.
 */

/* ── Account ────────────────────────────────────────────────────────────── */

export async function saveProfileAction(
  _previous: ProfileFormState,
  formData: FormData
): Promise<ProfileFormState> {
  const locale = String(formData.get("locale") ?? "de");
  await guard(locale);
  const t = (await getWs3Messages(locale)).learn.profile;

  const displayName = String(formData.get("displayName") ?? "").trim();
  const profileLocale = String(formData.get("profileLocale") ?? "de");
  const timezone = String(formData.get("timezone") ?? "UTC");
  const expectedVersion = Number(formData.get("expectedVersion") ?? 0);

  if (!displayName) {
    return { error: null, success: null, fieldErrors: { displayName: t.errorNameRequired } };
  }
  if (displayName.length > 160) {
    return { error: null, success: null, fieldErrors: { displayName: t.errorNameTooLong } };
  }

  const result = await saveMyProfile({
    displayName,
    locale: profileLocale,
    timezone,
    expectedVersion,
  });
  if (!result.ok) return { error: result.error.message, success: null, fieldErrors: {} };

  revalidatePath(`/${locale}/learn/profile`);
  return { error: null, success: t.saved, fieldErrors: {} };
}

/* ── Password ───────────────────────────────────────────────────────────── */

export async function changePasswordAction(
  _previous: ProfileFormState,
  formData: FormData
): Promise<ProfileFormState> {
  const locale = String(formData.get("locale") ?? "de");
  await guard(locale);
  const t = (await getWs3Messages(locale)).learn.profile;

  const password = String(formData.get("password") ?? "");
  const repeat = String(formData.get("passwordRepeat") ?? "");

  if (!password) {
    return { error: null, success: null, fieldErrors: { password: t.passwordRequired } };
  }
  if (password !== repeat) {
    return { error: null, success: null, fieldErrors: { password: t.passwordMismatch } };
  }
  // The same policy the registration form enforces — shared/auth/password-policy.
  if (!newPasswordSchema.safeParse(password).success) {
    return { error: null, success: null, fieldErrors: { password: t.passwordWeak } };
  }

  const result = await changeMyPassword(password);
  if (!result.ok) return { error: result.error.message, success: null, fieldErrors: {} };

  return { error: null, success: t.passwordChanged, fieldErrors: {} };
}

/* ── Notification preferences ───────────────────────────────────────────── */

function isFamily(value: string): value is NotificationFamily {
  return (NOTIFICATION_FAMILIES as readonly string[]).includes(value);
}

export async function saveNotificationPreferenceAction(
  _previous: ProfileFormState,
  formData: FormData
): Promise<ProfileFormState> {
  const locale = String(formData.get("locale") ?? "de");
  await guard(locale);
  const messages = await getWs3Messages(locale);
  const t = messages.learn.profile;

  const family = String(formData.get("family") ?? "");
  if (!isFamily(family)) {
    return { error: messages.learn.shared.invalidRequest, success: null, fieldErrors: {} };
  }

  const result = await saveNotificationFamilyPreference({
    family,
    inAppEnabled: formData.get("inApp") === "on",
    emailEnabled: formData.get("email") === "on",
    pushEnabled: formData.get("push") === "on",
    // 0 means "no row yet, create it" — a learner starts with no preferences.
    expectedInAppVersion: Number(formData.get("inAppVersion") ?? 0),
    expectedEmailVersion: Number(formData.get("emailVersion") ?? 0),
    expectedPushVersion: Number(formData.get("pushVersion") ?? 0),
  });
  if (!result.ok) return { error: result.error.message, success: null, fieldErrors: {} };

  revalidatePath(`/${locale}/learn/profile`);
  return { error: null, success: t.notificationSaved, fieldErrors: {} };
}

/* ── Session ────────────────────────────────────────────────────────────── */

export async function signOutAction(formData: FormData): Promise<void> {
  const locale = String(formData.get("locale") ?? "de");
  await signOut();
  redirect(`/${locale}/login`);
}
