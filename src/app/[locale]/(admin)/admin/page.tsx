import type { Route } from "next";
import Link from "next/link";
import { BookOpen, ListChecks, Plus } from "lucide-react";
import { PageHeader } from "@/shared/layout";
import { Button, Card, CardTitle, ErrorState, StatusBadge, cn } from "@/shared/ui";
import { requireRole } from "@/shared/auth/guard";
import { getAdminDashboard } from "@/shared/data/content";
import { adminStrings, formatDate } from "@/features/content/i18n";

/**
 * KPI tiles + content status + recent activity.
 * `StatTile` is a Wave 0b component that has not landed — this is the fallback.
 */
function Tile({ label, value, href }: { label: string; value: number; href?: Route }) {
  const body = (
    <>
      <p className="text-[13px] font-semibold leading-4 text-(--color-fg-muted)">{label}</p>
      <p className="tabular mt-1 text-[30px] font-semibold leading-9">{value}</p>
    </>
  );
  return href ? (
    <Card as={Link} interactive className={cn("block")} {...({ href } as { href: Route })}>
      {body}
    </Card>
  ) : (
    <Card>{body}</Card>
  );
}

export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  await requireRole(["admin"], locale);

  const strings = adminStrings(locale);
  const s = strings.dashboard;
  const result = await getAdminDashboard();

  if (!result.ok) {
    return (
      <>
        <PageHeader title={s.title} description={s.subtitle} />
        <ErrorState message={result.error.message} />
      </>
    );
  }

  const data = result.data;

  return (
    <>
      <PageHeader
        title={s.title}
        description={s.subtitle}
        actions={
          <Link href={`/${locale}/admin/courses/new` as Route}>
            <Button iconLeft={<Plus className="size-4" aria-hidden />}>{s.newCourse}</Button>
          </Link>
        }
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        <Tile label={s.users} value={data.users} />
        <Tile label={s.courses} value={data.courses} href={`/${locale}/admin/courses` as Route} />
        <Tile label={s.cohorts} value={data.activeCohorts} href={`/${locale}/admin/groups` as Route} />
        <Tile label={s.pendingReviews} value={data.pendingReviews} />
        <Tile
          label={s.openRequests}
          value={data.openRequests}
          href={`/${locale}/admin/applications` as Route}
        />
        {/* publishedCourses is already visible in the Inhaltsstatus card below. */}
        <Tile
          label={s.openIssues}
          value={data.openIssues}
          href={`/${locale}/admin/issues` as Route}
        />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card className="flex flex-col gap-3">
          <CardTitle>{s.contentStatus}</CardTitle>
          {data.versionsByState.every((entry) => entry.count === 0) ? (
            <p className="text-[13px] text-(--color-fg-muted)">{s.contentStatusEmpty}</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {data.versionsByState.map((entry) => (
                <li key={entry.state} className="flex items-center justify-between gap-3">
                  <StatusBadge state={entry.state} />
                  <span className="tabular text-[18px] font-semibold">{entry.count}</span>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-1 flex flex-wrap gap-2">
            <Link href={`/${locale}/admin/courses` as Route}>
              <Button
                size="sm"
                variant="outline"
                iconLeft={<BookOpen className="size-4" aria-hidden />}
              >
                {s.manageCourses}
              </Button>
            </Link>
            <Link href={`/${locale}/admin/tasks` as Route}>
              <Button
                size="sm"
                variant="outline"
                iconLeft={<ListChecks className="size-4" aria-hidden />}
              >
                {s.taskInventory}
              </Button>
            </Link>
          </div>
        </Card>

        <Card className="flex flex-col gap-3">
          <CardTitle>{s.activity}</CardTitle>
          {data.activityBlocked ? (
            <p className="text-[13px] text-(--color-fg-muted)">{s.activityBlocked}</p>
          ) : data.activity.length === 0 ? (
            <p className="text-[13px] text-(--color-fg-muted)">{s.activityEmpty}</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {data.activity.map((event) => (
                <li
                  key={event.id}
                  className="flex flex-wrap items-baseline justify-between gap-2 border-b border-(--color-border) pb-2 last:border-0 last:pb-0"
                >
                  <span className="text-[13px] font-medium">{event.eventType}</span>
                  <span className="text-[13px] text-(--color-fg-muted)">
                    {event.actorRole} · {formatDate(event.occurredAt, locale)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
