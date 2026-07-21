import type { Metadata } from "next";
import type { Route } from "next";
import Link from "next/link";
import { Search, X } from "lucide-react";

import { PageHeader } from "@/shared/layout";
import { Button, Input, EmptyState, ErrorState } from "@/shared/ui";
import { listCatalogCourses } from "@/shared/data/catalog";
import { getDict } from "../_lib/i18n";
import { interpolate } from "../_lib/format";
import { CourseCard } from "../_components/course-card";

const PAGE_SIZE = 9;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const dict = getDict(locale);
  return { title: `${dict.public.catalog.title} · DiTeLe`, description: dict.public.catalog.description };
}

export default async function CatalogPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const [{ locale }, query] = await Promise.all([params, searchParams]);
  const dict = getDict(locale);
  const t = dict.public.catalog;

  // The URL holds the state (MASTER_PLAN §13.4) — the search form is a plain
  // GET, so filtering works without a line of client JavaScript.
  const search = (query.q ?? "").trim();
  const page = Math.max(1, Number.parseInt(query.page ?? "1", 10) || 1);

  const result = await listCatalogCourses({
    locale,
    ...(search ? { search } : {}),
    limit: PAGE_SIZE,
    offset: (page - 1) * PAGE_SIZE,
  });

  const total = result.ok ? result.data.total : 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const href = (targetPage: number) => {
    const params = new URLSearchParams();
    if (search) params.set("q", search);
    if (targetPage > 1) params.set("page", String(targetPage));
    const qs = params.toString();
    return `/${locale}/catalog${qs ? `?${qs}` : ""}` as Route;
  };

  return (
    <>
      <PageHeader title={t.title} description={t.description} />

      <form
        method="GET"
        action={`/${locale}/catalog`}
        className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-center"
        role="search"
      >
        <div className="relative flex-1">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-(--color-fg-subtle)"
            aria-hidden
          />
          <Input
            type="search"
            name="q"
            defaultValue={search}
            placeholder={t.searchPlaceholder}
            aria-label={t.searchLabel}
            className="pl-9"
          />
        </div>
        <div className="flex items-center gap-2">
          <Button type="submit" variant="secondary">
            {t.searchSubmit}
          </Button>
          {search && (
            <Link href={`/${locale}/catalog` as Route}>
              <Button variant="ghost" type="button" iconLeft={<X className="size-4" aria-hidden />}>
                {t.reset}
              </Button>
            </Link>
          )}
        </div>
      </form>

      {!result.ok ? (
        <ErrorState title={t.errorTitle} message={t.errorBody} />
      ) : result.data.courses.length === 0 ? (
        search ? (
          <EmptyState
            title={t.emptySearchTitle}
            description={t.emptySearchBody}
            action={
              <Link href={`/${locale}/catalog` as Route}>
                <Button variant="outline">{t.reset}</Button>
              </Link>
            }
          />
        ) : (
          <EmptyState title={t.emptyTitle} description={t.emptyBody} />
        )
      ) : (
        <>
          <p className="tabular mb-4 text-[13px] text-(--color-fg-muted)" aria-live="polite">
            {total === 1 ? t.resultsOne : interpolate(t.resultsMany, { count: total })}
          </p>

          <ul className="stagger grid gap-4 sm:grid-cols-2 lg:grid-cols-3 lg:gap-5">
            {result.data.courses.map((course) => (
              <li key={course.course_id} className="h-full">
                <CourseCard
                  course={course}
                  locale={locale}
                  labels={{
                    open: t.open,
                    tasks: t.tasksLabel,
                    hoursShort: dict.public.units.hoursShort,
                    minutesShort: dict.public.units.minutesShort,
                  }}
                />
              </li>
            ))}
          </ul>

          {pages > 1 && (
            <nav
              className="mt-8 flex items-center justify-between gap-3"
              aria-label={t.title}
            >
              {page > 1 ? (
                <Link href={href(page - 1)}>
                  <Button variant="outline">{t.previous}</Button>
                </Link>
              ) : (
                <span />
              )}

              <p className="tabular text-[13px] text-(--color-fg-muted)">
                {interpolate(t.pageOf, { page, pages })}
              </p>

              {page < pages ? (
                <Link href={href(page + 1)}>
                  <Button variant="outline">{t.next}</Button>
                </Link>
              ) : (
                <span />
              )}
            </nav>
          )}
        </>
      )}
    </>
  );
}
