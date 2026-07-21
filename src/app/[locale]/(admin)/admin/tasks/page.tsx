import type { Route } from "next";
import Link from "next/link";
import { PageHeader } from "@/shared/layout";
import { Badge, DataTable, EmptyState, ErrorState, StatusBadge, type Column } from "@/shared/ui";
import { requireRole } from "@/shared/auth/guard";
import { listAdminTasks } from "@/shared/data/content";
import { adminStrings } from "@/features/content/i18n";
import { ListFilters } from "@/features/content/components/list-filters";
import { Pager } from "@/features/content/components/pager";
import { TASK_KINDS, type TaskInventoryRow } from "@/features/content/model";

const PAGE_SIZE = 25;

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
  const s = strings.taskInventory;
  const page = Math.max(1, Number(pageParam) || 1);

  const result = await listAdminTasks({
    locale,
    search: q ?? "",
    kind: filter ?? "",
    limit: PAGE_SIZE,
    offset: (page - 1) * PAGE_SIZE,
  });

  const header = <PageHeader title={s.title} description={s.subtitle} />;

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

  const kindLabel = (kind: string): string =>
    kind === "practical"
      ? strings.studio.taskKindPractical
      : kind === "placement"
        ? strings.studio.taskKindPlacement
        : strings.studio.taskKindKnowledge;

  const columns: Column<TaskInventoryRow>[] = [
    {
      key: "title",
      header: s.columnTask,
      cell: (row) =>
        row.versionId ? (
          <Link
            href={`/${locale}/admin/courses/${row.courseId}/versions/${row.versionId}` as Route}
            className="font-medium hover:text-[--color-brand] hover:underline"
          >
            {row.title}
          </Link>
        ) : (
          <span className="font-medium">{row.title}</span>
        ),
    },
    {
      key: "course",
      header: s.columnCourse,
      cell: (row) => (
        <Link
          href={`/${locale}/admin/courses/${row.courseId}` as Route}
          className="text-[13px] text-[--color-fg-muted] hover:text-[--color-brand] hover:underline"
        >
          {row.courseTitle}
        </Link>
      ),
    },
    {
      key: "stage",
      header: s.columnStage,
      cell: (row) => <span className="text-[13px] text-[--color-fg-muted]">{row.stageTitle}</span>,
    },
    {
      key: "kind",
      header: s.columnKind,
      cell: (row) => (
        <Badge tone={row.kind === "practical" ? "brand" : "neutral"}>{kindLabel(row.kind)}</Badge>
      ),
    },
    { key: "state", header: s.columnState, cell: (row) => <StatusBadge state={row.state} /> },
    {
      key: "version",
      header: s.columnVersion,
      cell: (row) =>
        row.versionState ? (
          <span className="flex flex-wrap items-center gap-2">
            <span className="tabular text-[13px]">v{row.versionNumber}</span>
            <StatusBadge state={row.versionState} />
          </span>
        ) : (
          <span className="text-[13px] text-[--color-fg-muted]">{strings.shared.never}</span>
        ),
    },
    {
      key: "minutes",
      header: s.columnMinutes,
      numeric: true,
      cell: (row) => row.expectedMinutes ?? strings.shared.never,
    },
  ];

  return (
    <>
      {header}

      <ListFilters
        basePath={`/${locale}/admin/tasks`}
        searchLabel={s.search}
        searchValue={q ?? ""}
        filterLabel={s.filterKind}
        filterValue={filter ?? ""}
        allLabel={strings.shared.filterAll}
        submitLabel={s.search}
        filterOptions={TASK_KINDS.map((value) => ({ value, label: kindLabel(value) }))}
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
          />
        }
      />

      <Pager
        basePath={`/${locale}/admin/tasks`}
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
