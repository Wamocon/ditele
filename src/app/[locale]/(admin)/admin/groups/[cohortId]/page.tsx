import type { Route } from "next";
import Link from "next/link";
import { PageHeader } from "@/shared/layout";
import { Badge, DataTable, EmptyState, ErrorState, StatusBadge, type Column } from "@/shared/ui";
import { COHORT_TRANSITIONS, getCohort, type CohortMember } from "@/shared/data/admin";
import { LifecyclePanel, SchedulePanel } from "@/features/admin/cohort-panels";
import { formatDate, toDateTimeLocalValue } from "@/features/admin/format";
import { getAdminDict, type AdminDict } from "@/features/admin/i18n";
import { DefinitionList, Section } from "@/features/admin/ui";

export default async function GroupDetailPage({
  params,
}: {
  params: Promise<{ locale: string; cohortId: string }>;
}) {
  const { locale, cohortId } = await params;
  const t = await getAdminDict(locale);
  const result = await getCohort(cohortId);

  const breadcrumbs = [
    { label: t.common.administration, href: `/${locale}/admin` },
    { label: t.groups.title, href: `/${locale}/admin/groups` },
  ];

  if (!result.ok) {
    return (
      <>
        <PageHeader
          title={t.groupDetail.title}
          breadcrumbs={[...breadcrumbs, { label: t.groupDetail.title }]}
        />
        {result.error.code === "PGRST116" ? (
          <EmptyState
            title={t.groupDetail.notFound}
            action={
              <Link
                href={`/${locale}/admin/groups` as Route}
                className="text-(--color-brand) underline underline-offset-4"
              >
                {t.groupNew.backToGroups}
              </Link>
            }
          />
        ) : (
          <ErrorState message={result.error.message} />
        )}
      </>
    );
  }

  const { cohort, members } = result.data;
  const transitions = (COHORT_TRANSITIONS[cohort.state] ?? []).map((target) => ({
    target,
    label:
      target === "active"
        ? t.groupDetail.toActive
        : target === "completed"
          ? t.groupDetail.toCompleted
          : t.groupDetail.toCancelled,
  }));

  return (
    <>
      <PageHeader
        title={cohort.name}
        description={cohort.courseTitle}
        breadcrumbs={[...breadcrumbs, { label: cohort.name }]}
        actions={<StatusBadge state={cohort.state} />}
      />

      <div className="flex flex-col gap-4">
        <Section title={t.groupDetail.title}>
          <DefinitionList
            items={[
              { label: t.groupDetail.course, value: cohort.courseTitle },
              { label: t.groupDetail.progression, value: cohort.progressionMode },
              { label: t.groupDetail.capacity, value: cohort.capacity ?? t.common.none },
              {
                label: t.groupDetail.startsAt,
                value: formatDate(cohort.startsAt, locale) ?? t.common.none,
              },
              {
                label: t.groupDetail.endsAt,
                value: formatDate(cohort.endsAt, locale) ?? t.common.none,
              },
              {
                label: t.groups.colMembers,
                value: `${cohort.learnerCount} ${t.groups.learners} · ${cohort.trainerCount} ${t.groups.trainers}`,
              },
            ]}
          />
        </Section>

        <Section title={t.groupDetail.lifecycle}>
          <LifecyclePanel cohortId={cohort.id} options={transitions} t={t} />
        </Section>

        <Section title={t.groupDetail.schedule}>
          <SchedulePanel
            cohortId={cohort.id}
            name={cohort.name}
            capacity={cohort.capacity}
            startsAt={toDateTimeLocalValue(cohort.startsAt)}
            endsAt={toDateTimeLocalValue(cohort.endsAt)}
            t={t}
          />
        </Section>

        <Section title={t.groupDetail.members} description={t.groupDetail.membersReadOnly}>
          <DataTable
            columns={memberColumns(locale, t)}
            rows={members}
            rowKey={(row) => row.userId}
            caption={t.groupDetail.members}
            emptyState={<EmptyState title={t.groupDetail.emptyMembers} />}
          />
          {/* I-012: no insert path on cohort_memberships, so no trainer picker. */}
          <p className="pt-3 text-[13px] leading-5 text-(--color-fg-muted)">
            {t.groupDetail.trainerBlocked}
          </p>
        </Section>
      </div>
    </>
  );
}

function memberColumns(locale: string, t: AdminDict): Column<CohortMember>[] {
  return [
    {
      key: "name",
      header: t.groupDetail.colMember,
      cell: (row) => (
        <Link
          href={`/${locale}/admin/users/${row.userId}` as Route}
          className="font-semibold text-(--color-brand) hover:underline"
        >
          {row.displayName}
        </Link>
      ),
    },
    {
      key: "role",
      header: t.groupDetail.colRole,
      cell: (row) => (
        <Badge tone={row.role === "trainer" ? "info" : "neutral"}>
          {row.role === "trainer" ? t.groupDetail.roleTrainer : t.groupDetail.roleLearner}
        </Badge>
      ),
    },
    {
      key: "state",
      header: t.groupDetail.colState,
      cell: (row) => <StatusBadge state={row.state} />,
    },
    {
      key: "since",
      header: t.groupDetail.colSince,
      numeric: true,
      cell: (row) => formatDate(row.assignedAt, locale) ?? t.common.none,
    },
  ];
}
