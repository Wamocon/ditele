import type { Metadata } from "next";
import type { Route } from "next";
import Link from "next/link";
import { PageHeader } from "@/shared/layout";
import { ErrorState, StatusBadge } from "@/shared/ui";
import { requireRole } from "@/shared/auth/guard";
import { getCohortDetail } from "@/shared/data/review";
import { getTranslator } from "@/features/review/i18n";
import { formatDate } from "@/features/review/format";
import { MetaStrip } from "@/features/review/meta-strip";
import { MemberTable } from "@/features/review/member-table";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslator(locale);
  return { title: t("trainer.groups.detailTitle") };
}

export default async function Page({
  params,
}: {
  params: Promise<{ locale: string; cohortId: string }>;
}) {
  const { locale, cohortId } = await params;
  await requireRole(["trainer", "admin"], locale);
  const t = await getTranslator(locale);

  const listHref = `/${locale}/trainer/groups`;
  const result = await getCohortDetail(cohortId);

  if (!result.ok) {
    return (
      <>
        <PageHeader
          title={t("trainer.groups.notFoundTitle")}
          breadcrumbs={[{ label: t("trainer.groups.title"), href: listHref }]}
        />
        <ErrorState title={t("trainer.groups.notFoundTitle")} message={result.error.message} />
        <Link
          href={listHref as Route}
          className="mt-4 inline-flex min-h-11 items-center text-[15px] font-semibold text-[--color-brand] underline-offset-4 hover:underline"
        >
          {t("trainer.groups.title")}
        </Link>
      </>
    );
  }

  const cohort = result.data;

  return (
    <>
      <PageHeader
        title={cohort.name}
        breadcrumbs={[
          { label: t("trainer.groups.title"), href: listHref },
          { label: t("trainer.groups.detailTitle") },
        ]}
        actions={<StatusBadge state={cohort.state} />}
      />

      <MetaStrip
        className="mb-6"
        items={[
          { label: t("trainer.groups.learners"), value: String(cohort.learnerCount) },
          { label: t("trainer.groups.trainers"), value: String(cohort.trainerCount) },
          {
            label: t("trainer.groups.openSubmissions"),
            value: String(cohort.openSubmissions),
            emphasis: cohort.openSubmissions > 0,
          },
          {
            label: t("trainer.groups.openQuestions"),
            value: String(cohort.openQuestions),
            emphasis: cohort.openQuestions > 0,
          },
          {
            label: t("trainer.groups.capacity"),
            value: cohort.capacity === null ? "—" : String(cohort.capacity),
          },
          {
            label: t("trainer.groups.period"),
            value: `${formatDate(cohort.startsAt, locale)} – ${formatDate(cohort.endsAt, locale)}`,
          },
        ]}
      />

      <h2 className="mb-4 text-[22px] font-semibold leading-7">{t("trainer.groups.members")}</h2>
      <MemberTable
        members={cohort.members}
        locale={locale}
        t={t}
        showRole
        emptyTitle={t("trainer.groups.membersEmptyTitle")}
        emptyText={t("trainer.groups.membersEmptyText")}
      />
    </>
  );
}
