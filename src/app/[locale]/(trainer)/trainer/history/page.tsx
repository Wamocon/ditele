import type { Metadata } from "next";
import type { Route } from "next";
import Link from "next/link";
import { PageHeader } from "@/shared/layout";
import { DataTable, EmptyState, ErrorState, StatusBadge, type Column } from "@/shared/ui";
import { requireRole } from "@/shared/auth/guard";
import { listReviewHistory, type HistoryEntry } from "@/shared/data/review";
import { getTranslator } from "@/features/review/i18n";
import { formatCount, formatDateTime } from "@/features/review/format";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslator(locale);
  return { title: t("trainer.history.title") };
}

const PAGE_SIZE = 25;

/**
 * Decisions only. `submission_transfers` is not exposed through PostgREST
 * (ISSUES.md I-019), so a transfer leaves no row this screen can show.
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
  const rawPage = Array.isArray(query.page) ? query.page[0] : query.page;
  const page = Math.max(1, Number(rawPage ?? 1) || 1);

  const result = await listReviewHistory({
    locale,
    limit: PAGE_SIZE,
    offset: (page - 1) * PAGE_SIZE,
  });

  if (!result.ok) {
    return (
      <>
        <PageHeader title={t("trainer.history.title")} description={t("trainer.history.description")} />
        <ErrorState message={result.error.message} />
      </>
    );
  }

  const { items, total } = result.data;
  const base = `/${locale}/trainer/history`;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const columns: Column<HistoryEntry>[] = [
    {
      key: "decided",
      header: t("trainer.history.decidedAt"),
      cell: (row) => formatDateTime(row.createdAt, locale),
    },
    { key: "learner", header: t("trainer.shared.learner"), cell: (row) => row.learnerName },
    { key: "task", header: t("trainer.shared.task"), cell: (row) => row.taskTitle, hideOnMobile: true },
    {
      key: "decision",
      header: t("trainer.history.decision"),
      cell: (row) => <StatusBadge state={row.decision} />,
    },
    {
      key: "points",
      header: t("trainer.history.points"),
      numeric: true,
      cell: (row) => (row.points === null ? "—" : row.points),
    },
    {
      key: "reviewer",
      header: t("trainer.history.reviewer"),
      cell: (row) => row.reviewerName,
      hideOnMobile: true,
    },
    {
      key: "open",
      header: t("trainer.history.openSubmission"),
      cell: (row) => (
        <Link
          href={`/${locale}/trainer/submissions/${row.submissionId}` as Route}
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
        title={t("trainer.history.title")}
        description={t("trainer.history.description")}
        actions={
          <span className="text-[13px] text-(--color-fg-muted) tabular">
            {formatCount(total, t)}
          </span>
        }
      />

      <DataTable
        columns={columns}
        rows={items}
        rowKey={(row) => row.id}
        caption={t("trainer.history.title")}
        emptyState={
          <EmptyState
            title={t("trainer.history.emptyTitle")}
            description={t("trainer.history.emptyText")}
          />
        }
      />

      {items.length > 0 && (
        <ul className="mt-6 flex flex-col gap-3">
          {items.map((entry) => (
            <li key={`${entry.id}-comment`} className="flex flex-col gap-1">
              <span className="text-[13px] font-semibold text-(--color-fg-muted)">
                {entry.learnerName} · {formatDateTime(entry.createdAt, locale)}
              </span>
              <p className="max-w-[68ch] whitespace-pre-wrap text-[15px] leading-6">{entry.comment}</p>
            </li>
          ))}
        </ul>
      )}

      {pages > 1 && (
        <nav className="mt-6 flex items-center justify-between gap-3" aria-label={t("trainer.history.title")}>
          <PageLink href={`${base}?page=${page - 1}`} disabled={page <= 1} label={t("trainer.queue.previous")} />
          <span className="text-[13px] text-(--color-fg-muted) tabular">
            {t("trainer.queue.page", { page, pages })}
          </span>
          <PageLink href={`${base}?page=${page + 1}`} disabled={page >= pages} label={t("trainer.queue.next")} />
        </nav>
      )}
    </>
  );
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
