import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getPrincipal, postAuthDestination } from "@/shared/data/session";
import { getDict } from "../../(public)/_lib/i18n";
import { RegisterForm } from "../_components/register-form";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const dict = getDict(locale);
  return { title: `${dict.auth.register.title} · DiTeLe`, description: dict.auth.register.subtitle };
}

export default async function RegisterPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;

  const session = await getPrincipal();
  if (session) redirect(`/${locale}${postAuthDestination(session.uiRole)}`);

  const dict = getDict(locale);
  return (
    <RegisterForm
      locale={locale}
      labels={{
        title: dict.auth.register.title,
        subtitle: dict.auth.register.subtitle,
        name: dict.auth.register.nameLabel,
        namePlaceholder: dict.auth.register.namePlaceholder,
        email: dict.auth.shared.emailLabel,
        emailPlaceholder: dict.auth.shared.emailPlaceholder,
        password: dict.auth.shared.passwordLabel,
        passwordHint: dict.auth.register.passwordHint,
        confirm: dict.auth.register.confirmLabel,
        submit: dict.auth.register.submit,
        hasAccount: dict.auth.register.hasAccount,
        loginLink: dict.auth.register.loginLink,
        showPassword: dict.auth.shared.showPassword,
        hidePassword: dict.auth.shared.hidePassword,
        terms: dict.auth.register.terms,
        checkInboxTitle: dict.auth.register.checkInboxTitle,
        checkInboxBody: dict.auth.register.checkInboxBody,
      }}
    />
  );
}
