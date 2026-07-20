import { notFound } from "next/navigation";
import { z } from "zod";

import { canRenderProtectedPage } from "@/app/[locale]/_data/principal";
import { isLocale } from "@/shared/i18n/config";
import { StatePanel } from "@/shared/ui/state-panel";

import { readContentStudioAccess } from "../courses/access";
import { adminTasksCopy } from "./copy";
import { readAdminTasks } from "./data";
import { TaskInventoryView } from "./views";

export default async function AdminTasksPage({
  params,
  searchParams,
}: {
  readonly params: Promise<{ locale: string }>;
  readonly searchParams: Promise<{ page?: string | string[] }>;
}) {
  const [{ locale }, query] = await Promise.all([params, searchParams]);
  if (!isLocale(locale)) notFound();
  if (
    !(await canRenderProtectedPage(locale, `/${locale}/admin/tasks`, [
      "admin",
      "content_admin",
    ]))
  ) {
    return null;
  }

  const labels = adminTasksCopy[locale];
  const access = await readContentStudioAccess(locale, `/${locale}/admin/tasks`);
  if (!access.canManage) {
    return (
      <StatePanel
        description={labels.forbiddenDescription}
        title={labels.forbiddenTitle}
        tone="danger"
      />
    );
  }
  const parsedPage = z.coerce.number().int().positive().safeParse(
    typeof query.page === "string" ? query.page : "1",
  );
  const page = parsedPage.success ? parsedPage.data : 1;
  const result = await readAdminTasks(access.principal, locale, page);
  if (page > result.totalPages) notFound();
  return <TaskInventoryView {...result} labels={labels} locale={locale} />;
}
