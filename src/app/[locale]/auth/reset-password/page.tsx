import Link from "next/link";
import { notFound } from "next/navigation";

import { isLocale } from "@/shared/i18n/config";
import { getMessages } from "@/shared/i18n/get-messages";
import { localizedRoute } from "@/shared/i18n/routes";
import { Field, Input } from "@/shared/ui/field";

import { requestPasswordResetAction } from "../actions";
import { AuthPage } from "../auth-page";
import { authCopy } from "../copy";

export default async function ResetPasswordPage({
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
      description={copy.resetLead}
      locale={locale}
      messages={messages}
      status={query.error ? {
        message: query.error === "throttled" ? copy.throttled : copy.invalid,
        tone: "danger",
      } : undefined}
      title={messages.auth.resetTitle}
    >
      <form action={requestPasswordResetAction} className="stack">
        <input name="locale" type="hidden" value={locale} />
        <Field htmlFor="reset-email" label={messages.auth.email}>
          <Input autoComplete="email" id="reset-email" name="email" required type="email" />
        </Field>
        <button className="button" type="submit">{messages.auth.resetAction}</button>
      </form>
      <Link href={localizedRoute(locale, "/auth/login")}>{copy.backToLogin}</Link>
    </AuthPage>
  );
}
