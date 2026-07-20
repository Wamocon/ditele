import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { RoleShell } from "@/app/[locale]/_components/role-shell";
import { isLocale } from "@/shared/i18n/config";
import { localizedRoute } from "@/shared/i18n/routes";

import { organizationWorkspaceCopy } from "./copy";

export default async function OrganizationLayout({
  children,
  params,
}: {
  readonly children: ReactNode;
  readonly params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();

  return (
    <RoleShell
      activeHref={localizedRoute(locale, "/organization")}
      allowedRoles={["organization_admin"]}
      breadcrumb={organizationWorkspaceCopy[locale].breadcrumb}
      locale={locale}
      shellRole="organizationAdmin"
    >
      {children}
    </RoleShell>
  );
}
