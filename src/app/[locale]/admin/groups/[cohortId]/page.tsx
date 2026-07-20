import { notFound } from "next/navigation";
import { z } from "zod";

import {
  canRenderProtectedPage,
  getPrincipal,
} from "@/app/[locale]/_data/principal";
import { cohortManagementCopy, parseCohortManagementNotice } from "@/features/cohorts/cohort-management-copy";
import { CohortManagementView } from "@/features/cohorts/components/cohort-management-view";
import { readCohortManagementDetail } from "@/features/cohorts/server/cohort-management-data";
import {
  transitionCohortAction,
  updateTaskScheduleAction,
} from "@/features/cohorts/server/cohort-command-actions";
import { hasPermission } from "@/shared/auth/authorization";
import { isLocale } from "@/shared/i18n/config";
import { StatePanel } from "@/shared/ui/state-panel";

const cohortIdSchema = z.string().uuid();

export default async function AdminGroupDetailPage({
  params,
  searchParams,
}: {
  readonly params: Promise<{ locale: string; cohortId: string }>;
  readonly searchParams: Promise<{ notice?: string | string[] }>;
}) {
  const [{ locale, cohortId }, query] = await Promise.all([params, searchParams]);
  if (!isLocale(locale) || !cohortIdSchema.safeParse(cohortId).success) notFound();
  if (
    !(await canRenderProtectedPage(
      locale,
      `/${locale}/admin/groups/${cohortId}`,
      ["admin", "content_admin"],
    ))
  ) {
    return null;
  }
  const labels = cohortManagementCopy[locale];
  const principal = await getPrincipal();
  if (!hasPermission(principal, "cohort.manage")) {
    return (
      <StatePanel
        description={labels.forbidden}
        title={labels.errorTitle}
        tone="danger"
      />
    );
  }
  const detail = await readCohortManagementDetail(
    principal,
    locale,
    cohortId,
    "admin",
  );
  if (!detail) notFound();
  return (
    <CohortManagementView
      detail={detail}
      labels={labels}
      locale={locale}
      notice={parseCohortManagementNotice(query.notice)}
      perspective="admin"
      scheduleAction={updateTaskScheduleAction}
      transitionAction={transitionCohortAction}
    />
  );
}
