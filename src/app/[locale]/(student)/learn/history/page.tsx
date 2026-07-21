import type { Route } from "next";
import Link from "next/link";
import { History } from "lucide-react";
import { PageHeader } from "@/shared/layout";
import { DataTable, EmptyState, ErrorState, type Column } from "@/shared/ui";
import { listMyHistory, type HistoryEvent } from "@/shared/data/profile";
import { LinkButton } from "@/features/questions/components/link-button";
import { getWs3Messages } from "@/features/questions/i18n";
import { formatDateTime } from "@/features/questions/format";

const PAGE_SIZE = 25;

export default async function HistoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ before?: string; at?: string; snapshot?: string }>;
}) {
  const { locale } = await params;
  const { before, at, snapshot } = await searchParams;
  const messages = await getWs3Messages(locale);
  const t = messages.learn.history;

  /**
   * `list_my_learning_history` is the only paginated RPC and it is **keyset**,
   * not offset (RPC_CONTRACTS.md §0.4). `snapshot` is pinned on the first page
   * and carried through every "load older" link so new activity arriving
   * mid-session cannot shift the rows underneath the reader.
   */
  const snapshotAt = snapshot ?? new Date().toISOString();

  const result = await listMyHistory({
    locale,
    limit: PAGE_SIZE,
    snapshotAt,
    ...(before !== undefined ? { beforeEventId: before } : {}),
    ...(at !== undefined ? { beforeOccurredAt: at } : {}),
  });

  if (!result.ok) {
    return (
      <>
        <PageHeader title={t.title} description={t.description} />
        <ErrorState title={messages.learn.shared.loadErrorTitle} message={result.error.message} />
      </>
    );
  }

  const { events, hasMore, nextBeforeEventId, nextBeforeOccurredAt } = result.data;
  const eventLabels: Record<string, string> = t.events;

  /**
   * `course_title` comes back null on the enrolment events that have no cohort
   * context yet (`course_requested`, `course_approved`), while later events for
   * the same course carry it. Reuse the title we already know rather than
   * printing "Unbekannter Kurs" next to a course the learner is plainly in.
   */
  const titleByCourse = new Map<string, string>();
  for (const event of events) {
    if (event.course_id && event.course_title) titleByCourse.set(event.course_id, event.course_title);
  }

  const columns: Column<HistoryEvent>[] = [
    {
      key: "event",
      header: t.columnEvent,
      cell: (row) => (
        <span className="font-semibold">{eventLabels[row.event_kind] ?? t.events.fallback}</span>
      ),
    },
    {
      key: "course",
      header: t.columnCourse,
      cell: (row) =>
        row.course_id ? (
          <Link
            href={`/${locale}/learn/courses/${row.course_id}` as Route}
            className="text-(--color-fg) hover:text-(--color-brand) hover:underline"
          >
            {row.course_title ??
              titleByCourse.get(row.course_id) ??
              messages.learn.shared.unknownCourse}
          </Link>
        ) : (
          <span className="text-(--color-fg-muted)">—</span>
        ),
    },
    {
      key: "task",
      header: t.columnTask,
      cell: (row) =>
        row.task_id ? (
          <Link
            href={`/${locale}/learn/tasks/${row.task_id}` as Route}
            className="text-(--color-fg) hover:text-(--color-brand) hover:underline"
          >
            {row.task_title ?? messages.learn.shared.unknownTask}
          </Link>
        ) : (
          <span className="text-(--color-fg-muted)">—</span>
        ),
    },
    {
      key: "date",
      header: t.columnDate,
      numeric: true,
      cell: (row) => formatDateTime(row.occurred_at, locale),
    },
  ];

  const nextHref =
    hasMore && nextBeforeEventId && nextBeforeOccurredAt
      ? `/${locale}/learn/history?before=${encodeURIComponent(nextBeforeEventId)}&at=${encodeURIComponent(
          nextBeforeOccurredAt
        )}&snapshot=${encodeURIComponent(snapshotAt)}`
      : null;

  return (
    <>
      <PageHeader title={t.title} description={t.description} />

      <DataTable
        columns={columns}
        rows={events}
        rowKey={(row) => row.event_id}
        caption={t.title}
        emptyState={
          <EmptyState
            title={t.emptyTitle}
            description={t.emptyDescription}
            icon={<History className="size-6 text-(--color-fg-subtle)" aria-hidden />}
            action={
              <LinkButton href={`/${locale}/learn/courses`} variant="outline">
                {messages.nav.courses}
              </LinkButton>
            }
          />
        }
      />

      {events.length > 0 && (
        <div className="mt-6 flex flex-col items-center gap-3">
          {nextHref ? (
            <LinkButton href={nextHref} variant="outline">
              {t.loadMore}
            </LinkButton>
          ) : (
            <p className="text-[13px] leading-5 text-(--color-fg-muted)">{t.endOfList}</p>
          )}
          {before && (
            <Link
              href={`/${locale}/learn/history` as Route}
              className="inline-flex min-h-11 items-center text-[13px] font-semibold text-(--color-brand) hover:underline"
            >
              {messages.common.back}
            </Link>
          )}
        </div>
      )}
    </>
  );
}
