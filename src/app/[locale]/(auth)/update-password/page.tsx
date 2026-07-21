import type { Metadata } from "next";
import type { Route } from "next";
import Link from "next/link";

import { Button } from "@/shared/ui";
import { getDict } from "../../(public)/_lib/i18n";
import { hasAuthSession } from "../_lib/auth-session";
import { AuthHeading } from "../_components/auth-parts";
import { UpdatePasswordForm } from "../_components/update-password-form";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const dict = getDict(locale);
  return { title: `${dict.auth.update.title} · DiTeLe`, description: dict.auth.update.subtitle };
}

export default async function UpdatePasswordPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const dict = getDict(locale);

  // The recovery link lands on /auth/callback, which exchanges the code for a
  // session and forwards here. No session means the link is spent or expired —
  // say so, instead of showing a form that cannot possibly work.
  if (!(await hasAuthSession())) {
    return (
      <>
        <AuthHeading title={dict.auth.update.noSessionTitle} subtitle={dict.auth.update.noSessionBody} />
        <Link href={`/${locale}/reset-password` as Route}>
          <Button size="lg" fullWidth>
            {dict.auth.update.requestNew}
          </Button>
        </Link>
      </>
    );
  }

  return (
    <UpdatePasswordForm
      locale={locale}
      labels={{
        title: dict.auth.update.title,
        subtitle: dict.auth.update.subtitle,
        password: dict.auth.update.newLabel,
        passwordHint: dict.auth.register.passwordHint,
        confirm: dict.auth.register.confirmLabel,
        submit: dict.auth.update.submit,
        successTitle: dict.auth.update.successTitle,
        successBody: dict.auth.update.successBody,
        toLogin: dict.auth.shared.backToLogin,
        showPassword: dict.auth.shared.showPassword,
        hidePassword: dict.auth.shared.hidePassword,
      }}
    />
  );
}
