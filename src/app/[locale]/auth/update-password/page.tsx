import { notFound } from "next/navigation";

import { NEW_PASSWORD_HTML_PATTERN } from "@/shared/auth/password-policy";
import { isLocale } from "@/shared/i18n/config";
import { getMessages } from "@/shared/i18n/get-messages";
import { Field, Input } from "@/shared/ui/field";

import { updatePasswordAction } from "../actions";
import { AuthPage } from "../auth-page";
import { authCopy } from "../copy";

export default async function UpdatePasswordPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const [{ locale }, query] = await Promise.all([params, searchParams]);
  if (!isLocale(locale)) notFound();
  const messages = await getMessages(locale);
  const copy = authCopy[locale];

  return (
    <AuthPage
      description={copy.updateLead}
      locale={locale}
      messages={messages}
      status={query.error ? { message: copy.invalid, tone: "danger" } : undefined}
      title={copy.updateTitle}
    >
      <form action={updatePasswordAction} className="stack">
        <input name="locale" type="hidden" value={locale} />
        <Field description={copy.passwordHelp} htmlFor="new-password" label={copy.newPassword}>
          <Input autoComplete="new-password" id="new-password" maxLength={128} minLength={12} name="password" pattern={NEW_PASSWORD_HTML_PATTERN} required type="password" />
        </Field>
        <button className="button" type="submit">{copy.updateAction}</button>
      </form>
    </AuthPage>
  );
}
