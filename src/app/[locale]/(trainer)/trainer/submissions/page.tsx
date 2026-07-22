import type { Metadata } from "next";
import type { Route } from "next";
import Link from "next/link";
import { PageHeader } from "@/shared/layout";
import { DataTable, EmptyState, ErrorState, StatusBadge, statusLabel, type Column } from "@/shared/ui";
import { requireRole } from "@/shared/auth/guard";
import {
  asSubmissionState,
  listReviewQueue,
  OPEN_SUBMISSION_STATES,
  type QueueItem,
} from "@/shared/data/review";
import { getTranslator } from "@/features/review/i18n";
import { formatCount, formatDateTime } from "@/features/review/format";
import { AgeBadge } from "@/features/review/age-badge";
import { QueueFilters } from "@/features/review/queue-filters";
import { Notice } from "@/features/review/notice";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslator(locale);
  return { title: t("trainer.queue.title") };
}

const PAGE_SIZE = 25;

/**
 * Oldest first by default. The queue is a line of people waiting, and the whole
 * point of the age badge is that nobody waits twice as long as anybody else.
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

  const first = (key: string) => {
    const value = query[key];
    return Array.isArray(value) ? value[0] : value;
  };

  const state = asSubmissionState(first("state"));
  const cohortId = first("cohort") || undefined;
  const sort = first("sort") === "newest" ? ("newest" as const) : ("oldest" as const);
  const page = Math.max(1, Number(first("page") ?? 1) || 1);

  const result = await listReviewQueue({
    locale,
    state,
    cohortId,
    sort,
    limit: PAGE_SIZE,
    offset: (page - 1) * PAGE_SIZE,
  });

  const base = `/${locale}/trainer/submissions`;
  const decided = first("decided");
  const transferred = first("transferred");

  if (!result.ok) {
    return (
      <>
        <PageHeader title={t("trainer.queue.title")} description={t("trainer.queue.description")} />
        <ErrorState message={result.error.message} />
      </>
    );
  }

  const { items, total, cohorts } = result.data;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const columns: Column<QueueItem>[] = [
    {
      key: "learner",
      header: t("trainer.shared.learner"),
      cell: (row) => (
        <Link
          href={`${base}/${row.id}` as Route}
          className="font-semibold text-(--color-fg) underline-offset-4 hover:text-(--color-brand) hover:underline"
        >
          {row.learnerName}
        </Link>
      ),
    },
    { key: "task", header: t("trainer.shared.task"), cell: (row) => row.taskTitle },
    { key: "cohort", header: t("trainer.shared.cohort"), cell: (row) => row.cohortName, hideOnMobile: true },
    {
      key: "submitted",
      header: t("trainer.shared.submittedAt"),
      cell: (row) => formatDateTime(row.submittedAt, locale),
      hideOnMobile: true,
    },
    {
      key: "waiting",
      header: t("trainer.shared.waiting"),
      cell: (row) => <AgeBadge hours={row.waitingHours} t={t} />,
    },
    { key: "state", header: t("trainer.shared.state"), cell: (row) => <StatusBadge state={row.state} locale={locale} /> },
    {
      key: "open",
      header: t("trainer.queue.open"),
      cell: (row) => (
        <Link
          href={`${base}/${row.id}` as Route}
          className="inline-flex min-h-11 items-center font-semibold text-(--color-brand) underline-offset-4 hover:underline"
        >
          {t("trainer.queue.open")}
        </Link>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title={t("trainer.queue.title")}
        description={t("trainer.queue.description")}
        actions={
          <span className="text-[13px] text-(--color-fg-muted) tabular">
            {formatCount(total, t)}
          </span>
        }
      />

      {decided && <Notice message={t("trainer.review.decided")} />}
      {transferred && <Notice message={t("trainer.review.transferred")} tone="info" />}

      <QueueFilters
        resetHref={base}
        labels={{
          state: t("trainer.queue.filterState"),
          cohort: t("trainer.queue.filterCohort"),
          sort: t("trainer.queue.filterSort"),
          apply: t("trainer.queue.apply"),
          reset: t("trainer.queue.reset"),
        }}
        fields={[
          {
            name: "state",
            label: t("trainer.queue.filterState"),
            value: state ?? "",
            options: [
              { value: "", label: t("trainer.queue.allStates") },
              // `statusLabel`, not `t("status.<state>")`: the catalogue keys are
              // camelCase (`revisionRequired`) but these values are the database
              // enums (`revision_required`), so the lookup missed and the filter
              // offered a raw "revision_required" to the trainer. statusLabel is
              // the one mapping that is keyed by the enum itself.
              ...OPEN_SUBMISSION_STATES.map((value) => ({
                value,
                label: statusLabel(value, locale),
              })),
            ],
          },
          {
            name: "cohort",
            label: t("trainer.queue.filterCohort"),
            value: cohortId ?? "",
            options: [
              { value: "", label: t("trainer.queue.allCohorts") },
              ...cohorts.map((cohort) => ({ value: cohort.id, label: cohort.name })),
            ],
          },
          {
            name: "sort",
            label: t("trainer.queue.filterSort"),
            value: sort,
            options: [
              { value: "oldest", label: t("trainer.queue.sortOldest") },
              { value: "newest", label: t("trainer.queue.sortNewest") },
            ],
          },
        ]}
      />

      <DataTable
        columns={columns}
        rows={items}
        rowKey={(row) => row.id}
        caption={t("trainer.queue.title")}
        emptyState={
          <EmptyState
            title={t("trainer.queue.emptyTitle")}
            description={t("trainer.queue.emptyText")}
          />
        }
      />

      {pages > 1 && (
        <nav className="mt-6 flex items-center justify-between gap-3" aria-label={t("trainer.queue.title")}>
          <PageLink
            href={pageHref(base, query, page - 1)}
            disabled={page <= 1}
            label={t("trainer.queue.previous")}
          />
          <span className="text-[13px] text-(--color-fg-muted) tabular">
            {t("trainer.queue.page", { page, pages })}
          </span>
          <PageLink
            href={pageHref(base, query, page + 1)}
            disabled={page >= pages}
            label={t("trainer.queue.next")}
          />
        </nav>
      )}
    </>
  );
}

function pageHref(
  base: string,
  query: Record<string, string | string[] | undefined>,
  page: number
): string {
  const next = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (key === "page" || key === "decided" || key === "transferred") continue;
    const single = Array.isArray(value) ? value[0] : value;
    if (single) next.set(key, single);
  }
  next.set("page", String(page));
  return `${base}?${next.toString()}`;
}

function PageLink({ href, disabled, label }: { href: string; disabled: boolean; label: string }) {
  if (disabled) {
    return (
      <span className="inline-flex min-h-11 items-center px-3 text-[15px] text-(--color-fg-subtle)">
        {label}
      </span>
    );
  }
  return (
    <Link
      href={href as Route}
      className="inline-flex min-h-11 items-center rounded-(--radius-md) px-3 text-[15px] font-semibold text-(--color-fg) hover:bg-(--color-surface)"
    >
      {label}
    </Link>
  );
}
