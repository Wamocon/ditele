import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getPrincipal, postAuthDestination } from "@/shared/data/session";
import { getDict } from "../../(public)/_lib/i18n";
import { LoginForm } from "../_components/login-form";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const dict = getDict(locale);
  return { title: `${dict.auth.login.title} · DiTeLe`, description: dict.auth.login.subtitle };
}

export default async function LoginPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const [{ locale }, query] = await Promise.all([params, searchParams]);

  // Already signed in? Do not show a login form — send them where they belong.
  const session = await getPrincipal();
  if (session) redirect(`/${locale}${postAuthDestination(session.uiRole)}`);

  const dict = getDict(locale);
  return (
    <LoginForm
      locale={locale}
      // Set by /auth/callback when an email link is expired or already used.
      {...(query.error === "callback" ? { notice: dict.auth.callback.failedBody } : {})}
      labels={{
        title: dict.auth.login.title,
        subtitle: dict.auth.login.subtitle,
        email: dict.auth.shared.emailLabel,
        emailPlaceholder: dict.auth.shared.emailPlaceholder,
        password: dict.auth.shared.passwordLabel,
        submit: dict.auth.login.submit,
        forgot: dict.auth.login.forgot,
        noAccount: dict.auth.login.noAccount,
        registerLink: dict.auth.login.registerLink,
        showPassword: dict.auth.shared.showPassword,
        hidePassword: dict.auth.shared.hidePassword,
      }}
    />
  );
}
