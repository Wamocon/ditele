import { notFound } from "next/navigation";
import { z } from "zod";

import { canRenderProtectedPage, getPrincipal } from "@/app/[locale]/_data/principal";
import { hasPermission } from "@/shared/auth/authorization";
import { AdminGroupsView } from "@/features/administration/components/management-read-views";
import { adminGroupsCopy } from "@/features/administration/management-read-copy";
import { readAdminGroups } from "@/features/administration/management-read-data";
import { isLocale } from "@/shared/i18n/config";
import { StatePanel } from "@/shared/ui/state-panel";

export default async function AdminGroupsPage({
  params,
  searchParams,
}: {
  readonly params: Promise<{ locale: string }>;
  readonly searchParams: Promise<{ page?: string | string[] }>;
}) {
  const [{ locale }, query] = await Promise.all([params, searchParams]);
  if (!isLocale(locale)) notFound();
  if (!(await canRenderProtectedPage(locale, `/${locale}/admin/groups`, ["admin", "content_admin"]))) {
    return null;
  }
  const labels = adminGroupsCopy[locale];
  const principal = await getPrincipal();
  if (!principal.organizationId || !hasPermission(principal, "cohort.manage")) {
    return <StatePanel description={labels.forbiddenDescription} title={labels.forbiddenTitle} tone="danger" />;
  }
  const parsedPage = z.coerce.number().int().positive().safeParse(
    typeof query.page === "string" ? query.page : "1",
  );
  const page = parsedPage.success ? parsedPage.data : 1;
  const result = await readAdminGroups(principal, locale, page);
  if (page > result.totalPages) notFound();
  return <AdminGroupsView {...result} labels={labels} locale={locale} />;
}
