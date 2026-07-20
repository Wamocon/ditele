import Link from "next/link";
import { notFound } from "next/navigation";

import { isLocale } from "@/shared/i18n/config";
import { getMessages } from "@/shared/i18n/get-messages";
import { localizedDynamicRoute, localizedRoute } from "@/shared/i18n/routes";
import { Field, Input } from "@/shared/ui/field";

import { signInAction } from "../actions";
import { AuthPage } from "../auth-page";
import { authCopy } from "../copy";

export default async function LoginPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ error?: string; status?: string; next?: string }>;
}) {
  const [{ locale }, query] = await Promise.all([params, searchParams]);
  if (!isLocale(locale)) notFound();
  const messages = await getMessages(locale);
  const copy = authCopy[locale];
  const status = query.error
    ? {
        message: query.error === "throttled"
          ? copy.throttled
          : query.error === "unavailable"
            ? copy.unavailable
            : copy.invalid,
        tone: "danger" as const,
      }
    : query.status === "check-email"
      ? { message: copy.checkEmail, tone: "success" as const }
      : query.status === "reset-sent"
        ? { message: copy.resetSent, tone: "success" as const }
        : query.status === "password-updated"
          ? { message: copy.passwordUpdated, tone: "success" as const }
          : undefined;

  return (
    <AuthPage description={copy.loginLead} locale={locale} messages={messages} status={status} title={messages.auth.loginTitle}>
      <form action={signInAction} className="stack">
        <input name="locale" type="hidden" value={locale} />
        {query.next ? <input name="next" type="hidden" value={query.next} /> : null}
        <Field htmlFor="login-email" label={messages.auth.email}>
          <Input autoComplete="email" id="login-email" name="email" required type="email" />
        </Field>
        <Field htmlFor="login-password" label={messages.auth.password}>
          <Input autoComplete="current-password" id="login-password" name="password" required type="password" />
        </Field>
        <div className="cluster">
          <button className="button" type="submit">{messages.auth.loginAction}</button>
          <Link href={localizedRoute(locale, "/auth/reset-password")}>{messages.auth.forgot}</Link>
        </div>
      </form>
      <p>{copy.noAccount} <Link href={localizedDynamicRoute(locale, `/auth/register${query.next ? `?next=${encodeURIComponent(query.next)}` : ""}`)}>{copy.createAccount}</Link></p>
    </AuthPage>
  );
}
