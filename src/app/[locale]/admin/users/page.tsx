import { notFound } from "next/navigation";
import { z } from "zod";

import { canRenderProtectedPage, getPrincipal } from "@/app/[locale]/_data/principal";
import { AdminUsersView } from "@/features/administration/components/management-read-views";
import { adminUsersCopy } from "@/features/administration/management-read-copy";
import { readAdminUsers } from "@/features/administration/management-read-data";
import { hasPermission } from "@/shared/auth/authorization";
import { isLocale } from "@/shared/i18n/config";
import { StatePanel } from "@/shared/ui/state-panel";

export default async function AdminUsersPage({
  params,
  searchParams,
}: {
  readonly params: Promise<{ locale: string }>;
  readonly searchParams: Promise<{ page?: string | string[] }>;
}) {
  const [{ locale }, query] = await Promise.all([params, searchParams]);
  if (!isLocale(locale)) notFound();
  if (!(await canRenderProtectedPage(locale, `/${locale}/admin/users`, ["admin", "content_admin"]))) {
    return null;
  }
  const labels = adminUsersCopy[locale];
  const principal = await getPrincipal();
  if (!principal.organizationId || !hasPermission(principal, "organization.manage")) {
    return <StatePanel description={labels.forbiddenDescription} title={labels.forbiddenTitle} tone="danger" />;
  }
  const parsedPage = z.coerce.number().int().positive().safeParse(
    typeof query.page === "string" ? query.page : "1",
  );
  const page = parsedPage.success ? parsedPage.data : 1;
  const result = await readAdminUsers(principal, page);
  if (page > result.totalPages) notFound();
  return <AdminUsersView {...result} labels={labels} locale={locale} />;
}
