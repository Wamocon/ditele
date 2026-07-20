"use server";

import { redirect } from "next/navigation";
import type { Route } from "next";
import { z } from "zod";

import { AuthenticationRequiredError } from "@/shared/auth/errors";
import {
  resolvePostAuthenticationDestination,
  safePostAuthenticationNext,
} from "@/shared/auth/post-auth-destination";
import {
  existingPasswordSchema,
  newPasswordSchema,
} from "@/shared/auth/password-policy";
import { consumeAuthenticationRateLimit } from "@/shared/auth/rate-limit.server";
import type { AuthenticationRateLimitOperation } from "@/shared/auth/rate-limit";
import { isLocale, type Locale } from "@/shared/i18n/config";
import { localizedRoute } from "@/shared/i18n/routes";
import { createServerClient } from "@/shared/database/server";

const LocaleSchema = z.string().refine(isLocale);
const EmailSchema = z.string().trim().email().max(254);
function authPath(locale: string, path: string, state?: string): Route {
  return `/${locale}/auth/${path}${state ? `?${state}` : ""}` as Route;
}

function signInErrorState(error: unknown): "invalid" | "throttled" | "unavailable" {
  if (typeof error !== "object" || error === null) return "invalid";
  const providerError = error as { name?: unknown; status?: unknown };
  if (providerError.status === 429) return "throttled";
  if (
    providerError.name === "AuthRetryableFetchError" ||
    providerError.status === 0 ||
    (typeof providerError.status === "number" && providerError.status >= 500)
  ) {
    return "unavailable";
  }
  return "invalid";
}

async function requireAuthenticationRateLimit(
  operation: AuthenticationRateLimitOperation,
  email: FormDataEntryValue | null,
  locale: Locale,
  path: "login" | "register" | "reset-password",
): Promise<void> {
  if (!(await consumeAuthenticationRateLimit(operation, email))) {
    redirect(authPath(locale, path, "error=throttled"));
  }
}

async function authenticatedDestination(
  locale: Locale,
  requestedNext: FormDataEntryValue | null,
): Promise<Route> {
  try {
    return await resolvePostAuthenticationDestination(locale, requestedNext);
  } catch (error) {
    if (error instanceof AuthenticationRequiredError) {
      redirect(authPath(locale, "login", "error=invalid"));
    }
    throw error;
  }
}

export async function signInAction(formData: FormData): Promise<void> {
  const requestedLocale = LocaleSchema.safeParse(formData.get("locale"));
  await requireAuthenticationRateLimit(
    "sign_in",
    formData.get("email"),
    requestedLocale.success ? requestedLocale.data : "en",
    "login",
  );

  const parsed = z
    .object({
      locale: LocaleSchema,
      email: EmailSchema,
      password: existingPasswordSchema,
    })
    .safeParse(Object.fromEntries(formData));

  if (!parsed.success) {
    const locale = LocaleSchema.safeParse(formData.get("locale"));
    redirect(authPath(locale.success ? locale.data : "en", "login", "error=invalid"));
  }

  const client = await createServerClient();
  const { error } = await client.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (error) {
    redirect(
      authPath(
        parsed.data.locale,
        "login",
        `error=${signInErrorState(error)}`,
      ),
    );
  }

  redirect(
    await authenticatedDestination(parsed.data.locale, formData.get("next")),
  );
}

export async function registerAction(formData: FormData): Promise<void> {
  const requestedLocale = LocaleSchema.safeParse(formData.get("locale"));
  await requireAuthenticationRateLimit(
    "register",
    formData.get("email"),
    requestedLocale.success ? requestedLocale.data : "en",
    "register",
  );

  const parsed = z
    .object({
      locale: LocaleSchema,
      name: z.string().trim().min(2).max(120),
      email: EmailSchema,
      password: newPasswordSchema,
    })
    .safeParse(Object.fromEntries(formData));

  if (!parsed.success) {
    const locale = LocaleSchema.safeParse(formData.get("locale"));
    redirect(authPath(locale.success ? locale.data : "en", "register", "error=invalid"));
  }

  const origin = process.env.DITELE_APP_ORIGIN ?? "http://127.0.0.1:3100";
  const requestedNext = formData.get("next");
  const confirmationNext =
    safePostAuthenticationNext(parsed.data.locale, requestedNext) ??
    localizedRoute(parsed.data.locale, "/learn");
  const client = await createServerClient();
  const { data, error } = await client.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: { display_name: parsed.data.name, locale: parsed.data.locale },
      emailRedirectTo: `${origin}/${parsed.data.locale}/auth/callback?next=${encodeURIComponent(confirmationNext)}`,
    },
  });

  if (error) {
    redirect(authPath(parsed.data.locale, "register", "error=invalid"));
  }

  if (data.session) {
    redirect(await authenticatedDestination(parsed.data.locale, requestedNext));
  }

  redirect(authPath(parsed.data.locale, "login", "status=check-email"));
}

export async function requestPasswordResetAction(formData: FormData): Promise<void> {
  const requestedLocale = LocaleSchema.safeParse(formData.get("locale"));
  await requireAuthenticationRateLimit(
    "password_reset",
    formData.get("email"),
    requestedLocale.success ? requestedLocale.data : "en",
    "reset-password",
  );

  const parsed = z
    .object({ locale: LocaleSchema, email: EmailSchema })
    .safeParse(Object.fromEntries(formData));

  if (!parsed.success) {
    const locale = LocaleSchema.safeParse(formData.get("locale"));
    redirect(
      authPath(locale.success ? locale.data : "en", "reset-password", "error=invalid"),
    );
  }

  const origin = process.env.DITELE_APP_ORIGIN ?? "http://127.0.0.1:3100";
  const client = await createServerClient();
  await client.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${origin}/${parsed.data.locale}/auth/callback?next=/${parsed.data.locale}/auth/update-password`,
  });

  // Always return the same result to avoid account enumeration.
  redirect(authPath(parsed.data.locale, "login", "status=reset-sent"));
}

export async function updatePasswordAction(formData: FormData): Promise<void> {
  const parsed = z
    .object({ locale: LocaleSchema, password: newPasswordSchema })
    .safeParse(Object.fromEntries(formData));

  if (!parsed.success) {
    const locale = LocaleSchema.safeParse(formData.get("locale"));
    redirect(
      authPath(locale.success ? locale.data : "en", "update-password", "error=invalid"),
    );
  }

  const client = await createServerClient();
  const { error } = await client.auth.updateUser({ password: parsed.data.password });
  if (error) {
    redirect(authPath(parsed.data.locale, "update-password", "error=invalid"));
  }

  // A recovery password change is a security event: revoke every refresh
  // session and clear the recovery session before asking for fresh credentials.
  await client.auth.signOut({ scope: "global" });

  redirect(authPath(parsed.data.locale, "login", "status=password-updated"));
}

export async function signOutAction(formData: FormData): Promise<void> {
  const locale = LocaleSchema.safeParse(formData.get("locale"));
  const safeLocale = locale.success ? locale.data : "en";
  const client = await createServerClient();
  await client.auth.signOut({ scope: "local" });
  redirect(`/${safeLocale}` as Route);
}
