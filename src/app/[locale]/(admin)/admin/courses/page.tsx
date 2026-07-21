import type { Route } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { PageHeader } from "@/shared/layout";
import {
  Button,
  DataTable,
  EmptyState,
  ErrorState,
  StatusBadge,
  statusLabel,
  type Column,
} from "@/shared/ui";
import { requireRole } from "@/shared/auth/guard";
import { listAdminCourses } from "@/shared/data/content";
import { adminStrings, formatDate } from "@/features/content/i18n";
import { ListFilters } from "@/features/content/components/list-filters";
import { Pager } from "@/features/content/components/pager";
import type { AdminCourseRow, RecordState } from "@/features/content/model";

const PAGE_SIZE = 20;
const COURSE_STATES: RecordState[] = ["draft", "active", "inactive", "archived"];

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ q?: string; filter?: string; page?: string }>;
}) {
  const { locale } = await params;
  const { q, filter, page: pageParam } = await searchParams;
  await requireRole(["admin"], locale);

  const strings = adminStrings(locale);
  const s = strings.courses;
  const page = Math.max(1, Number(pageParam) || 1);

  const result = await listAdminCourses({
    locale,
    search: q ?? "",
    state: filter ?? "",
    limit: PAGE_SIZE,
    offset: (page - 1) * PAGE_SIZE,
  });

  const header = (
    <PageHeader
      title={s.title}
      description={s.subtitle}
      actions={
        <Link href={`/${locale}/admin/courses/new` as Route}>
          <Button iconLeft={<Plus className="size-4" aria-hidden />}>{s.new}</Button>
        </Link>
      }
    />
  );

  if (!result.ok) {
    return (
      <>
        {header}
        <ErrorState message={result.error.message} />
      </>
    );
  }

  const { rows, total } = result.data;
  const filtering = Boolean(q?.trim() || filter);

  const columns: Column<AdminCourseRow>[] = [
    {
      key: "title",
      header: s.columnTitle,
      cell: (row) => (
        <Link
          href={`/${locale}/admin/courses/${row.id}` as Route}
          className="font-medium hover:text-(--color-brand) hover:underline"
        >
          {row.title}
        </Link>
      ),
    },
    {
      key: "slug",
      header: s.columnSlug,
      cell: (row) => <span className="text-[13px] text-(--color-fg-muted)">{row.slug}</span>,
    },
    { key: "state", header: s.columnState, cell: (row) => <StatusBadge state={row.state} /> },
    {
      key: "latest",
      header: s.columnLatest,
      cell: (row) =>
        row.latestVersionState ? (
          <span className="flex flex-wrap items-center gap-2">
            <span className="tabular text-[13px]">v{row.latestVersionNumber}</span>
            <StatusBadge state={row.latestVersionState} />
          </span>
        ) : (
          <span className="text-[13px] text-(--color-fg-muted)">{s.noVersion}</span>
        ),
    },
    {
      key: "versions",
      header: s.columnVersions,
      numeric: true,
      cell: (row) => row.versionCount,
    },
    { key: "tasks", header: s.columnTasks, numeric: true, cell: (row) => row.taskCount },
    {
      key: "updated",
      header: s.columnUpdated,
      cell: (row) => (
        <span className="text-[13px] text-(--color-fg-muted)">
          {formatDate(row.updatedAt, locale)}
        </span>
      ),
    },
  ];

  return (
    <>
      {header}

      <ListFilters
        basePath={`/${locale}/admin/courses`}
        searchLabel={s.search}
        searchValue={q ?? ""}
        filterLabel={s.filterState}
        filterValue={filter ?? ""}
        allLabel={strings.shared.filterAll}
        submitLabel={s.search}
        // `statusLabel` is the one DB-state → German mapping (WS-0). Never a second one.
        filterOptions={COURSE_STATES.map((value) => ({ value, label: statusLabel(value) }))}
      />

      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(row) => row.id}
        caption={s.title}
        emptyState={
          <EmptyState
            title={filtering ? s.emptyFilteredTitle : s.emptyTitle}
            description={filtering ? s.emptyFilteredDescription : s.emptyDescription}
            action={
              filtering ? undefined : (
                <Link href={`/${locale}/admin/courses/new` as Route}>
                  <Button>{s.new}</Button>
                </Link>
              )
            }
          />
        }
      />

      <Pager
        basePath={`/${locale}/admin/courses`}
        query={{ q, filter }}
        page={page}
        pageSize={PAGE_SIZE}
        total={total}
        previousLabel={strings.shared.previous}
        nextLabel={strings.shared.next}
      />
    </>
  );
}
