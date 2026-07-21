import type { Metadata } from "next";
import type { Route } from "next";
import Link from "next/link";
import { PageHeader } from "@/shared/layout";
import { Card, EmptyState, ErrorState, StatusBadge } from "@/shared/ui";
import { requireRole } from "@/shared/auth/guard";
import { listCohorts } from "@/shared/data/review";
import { getTranslator } from "@/features/review/i18n";
import { formatDate } from "@/features/review/format";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslator(locale);
  return { title: t("trainer.groups.title") };
}

export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  await requireRole(["trainer", "admin"], locale);
  const t = await getTranslator(locale);

  const result = await listCohorts();

  if (!result.ok) {
    return (
      <>
        <PageHeader title={t("trainer.groups.title")} description={t("trainer.groups.description")} />
        <ErrorState message={result.error.message} />
      </>
    );
  }

  return (
    <>
      <PageHeader title={t("trainer.groups.title")} description={t("trainer.groups.description")} />

      {result.data.length === 0 ? (
        <EmptyState
          title={t("trainer.groups.emptyTitle")}
          description={t("trainer.groups.emptyText")}
        />
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:gap-5">
          {result.data.map((cohort, index) => (
            <li
              key={cohort.id}
              className="animate-fade-in-up"
              style={{ animationDelay: `${Math.min(index * 40, 240)}ms` }}
            >
              <Card interactive padded={false} className="h-full">
                <Link
                  href={`/${locale}/trainer/groups/${cohort.id}` as Route}
                  className="flex h-full flex-col gap-3 p-4 lg:p-5"
                >
                  <span className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-[18px] font-semibold leading-6">{cohort.name}</span>
                    <StatusBadge state={cohort.state} />
                  </span>

                  <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-[13px]">
                    <Row label={t("trainer.groups.learners")} value={String(cohort.learnerCount)} />
                    <Row label={t("trainer.groups.trainers")} value={String(cohort.trainerCount)} />
                    <Row
                      label={t("trainer.groups.openSubmissions")}
                      value={String(cohort.openSubmissions)}
                    />
                    <Row
                      label={t("trainer.groups.openQuestions")}
                      value={String(cohort.openQuestions)}
                    />
                    <Row
                      label={t("trainer.groups.capacity")}
                      value={cohort.capacity === null ? "—" : String(cohort.capacity)}
                    />
                    <Row
                      label={t("trainer.groups.period")}
                      value={`${formatDate(cohort.startsAt, locale)} – ${formatDate(cohort.endsAt, locale)}`}
                    />
                  </dl>

                  <span className="mt-auto pt-1 text-[13px] font-semibold text-[--color-brand]">
                    {t("trainer.groups.open")}
                  </span>
                </Link>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-[--color-fg-muted]">{label}</dt>
      <dd className="tabular font-semibold text-[--color-fg]">{value}</dd>
    </div>
  );
}
