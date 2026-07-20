import type { ReactNode } from "react";
import { notFound } from "next/navigation";

import { RoleShell } from "@/app/[locale]/_components/role-shell";
import { isLocale } from "@/shared/i18n/config";
import { localizedRoute } from "@/shared/i18n/routes";

export default async function LearnerLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();

  return (
    <RoleShell
      activeHref={localizedRoute(locale, "/learn")}
      allowedRoles={["learner"]}
      breadcrumb="Learning workspace"
      locale={locale}
      shellRole="student"
    >
      {children}
    </RoleShell>
  );
}
