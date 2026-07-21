import type { Metadata } from "next";

import { getDict } from "../../(public)/_lib/i18n";
import { ResetForm } from "../_components/reset-form";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const dict = getDict(locale);
  return { title: `${dict.auth.reset.title} · DiTeLe`, description: dict.auth.reset.subtitle };
}

export default async function ResetPasswordPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const dict = getDict(locale);

  return (
    <ResetForm
      locale={locale}
      labels={{
        title: dict.auth.reset.title,
        subtitle: dict.auth.reset.subtitle,
        email: dict.auth.shared.emailLabel,
        emailPlaceholder: dict.auth.shared.emailPlaceholder,
        submit: dict.auth.reset.submit,
        sentTitle: dict.auth.reset.sentTitle,
        sentBody: dict.auth.reset.sentBody,
        remembered: dict.auth.reset.remembered,
        backToLogin: dict.auth.shared.backToLogin,
      }}
    />
  );
}
