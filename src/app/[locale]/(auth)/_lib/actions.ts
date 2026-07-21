"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { createServerClient } from "@/shared/database/server";
import { consumeAuthenticationRateLimit } from "@/shared/auth/rate-limit.server";
import { newPasswordSchema } from "@/shared/auth/password-policy";
import { getServerEnvironment } from "@/shared/config/server-env";
import { getPrincipal, signIn, register, postAuthDestination } from "@/shared/data/session";
import { defaultLocale } from "@/shared/i18n/config";
import { getDict } from "../../(public)/_lib/i18n";
import type { AuthActionState } from "./form-state";

/**
 * WS-1 owns this file. The four authentication mutations.
 *
 * Every one of them:
 *  - validates in German before it touches the network,
 *  - consumes the shared rate-limit bucket (`consume_authentication_rate_limit`),
 *  - returns an `AuthActionState` rather than throwing, so the form can re-render
 *    with the user's input intact,
 *  - never reveals whether an email address exists.
 *
 * ⚠️ Two rules this file lives by:
 *  1. **Only async functions may be exported.** The state shape and its initial
 *     value live in `form-state.ts` — see the note there.
 *  2. `redirect()` throws a control-flow signal, so it is always called
 *     *outside* a try/catch, or the navigation is swallowed as an error.
 */

const emailSchema = z.email();

function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

function localeOf(formData: FormData): string {
  const value = field(formData, "locale");
  return value.length > 0 ? value : defaultLocale;
}

function fail(
  message: string,
  values: { email: string; name: string },
  fieldErrors: Record<string, string> = {}
): AuthActionState {
  return { status: "error", message, fieldErrors, values };
}

/* ── Sign in ─────────────────────────────────────────────────────────────── */

export async function signInAction(
  _previous: AuthActionState,
  formData: FormData
): Promise<AuthActionState> {
  const locale = localeOf(formData);
  const dict = getDict(locale);
  const email = field(formData, "email").trim();
  const password = field(formData, "password");
  const values = { email, name: "" };

  if (!emailSchema.safeParse(email).success) {
    return fail(dict.auth.shared.emailRequired, values, {
      email: dict.auth.shared.emailRequired,
    });
  }
  if (password.length === 0) {
    return fail(dict.auth.shared.passwordRequired, values, {
      password: dict.auth.shared.passwordRequired,
    });
  }

  if (!(await consumeAuthenticationRateLimit("sign_in", email))) {
    return fail(dict.auth.shared.rateLimited, values);
  }

  const result = await signIn(email, password);
  if (!result.ok) {
    // Same message for "no such account" and "wrong password" — on purpose.
    return fail(dict.auth.login.failed, values);
  }

  redirect(`/${locale}${result.data.redirectTo}`);
}

/* ── Register ────────────────────────────────────────────────────────────── */

export async function registerAction(
  _previous: AuthActionState,
  formData: FormData
): Promise<AuthActionState> {
  const locale = localeOf(formData);
  const dict = getDict(locale);
  const email = field(formData, "email").trim();
  const name = field(formData, "name").trim();
  const password = field(formData, "password");
  const confirm = field(formData, "confirm");
  const values = { email, name };

  const fieldErrors: Record<string, string> = {};
  if (name.length === 0) fieldErrors.name = dict.auth.register.nameRequired;
  if (!emailSchema.safeParse(email).success) fieldErrors.email = dict.auth.shared.emailRequired;
  if (!newPasswordSchema.safeParse(password).success) {
    fieldErrors.password = dict.auth.register.passwordWeak;
  }
  if (password !== confirm) fieldErrors.confirm = dict.auth.register.confirmMismatch;

  if (Object.keys(fieldErrors).length > 0) {
    return fail(dict.auth.invalid, values, fieldErrors);
  }

  if (!(await consumeAuthenticationRateLimit("register", email))) {
    return fail(dict.auth.shared.rateLimited, values);
  }

  const result = await register({ email, password, displayName: name });
  if (!result.ok) return fail(result.error.message, values);

  // This deployment has `mailer_autoconfirm: true`, so sign-up returns a live
  // session and a database trigger provisions the profile, role and
  // organisation membership. If either ever changes, fall back to the
  // confirm-your-email state rather than bouncing the user into a guard loop.
  if (result.data.needsConfirmation) {
    return { status: "success", message: null, fieldErrors: {}, values };
  }

  const session = await getPrincipal();
  redirect(session ? `/${locale}${postAuthDestination(session.uiRole)}` : `/${locale}/login`);
}

/* ── Request a password-reset link ───────────────────────────────────────── */

export async function requestPasswordResetAction(
  _previous: AuthActionState,
  formData: FormData
): Promise<AuthActionState> {
  const locale = localeOf(formData);
  const dict = getDict(locale);
  const email = field(formData, "email").trim();
  const values = { email, name: "" };

  if (!emailSchema.safeParse(email).success) {
    return fail(dict.auth.shared.emailRequired, values, {
      email: dict.auth.shared.emailRequired,
    });
  }

  if (!(await consumeAuthenticationRateLimit("password_reset", email))) {
    return fail(dict.auth.shared.rateLimited, values);
  }

  const supabase = await createServerClient();
  const origin = getServerEnvironment().DITELE_APP_ORIGIN.replace(/\/$/, "");
  await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/auth/callback?next=${encodeURIComponent(`/${locale}/update-password`)}`,
  });

  // Always the same answer, whether or not the address exists. A provider error
  // is deliberately not surfaced either — it would leak the same information.
  return { status: "success", message: null, fieldErrors: {}, values };
}

/* ── Set a new password (from the reset link) ────────────────────────────── */

export async function updatePasswordAction(
  _previous: AuthActionState,
  formData: FormData
): Promise<AuthActionState> {
  const locale = localeOf(formData);
  const dict = getDict(locale);
  const password = field(formData, "password");
  const confirm = field(formData, "confirm");
  const values = { email: "", name: "" };

  const fieldErrors: Record<string, string> = {};
  if (!newPasswordSchema.safeParse(password).success) {
    fieldErrors.password = dict.auth.register.passwordWeak;
  }
  if (password !== confirm) fieldErrors.confirm = dict.auth.register.confirmMismatch;
  if (Object.keys(fieldErrors).length > 0) {
    return fail(dict.auth.invalid, values, fieldErrors);
  }

  const supabase = await createServerClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) return fail(dict.auth.shared.unexpected, values);

  return { status: "success", message: null, fieldErrors: {}, values };
}
