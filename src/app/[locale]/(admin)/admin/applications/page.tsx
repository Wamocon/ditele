import type { Route } from "next";
import { PageHeader } from "@/shared/layout";
import { Card, EmptyState, ErrorState, Select, StatusBadge, statusLabel } from "@/shared/ui";
import {
  ENROLLMENT_STATES,
  listCohorts,
  listEnrollmentApplications,
  parseEnrollmentState,
} from "@/shared/data/admin";
import { ApplicationPanel } from "@/features/admin/application-panel";
import { formatDateTime } from "@/features/admin/format";
import { fill, getAdminDict } from "@/features/admin/i18n";
import { FilterField, FilterForm, Pagination, Section } from "@/features/admin/ui";

/**
 * WS-6 route 1. Built first: WF-1 is blocked without it, and WS-1 and WS-3
 * cannot test enrolment end to end until an admin can approve a request.
 */

const PAGE_SIZE = 10;

export default async function ApplicationsPage({
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
  const state = parseEnrollmentState(stateParam);
  const offset = Number.parseInt(typeof query.offset === "string" ? query.offset : "0", 10) || 0;
  const basePath = `/${locale}/admin/applications`;

  const [applicationsResult, cohortsResult] = await Promise.all([
    listEnrollmentApplications({
      ...(state ? { state } : {}),
      limit: PAGE_SIZE,
      offset,
    }),
    listCohorts({ limit: 200 }),
  ]);

  if (!applicationsResult.ok) {
    return (
      <>
        <PageHeader title={t.applications.title} description={t.applications.description} />
        <ErrorState message={applicationsResult.error.message} />
      </>
    );
  }

  const { rows, total } = applicationsResult.data;
  // Only a live cohort can take a new member.
  const cohorts = cohortsResult.ok
    ? cohortsResult.data.rows
        .filter((c) => c.state === "waiting" || c.state === "active")
        .map((c) => ({ id: c.id, name: c.name, courseId: c.courseId }))
    : [];

  return (
    <>
      <PageHeader
        title={t.applications.title}
        description={t.applications.description}
        breadcrumbs={[
          { label: t.common.administration, href: `/${locale}/admin` },
          { label: t.applications.title },
        ]}
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
                {ENROLLMENT_STATES.map((s) => (
                  <option key={s} value={s}>
                    {statusLabel(s)}
                  </option>
                ))}
              </Select>
            </FilterField>
          </FilterForm>
        </Card>

        {rows.length === 0 ? (
          <EmptyState
            title={state ? t.applications.emptyFiltered : t.applications.emptyTitle}
            {...(state ? {} : { description: t.applications.emptyDescription })}
          />
        ) : (
          <ul className="flex flex-col gap-4">
            {rows.map((row) => (
              <li key={row.id}>
                <Section
                  title={row.learnerName}
                  description={row.courseTitle}
                  actions={<StatusBadge state={row.state} />}
                >
                  <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
                    <div className="flex flex-col gap-0.5">
                      <dt className="text-[13px] font-semibold leading-4 text-(--color-fg-muted)">
                        {t.applications.colRequested}
                      </dt>
                      <dd className="tabular text-[15px] leading-6">
                        {formatDateTime(row.createdAt, locale) ?? t.common.none}
                      </dd>
                    </div>
                    <div className="flex flex-col gap-0.5">
                      <dt className="text-[13px] font-semibold leading-4 text-(--color-fg-muted)">
                        {t.applications.colCohort}
                      </dt>
                      <dd className="text-[15px] leading-6">{row.cohortName ?? t.common.none}</dd>
                    </div>
                    {row.requestNote && (
                      <div className="flex flex-col gap-0.5 sm:col-span-2">
                        <dt className="text-[13px] font-semibold leading-4 text-(--color-fg-muted)">
                          {t.applications.note}
                        </dt>
                        <dd className="max-w-prose text-[15px] leading-6">{row.requestNote}</dd>
                      </div>
                    )}
                    {row.decisionReason && (
                      <div className="flex flex-col gap-0.5 sm:col-span-2">
                        <dt className="text-[13px] font-semibold leading-4 text-(--color-fg-muted)">
                          {t.applications.reason}
                        </dt>
                        <dd className="max-w-prose text-[15px] leading-6">{row.decisionReason}</dd>
                      </div>
                    )}
                  </dl>

                  <ApplicationPanel
                    enrollmentId={row.id}
                    state={row.state}
                    courseId={row.courseId}
                    cohorts={cohorts}
                    t={t.applications}
                  />
                </Section>
              </li>
            ))}
          </ul>
        )}

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
      </div>
    </>
  );
}
