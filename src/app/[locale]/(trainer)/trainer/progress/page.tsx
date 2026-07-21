import type { Metadata } from "next";
import { PageHeader } from "@/shared/layout";
import { ErrorState } from "@/shared/ui";
import { requireRole } from "@/shared/auth/guard";
import { listCohorts, listMemberProgress } from "@/shared/data/review";
import { getTranslator } from "@/features/review/i18n";
import { MemberTable } from "@/features/review/member-table";
import { QueueFilters } from "@/features/review/queue-filters";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslator(locale);
  return { title: t("trainer.progress.title") };
}

/**
 * ⚠️ Built from `cohort_memberships`, not `enrollments`: a trainer session
 * reads 0 enrollments (ISSUES.md I-018). The note under the table says so, so
 * nobody mistakes a missing learner for a bug.
 */
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  await requireRole(["trainer", "admin"], locale);
  const t = await getTranslator(locale);

  const query = await searchParams;
  const raw = query.cohort;
  const cohortId = (Array.isArray(raw) ? raw[0] : raw) || undefined;

  const [cohorts, members] = await Promise.all([
    listCohorts(),
    listMemberProgress(cohortId),
  ]);

  if (!members.ok) {
    return (
      <>
        <PageHeader title={t("trainer.progress.title")} description={t("trainer.progress.description")} />
        <ErrorState message={members.error.message} />
      </>
    );
  }

  const learners = members.data.filter((member) => member.role === "learner");

  return (
    <>
      <PageHeader
        title={t("trainer.progress.title")}
        description={t("trainer.progress.description")}
      />

      {cohorts.ok && cohorts.data.length > 1 && (
        <QueueFilters
          resetHref={`/${locale}/trainer/progress`}
          labels={{
            state: t("trainer.shared.state"),
            cohort: t("trainer.queue.filterCohort"),
            sort: t("trainer.queue.filterSort"),
            apply: t("trainer.queue.apply"),
            reset: t("trainer.queue.reset"),
          }}
          fields={[
            {
              name: "cohort",
              label: t("trainer.queue.filterCohort"),
              value: cohortId ?? "",
              options: [
                { value: "", label: t("trainer.queue.allCohorts") },
                ...cohorts.data.map((cohort) => ({ value: cohort.id, label: cohort.name })),
              ],
            },
          ]}
        />
      )}

      <MemberTable
        members={learners}
        locale={locale}
        t={t}
        emptyTitle={t("trainer.progress.emptyTitle")}
        emptyText={t("trainer.progress.emptyText")}
      />

      <p className="mt-4 text-[13px] leading-5 text-[--color-fg-muted]">
        {t("trainer.progress.note")}
      </p>
    </>
  );
}
