import type { Metadata } from "next";
import type { Route } from "next";
import Link from "next/link";
import { PageHeader } from "@/shared/layout";
import { Card, EmptyState, ErrorState, StatusBadge } from "@/shared/ui";
import { requireRole } from "@/shared/auth/guard";
import { getTrainerDashboard } from "@/shared/data/review";
import { getTranslator } from "@/features/review/i18n";
import { formatWaiting } from "@/features/review/format";
import { AgeBadge } from "@/features/review/age-badge";
import { StatTile } from "@/features/review/stat-tile";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslator(locale);
  return { title: t("trainer.dashboard.title") };
}

/** What is waiting, how long it has waited, and one click to deal with it. */
export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  await requireRole(["trainer", "admin"], locale);
  const t = await getTranslator(locale);

  const result = await getTrainerDashboard(locale);
  const queueHref = `/${locale}/trainer/submissions`;
  const questionsHref = `/${locale}/trainer/questions`;

  if (!result.ok) {
    return (
      <>
        <PageHeader
          title={t("trainer.dashboard.title")}
          description={t("trainer.dashboard.description")}
        />
        <ErrorState message={result.error.message} />
      </>
    );
  }

  const dashboard = result.data;

  return (
    <>
      <PageHeader
        title={t("trainer.dashboard.title")}
        description={t("trainer.dashboard.description")}
      />

      <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4 lg:gap-5">
        <StatTile
          label={t("trainer.dashboard.openReviews")}
          value={String(dashboard.openReviews)}
          href={queueHref}
          alert={dashboard.openReviews > 0}
        />
        <StatTile
          label={t("trainer.dashboard.openQuestions")}
          value={String(dashboard.openQuestions)}
          href={questionsHref}
          alert={dashboard.openQuestions > 0}
        />
        <StatTile
          label={t("trainer.dashboard.oldestWaiting")}
          value={
            dashboard.oldestWaitingHours === null
              ? t("trainer.dashboard.none")
              : formatWaiting(dashboard.oldestWaitingHours, t)
          }
          alert={(dashboard.oldestWaitingHours ?? 0) > 24}
        />
        <StatTile label={t("trainer.dashboard.decidedToday")} value={String(dashboard.decidedToday)} />
      </div>

      <section className="mb-8 flex flex-col gap-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-[22px] font-semibold leading-7">{t("trainer.dashboard.queuePreview")}</h2>
          {dashboard.queuePreview.length > 0 && (
            <Link
              href={queueHref as Route}
              className="inline-flex min-h-11 items-center text-[13px] font-semibold text-(--color-brand) underline-offset-4 hover:underline"
            >
              {t("trainer.shared.showAll")}
            </Link>
          )}
        </div>

        {dashboard.queuePreview.length === 0 ? (
          <EmptyState
            title={t("trainer.dashboard.queueEmptyTitle")}
            description={t("trainer.dashboard.queueEmptyText")}
          />
        ) : (
          <ul className="flex flex-col gap-3">
            {dashboard.queuePreview.map((item, index) => (
              <li
                key={item.id}
                className="animate-fade-in-up"
                // Stagger, capped at 240ms (00_MASTER_PLAN §6.6).
                style={{ animationDelay: `${Math.min(index * 40, 240)}ms` }}
              >
                <Card interactive padded={false}>
                  <Link
                    href={`${queueHref}/${item.id}` as Route}
                    className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between lg:p-5"
                  >
                    <span className="flex min-w-0 flex-col gap-0.5">
                      <span className="truncate text-[15px] font-semibold leading-6">
                        {item.learnerName}
                      </span>
                      <span className="truncate text-[13px] text-(--color-fg-muted)">
                        {item.taskTitle} · {item.cohortName}
                      </span>
                    </span>
                    <span className="flex shrink-0 flex-wrap items-center gap-2">
                      <StatusBadge state={item.state} locale={locale} />
                      <AgeBadge hours={item.waitingHours} t={t} />
                    </span>
                  </Link>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-[22px] font-semibold leading-7">{t("trainer.dashboard.cohorts")}</h2>

        {dashboard.cohorts.length === 0 ? (
          <EmptyState
            title={t("trainer.dashboard.cohortsEmptyTitle")}
            description={t("trainer.dashboard.cohortsEmptyText")}
          />
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2 lg:gap-5">
            {dashboard.cohorts.map((cohort) => (
              <li key={cohort.id}>
                <Card interactive padded={false} className="h-full">
                  <div className="flex h-full flex-col gap-3 p-4 lg:p-5">
                    <span className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-[18px] font-semibold leading-6">{cohort.name}</span>
                      <StatusBadge state={cohort.state} locale={locale} />
                    </span>
                    <span className="flex flex-wrap gap-x-6 gap-y-1 text-[13px] text-(--color-fg-muted)">
                      <span>
                        {t("trainer.groups.learners")}:{" "}
                        <span className="tabular font-semibold text-(--color-fg)">
                          {cohort.learnerCount}
                        </span>
                      </span>
                      <span>
                        {t("trainer.groups.openSubmissions")}:{" "}
                        <span className="tabular font-semibold text-(--color-fg)">
                          {cohort.openSubmissions}
                        </span>
                      </span>
                      <span>
                        {t("trainer.groups.openQuestions")}:{" "}
                        <span className="tabular font-semibold text-(--color-fg)">
                          {cohort.openQuestions}
                        </span>
                      </span>
                    </span>
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
