import type { Route } from "next";
import { PageHeader } from "@/shared/layout";
import { Badge, Card, EmptyState, ErrorState, Select } from "@/shared/ui";
import { listSupportIssues } from "@/shared/data/admin";
import { formatDateTime } from "@/features/admin/format";
import { fill, getAdminDict } from "@/features/admin/i18n";
import { IssuePanel } from "@/features/admin/issue-panel";
import { FilterField, FilterForm, Pagination, Section } from "@/features/admin/ui";
import { ISSUE_STATES } from "@/features/admin/action-state";

const PAGE_SIZE = 20;
const SEVERITIES = ["low", "medium", "high", "critical"] as const;

/**
 * `support_issues` has 0 rows and no way to gain one — nothing in the 48 RPCs
 * creates a support issue, and a direct insert is refused by RLS even for an
 * admin (I-003). The learner-facing report form is F56, which is P1.
 *
 * So this screen ships as a real, working inbox that currently renders its empty
 * state. Triage IS wired (UPDATE is granted) and will work the moment rows
 * appear — it is just not exercisable today. The empty state says so rather than
 * implying the admin has simply had no reports.
 */
export default async function IssuesPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  const query = await searchParams;
  const t = await getAdminDict(locale);

  const stateParam = typeof query.state === "string" && query.state !== "" ? query.state : undefined;
  const severityParam =
    typeof query.severity === "string" && query.severity !== "" ? query.severity : undefined;
  const offset = Number.parseInt(typeof query.offset === "string" ? query.offset : "0", 10) || 0;
  const basePath = `/${locale}/admin/issues`;

  const result = await listSupportIssues({
    ...(stateParam ? { state: stateParam } : {}),
    ...(severityParam ? { severity: severityParam } : {}),
    limit: PAGE_SIZE,
    offset,
  });

  if (!result.ok) {
    return (
      <>
        <PageHeader title={t.issues.title} description={t.issues.description} />
        <ErrorState message={result.error.message} />
      </>
    );
  }

  const { rows, total } = result.data;
  const filtered = Boolean(stateParam || severityParam);

  return (
    <>
      <PageHeader
        title={t.issues.title}
        description={t.issues.description}
        breadcrumbs={[
          { label: t.common.administration, href: `/${locale}/admin` },
          { label: t.issues.title },
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
              <Select id="state" name="state" defaultValue={stateParam ?? ""}>
                <option value="">{t.common.filterAll}</option>
                {ISSUE_STATES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </Select>
            </FilterField>
            <FilterField label={t.issues.colSeverity} htmlFor="severity">
              <Select id="severity" name="severity" defaultValue={severityParam ?? ""}>
                <option value="">{t.common.filterAll}</option>
                {SEVERITIES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </Select>
            </FilterField>
          </FilterForm>
        </Card>

        {rows.length === 0 ? (
          <EmptyState
            title={filtered ? t.issues.emptyFiltered : t.issues.emptyTitle}
            {...(filtered ? {} : { description: t.issues.emptyDescription })}
          />
        ) : (
          <ul className="flex flex-col gap-4">
            {rows.map((issue) => (
              <li key={issue.id}>
                <Section
                  title={issue.title}
                  actions={
                    <div className="flex items-center gap-2">
                      <Badge tone={severityTone(issue.severity)}>{issue.severity}</Badge>
                      <Badge tone="neutral" dot>
                        {issue.state}
                      </Badge>
                    </div>
                  }
                >
                  <p className="max-w-prose text-[15px] leading-6">{issue.description}</p>
                  <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
                    <div className="flex flex-col gap-0.5">
                      <dt className="text-[13px] font-semibold leading-4 text-[--color-fg-muted]">
                        {t.issues.colReporter}
                      </dt>
                      <dd className="text-[15px] leading-6">
                        {issue.reporterName ?? t.common.unknownUser}
                      </dd>
                    </div>
                    <div className="flex flex-col gap-0.5">
                      <dt className="text-[13px] font-semibold leading-4 text-[--color-fg-muted]">
                        {t.issues.colCreated}
                      </dt>
                      <dd className="tabular text-[15px] leading-6">
                        {formatDateTime(issue.createdAt, locale) ?? t.common.none}
                      </dd>
                    </div>
                  </dl>
                  <IssuePanel issueId={issue.id} currentState={issue.state} t={t} />
                </Section>
              </li>
            ))}
          </ul>
        )}

        <Pagination
          basePath={basePath}
          params={{
            ...(stateParam ? { state: stateParam } : {}),
            ...(severityParam ? { severity: severityParam } : {}),
          }}
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

function severityTone(severity: string): "danger" | "warning" | "info" | "neutral" {
  if (severity === "critical") return "danger";
  if (severity === "high") return "warning";
  if (severity === "medium") return "info";
  return "neutral";
}
