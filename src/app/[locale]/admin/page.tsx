import type { Route } from "next";
import { notFound, redirect } from "next/navigation";

import { OperationsOverview } from "@/features/administration/components/operations-overview";
import {
  canRenderProtectedPage,
  getPrincipal,
} from "@/app/[locale]/_data/principal";
import { isLocale } from "@/shared/i18n/config";

import { readAdministrationOperations } from "./_data/operations";
import { adminLandingForRoles } from "./_data/landing";
import { operationsCopy } from "./operations-copy";

export default async function AdminPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  if (
    !(await canRenderProtectedPage(locale, `/${locale}/admin`, [
      "admin",
      "content_admin",
    ]))
  ) {
    return null;
  }
  const landing = adminLandingForRoles((await getPrincipal()).roles);
  if (landing === "/admin/courses") {
    redirect(`/${locale}${landing}` as Route);
  }
  if (landing !== "/admin") return null;
  const operations = await readAdministrationOperations();

  return (
    <OperationsOverview
      applications={operations.applications}
      exports={operations.exports}
      issues={operations.issues}
      labels={operationsCopy[locale]}
    />
  );
}
