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
import { getMessages } from "@/shared/i18n/get-messages";
import { defaultLocale, isLocale } from "@/shared/i18n/config";

/**
 * The profile screen's writes, shared by all three roles.
 *
 * Previously only the learner route had these; the trainer and admin screens
 * had their own display-name-only action and no password or notification write
 * at all. Same account, same rules — so one module, and the guard admits every
 * signed-in role.
 *
 * ⚠️ Every action re-checks the role. A layout guard does not protect a POST
 * (MASTER_PLAN §9.3), and each of these ends in an RPC that checks again.
 *
 * ⚠️ A `"use server"` module may export **only** async functions. `ProfileFormState`
 * is a type (erased at build, so it is allowed); the initial-state constant is
 * declared in the client component instead, because a non-function value export
 * silently arrives as `undefined` in the browser bundle.
 */

export interface ProfileFormState {
  error: string | null;
  success: string | null;
  fieldErrors: { displayName?: string; password?: string };
}

const IDLE: ProfileFormState = { error: null, success: null, fieldErrors: {} };

async function strings(locale: string) {
  const messages = await getMessages(isLocale(locale) ? locale : defaultLocale);
  return messages.profile;
}

/** Where to revalidate: each role reaches the same screen by a different path. */
function profilePath(locale: string, role: "student" | "trainer" | "admin"): string {
  if (role === "admin") return `/${locale}/admin/profile`;
  if (role === "trainer") return `/${locale}/trainer/profile`;
  return `/${locale}/learn/profile`;
}

/* ── Account ────────────────────────────────────────────────────────────── */

export async function saveProfileAction(
  _previous: ProfileFormState,
  formData: FormData
): Promise<ProfileFormState> {
  const locale = String(formData.get("locale") ?? defaultLocale);
  const { uiRole } = await requireRole(["student", "trainer", "admin"], locale);
  const t = await strings(locale);

  const displayName = String(formData.get("displayName") ?? "").trim();
  if (!displayName) {
    return { ...IDLE, fieldErrors: { displayName: t.errorNameRequired } };
  }
  if (displayName.length > 160) {
    return { ...IDLE, fieldErrors: { displayName: t.errorNameTooLong } };
  }

  // The language picker is gone from this screen — language is a header control
  // now, and two places to set one value meant the winner was whichever you
  // happened to touch last. `update_own_profile` still requires the argument,
  // so the stored value rides along untouched in a hidden field.
  const result = await saveMyProfile({
    displayName,
    locale: String(formData.get("profileLocale") ?? locale),
    timezone: String(formData.get("timezone") ?? "UTC"),
    expectedVersion: Number(formData.get("expectedVersion") ?? 0),
  });
  if (!result.ok) return { ...IDLE, error: result.error.message };

  revalidatePath(profilePath(locale, uiRole));
  return { ...IDLE, success: t.saved };
}

/* ── Password ───────────────────────────────────────────────────────────── */

export async function changePasswordAction(
  _previous: ProfileFormState,
  formData: FormData
): Promise<ProfileFormState> {
  const locale = String(formData.get("locale") ?? defaultLocale);
  await requireRole(["student", "trainer", "admin"], locale);
  const t = await strings(locale);

  const password = String(formData.get("password") ?? "");
  const repeat = String(formData.get("passwordRepeat") ?? "");

  if (!password) return { ...IDLE, fieldErrors: { password: t.passwordRequired } };
  if (password !== repeat) return { ...IDLE, fieldErrors: { password: t.passwordMismatch } };
  // The same policy the registration form enforces — shared/auth/password-policy.
  if (!newPasswordSchema.safeParse(password).success) {
    return { ...IDLE, fieldErrors: { password: t.passwordWeak } };
  }

  const result = await changeMyPassword(password);
  if (!result.ok) return { ...IDLE, error: result.error.message };
  return { ...IDLE, success: t.passwordChanged };
}

/* ── Notification preferences ───────────────────────────────────────────── */

function isFamily(value: string): value is NotificationFamily {
  return (NOTIFICATION_FAMILIES as readonly string[]).includes(value);
}

export async function saveNotificationPreferenceAction(
  _previous: ProfileFormState,
  formData: FormData
): Promise<ProfileFormState> {
  const locale = String(formData.get("locale") ?? defaultLocale);
  const { uiRole } = await requireRole(["student", "trainer", "admin"], locale);
  const t = await strings(locale);

  const family = String(formData.get("family") ?? "");
  if (!isFamily(family)) return { ...IDLE, error: t.loadError };

  const result = await saveNotificationFamilyPreference({
    family,
    inAppEnabled: formData.get("inApp") === "on",
    emailEnabled: formData.get("email") === "on",
    pushEnabled: formData.get("push") === "on",
    // 0 means "no row yet, create it" — an account starts with no preferences.
    expectedInAppVersion: Number(formData.get("inAppVersion") ?? 0),
    expectedEmailVersion: Number(formData.get("emailVersion") ?? 0),
    expectedPushVersion: Number(formData.get("pushVersion") ?? 0),
  });
  if (!result.ok) return { ...IDLE, error: result.error.message };

  revalidatePath(profilePath(locale, uiRole));
  return { ...IDLE, success: t.notificationSaved };
}

/* ── Session ────────────────────────────────────────────────────────────── */

export async function signOutAction(formData: FormData): Promise<void> {
  const locale = String(formData.get("locale") ?? defaultLocale);
  await signOut();
  redirect(`/${locale}/login`);
}
