import type { Route } from "next";
import Link from "next/link";
import { PageHeader } from "@/shared/layout";
import {
  Card,
  DataTable,
  EmptyState,
  ErrorState,
  Select,
  StatusBadge,
  statusLabel,
  type Column,
} from "@/shared/ui";
import { COHORT_STATES, listCohorts, parseCohortState, type AdminCohort } from "@/shared/data/admin";
import { formatDate } from "@/features/admin/format";
import { fill, getAdminDict, type AdminDict } from "@/features/admin/i18n";
import { FilterField, FilterForm, Pagination } from "@/features/admin/ui";

const PAGE_SIZE = 25;

export default async function GroupsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  const query = await searchParams;
  const t = await getAdminDict(locale);

  const stateParam = typeof query.state === "string" ? query.state : undefined;
  const state = parseCohortState(stateParam);
  const offset = Number.parseInt(typeof query.offset === "string" ? query.offset : "0", 10) || 0;
  const basePath = `/${locale}/admin/groups`;

  const result = await listCohorts({
    ...(state ? { state } : {}),
    limit: PAGE_SIZE,
    offset,
  });

  if (!result.ok) {
    return (
      <>
        <PageHeader title={t.groups.title} description={t.groups.description} />
        <ErrorState message={result.error.message} />
      </>
    );
  }

  const { rows, total } = result.data;

  return (
    <>
      <PageHeader
        title={t.groups.title}
        description={t.groups.description}
        breadcrumbs={[
          { label: t.common.administration, href: `/${locale}/admin` },
          { label: t.groups.title },
        ]}
        actions={
          <Link
            href={`${basePath}/new` as Route}
            className="inline-flex h-11 min-h-11 items-center rounded-(--radius-md) border border-(--color-border-strong) px-4 text-[15px] font-semibold hover:bg-(--color-surface)"
          >
            {t.groups.create}
          </Link>
        }
      />

      <div className="flex flex-col gap-4">
        <Card>
          <FilterForm
            action={basePath}
            submitLabel={t.common.apply}
            resetHref={basePath as Route}
            resetLabel={t.common.reset}
          >
            <FilterField label={t.common.filterState} htmlFor="state">
              <Select id="state" name="state" defaultValue={state ?? ""}>
                <option value="">{t.common.filterAll}</option>
                {COHORT_STATES.map((s) => (
                  <option key={s} value={s}>
                    {statusLabel(s)}
                  </option>
                ))}
              </Select>
            </FilterField>
          </FilterForm>
        </Card>

        <Card>
          <DataTable
            columns={cohortColumns(locale, t)}
            rows={rows}
            rowKey={(row) => row.id}
            caption={t.groups.title}
            emptyState={
              <EmptyState title={t.groups.emptyTitle} description={t.groups.emptyDescription} />
            }
          />

          <Pagination
            basePath={basePath}
            params={{ ...(stateParam ? { state: stateParam } : {}) }}
            total={total}
            limit={PAGE_SIZE}
            offset={offset}
            labels={{
              showing: fill(t.common.showing, {
                from: total === 0 ? 0 : offset + 1,
                to: Math.min(offset + PAGE_SIZE, total),
                total,
              }),
              previous: t.common.previous,
              next: t.common.next,
            }}
          />
        </Card>
      </div>
    </>
  );
}

function cohortColumns(locale: string, t: AdminDict): Column<AdminCohort>[] {
  return [
    {
      key: "name",
      header: t.groups.colName,
      cell: (row) => (
        <Link
          href={`/${locale}/admin/groups/${row.id}` as Route}
          className="font-semibold text-(--color-brand) hover:underline"
        >
          {row.name}
        </Link>
      ),
    },
    {
      key: "course",
      header: t.groups.colCourse,
      cell: (row) => <span className="text-(--color-fg-muted)">{row.courseTitle}</span>,
    },
    { key: "state", header: t.groups.colState, cell: (row) => <StatusBadge state={row.state} /> },
    {
      key: "members",
      header: t.groups.colMembers,
      numeric: true,
      cell: (row) => (
        <span>
          {row.learnerCount} {t.groups.learners} · {row.trainerCount} {t.groups.trainers}
        </span>
      ),
    },
    {
      key: "start",
      header: t.groups.colStart,
      numeric: true,
      cell: (row) => formatDate(row.startsAt, locale) ?? t.common.none,
    },
  ];
}
