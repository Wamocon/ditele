import Link from "next/link";
import { notFound } from "next/navigation";

import { NEW_PASSWORD_HTML_PATTERN } from "@/shared/auth/password-policy";
import { isLocale } from "@/shared/i18n/config";
import { getMessages } from "@/shared/i18n/get-messages";
import { localizedRoute } from "@/shared/i18n/routes";
import { Field, Input } from "@/shared/ui/field";

import { registerAction } from "../actions";
import { AuthPage } from "../auth-page";
import { authCopy } from "../copy";

export default async function RegisterPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const [{ locale }, query] = await Promise.all([params, searchParams]);
  if (!isLocale(locale)) notFound();
  const messages = await getMessages(locale);
  const copy = authCopy[locale];

  return (
    <AuthPage
      description={copy.registerLead}
      locale={locale}
      messages={messages}
      status={query.error ? {
        message: query.error === "throttled" ? copy.throttled : copy.invalid,
        tone: "danger",
      } : undefined}
      title={messages.auth.registerTitle}
    >
      <form action={registerAction} className="stack">
        <input name="locale" type="hidden" value={locale} />
        {query.next ? <input name="next" type="hidden" value={query.next} /> : null}
        <Field htmlFor="register-name" label={messages.auth.name}>
          <Input autoComplete="name" id="register-name" maxLength={120} minLength={2} name="name" required />
        </Field>
        <Field htmlFor="register-email" label={messages.auth.email}>
          <Input autoComplete="email" id="register-email" name="email" required type="email" />
        </Field>
        <Field description={copy.passwordHelp} htmlFor="register-password" label={messages.auth.password}>
          <Input autoComplete="new-password" id="register-password" maxLength={128} minLength={12} name="password" pattern={NEW_PASSWORD_HTML_PATTERN} required type="password" />
        </Field>
        <button className="button" type="submit">{messages.auth.registerAction}</button>
      </form>
      <p>{copy.hasAccount} <Link href={localizedRoute(locale, "/auth/login")}>{messages.common.signIn}</Link></p>
    </AuthPage>
  );
}
