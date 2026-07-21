import { PageHeader } from "@/shared/layout";
import {
  Badge,
  Card,
  DataTable,
  EmptyState,
  ErrorState,
  type Column,
} from "@/shared/ui";
import { listRatings, type RatingAggregate, type RatingComment } from "@/shared/data/admin";
import { formatAverage, formatDate } from "@/features/admin/format";
import { fill, getAdminDict, type AdminDict } from "@/features/admin/i18n";
import { Pagination, Section } from "@/features/admin/ui";

const PAGE_SIZE = 20;

/**
 * Read-only by design: `ratings` refuses UPDATE even for an admin (42501), so
 * there is no moderation action to offer. Aggregates are sorted worst-first —
 * the top row is the one an admin needs to act on.
 */
export default async function RatingsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  const query = await searchParams;
  const t = await getAdminDict(locale);

  const offset = Number.parseInt(typeof query.offset === "string" ? query.offset : "0", 10) || 0;
  const basePath = `/${locale}/admin/ratings`;

  const result = await listRatings({ limit: PAGE_SIZE, offset });

  if (!result.ok) {
    return (
      <>
        <PageHeader title={t.ratings.title} description={t.ratings.description} />
        <ErrorState message={result.error.message} />
      </>
    );
  }

  const { aggregates, comments } = result.data;

  return (
    <>
      <PageHeader
        title={t.ratings.title}
        description={t.ratings.description}
        breadcrumbs={[
          { label: t.common.administration, href: `/${locale}/admin` },
          { label: t.ratings.title },
        ]}
      />

      {aggregates.length === 0 ? (
        <EmptyState title={t.ratings.emptyTitle} description={t.ratings.emptyDescription} />
      ) : (
        <div className="flex flex-col gap-4">
          <ul className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {aggregates.map((aggregate) => (
              <li key={aggregate.key}>
                <AggregateCard aggregate={aggregate} locale={locale} t={t} />
              </li>
            ))}
          </ul>

          <Section title={t.ratings.comments}>
            <DataTable
              columns={commentColumns(locale, t)}
              rows={comments.rows}
              rowKey={(row) => row.id}
              caption={t.ratings.comments}
              emptyState={<EmptyState title={t.ratings.emptyComments} />}
            />
            <Pagination
              basePath={basePath}
              params={{}}
              total={comments.total}
              limit={PAGE_SIZE}
              offset={offset}
              labels={{
                showing: fill(t.common.showing, {
                  from: comments.total === 0 ? 0 : offset + 1,
                  to: Math.min(offset + PAGE_SIZE, comments.total),
                  total: comments.total,
                }),
                previous: t.common.previous,
                next: t.common.next,
              }}
            />
          </Section>
        </div>
      )}
    </>
  );
}

function AggregateCard({
  aggregate,
  locale,
  t,
}: {
  aggregate: RatingAggregate;
  locale: string;
  t: AdminDict;
}) {
  const max = Math.max(...aggregate.distribution, 1);

  return (
    <Card className="flex h-full flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <span className="text-[18px] font-semibold leading-6">{aggregate.subject}</span>
          <Badge tone={aggregate.kind === "course" ? "brand" : "neutral"}>
            {aggregate.kind === "course" ? t.ratings.kindCourse : t.ratings.kindTask}
          </Badge>
        </div>
        <div className="flex flex-col items-end">
          <span className="tabular text-[30px] font-semibold leading-9">
            {formatAverage(aggregate.average, locale)}
          </span>
          <span className="tabular text-[13px] leading-5 text-[--color-fg-muted]">
            {aggregate.count} {t.ratings.count}
          </span>
        </div>
      </div>

      {/* Distribution, five stars down to one. Width is a percentage of the
          largest bucket, so a small sample still reads clearly. */}
      <div className="flex flex-col gap-1.5">
        {[5, 4, 3, 2, 1].map((stars) => {
          const value = aggregate.distribution[stars - 1] ?? 0;
          return (
            <div key={stars} className="flex items-center gap-2">
              <span className="tabular w-10 shrink-0 text-[13px] leading-5 text-[--color-fg-muted]">
                {stars} ★
              </span>
              <span className="h-2 flex-1 overflow-hidden rounded-full bg-[--color-surface-2]">
                <span
                  className="block h-full rounded-full bg-[--color-brand]"
                  style={{ width: `${(value / max) * 100}%` }}
                />
              </span>
              <span className="tabular w-6 shrink-0 text-right text-[13px] leading-5 text-[--color-fg-muted]">
                {value}
              </span>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function commentColumns(locale: string, t: AdminDict): Column<RatingComment>[] {
  return [
    {
      key: "subject",
      header: t.ratings.colSubject,
      cell: (row) => <span className="font-semibold">{row.subject}</span>,
    },
    {
      key: "score",
      header: t.ratings.colScore,
      numeric: true,
      cell: (row) => (
        <span>
          {row.score} <span aria-hidden>★</span>
        </span>
      ),
    },
    {
      key: "comment",
      header: t.ratings.colComment,
      cell: (row) => <span className="max-w-prose">{row.comment}</span>,
    },
    {
      key: "learner",
      header: t.ratings.colLearner,
      cell: (row) => <span className="text-[--color-fg-muted]">{row.learnerName}</span>,
    },
    {
      key: "date",
      header: t.ratings.colDate,
      numeric: true,
      cell: (row) => formatDate(row.createdAt, locale) ?? t.common.none,
    },
  ];
}
