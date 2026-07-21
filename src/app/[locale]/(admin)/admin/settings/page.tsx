import { PageHeader } from "@/shared/layout";
import { Badge, DataTable, ErrorState, type Column } from "@/shared/ui";
import { getPlatformInfo, listRoles, type RoleOption } from "@/shared/data/admin";
import { getServerEnvironment } from "@/shared/config/server-env";
import { APP_ROLES, type AppRole } from "@/shared/auth/types";
import { toUiRole, UI_ROLE_LABEL } from "@/shared/auth/role";
import { getAdminDict, roleLabel, type AdminDict } from "@/features/admin/i18n";
import { DefinitionList, Section } from "@/features/admin/ui";

/**
 * Read-only by design (the cut list in 02_WORKSTREAMS §8 makes settings "a static
 * info page"). Nothing here is configurable through the database, so a form
 * would be a lie. The value is the roles reference: it is the one place the
 * 8→3 role mapping is visible to a human, and it is rendered from `toUiRole`
 * itself rather than a second copy of the table.
 */
export default async function SettingsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getAdminDict(locale);

  const [infoResult, rolesResult] = await Promise.all([getPlatformInfo(), listRoles()]);
  const env = getServerEnvironment();

  if (!infoResult.ok) {
    return (
      <>
        <PageHeader title={t.settings.title} description={t.settings.description} />
        <ErrorState message={infoResult.error.message} />
      </>
    );
  }

  const info = infoResult.data;
  const roles = rolesResult.ok ? rolesResult.data : [];

  return (
    <>
      <PageHeader
        title={t.settings.title}
        description={t.settings.description}
        breadcrumbs={[
          { label: t.common.administration, href: `/${locale}/admin` },
          { label: t.settings.title },
        ]}
      />

      <div className="flex flex-col gap-4">
        <Section title={t.settings.organization}>
          <DefinitionList
            items={[
              { label: t.settings.orgName, value: info.organizationName },
              { label: t.settings.orgSlug, value: info.organizationSlug },
              {
                label: t.settings.orgState,
                value: <Badge tone="success">{info.organizationState}</Badge>,
              },
            ]}
          />
        </Section>

        <Section title={t.settings.counts}>
          <DefinitionList
            items={[
              {
                label: t.settings.courses,
                value: <span className="tabular">{info.courseCount}</span>,
              },
              {
                label: t.settings.cohorts,
                value: <span className="tabular">{info.cohortCount}</span>,
              },
              {
                label: t.settings.users,
                value: <span className="tabular">{info.userCount}</span>,
              },
            ]}
          />
        </Section>

        <Section title={t.settings.roles} description={t.settings.rolesHint}>
          <DataTable
            columns={roleColumns(t)}
            rows={roles.filter((r) => isAppRole(r.code))}
            rowKey={(row) => row.id}
            caption={t.settings.roles}
          />
        </Section>

        <Section title={t.settings.providers} description={t.settings.providersHint}>
          <DefinitionList
            items={[
              {
                label: t.settings.providerAi,
                value: <ProviderBadge value={env.DITELE_AI_PROVIDER} t={t} />,
              },
              {
                label: t.settings.providerLab,
                value: <ProviderBadge value={env.DITELE_LAB_PROVIDER} t={t} />,
              },
              {
                label: t.settings.providerIntegration,
                value: <ProviderBadge value={env.DITELE_INTEGRATION_PROVIDER} t={t} />,
              },
            ]}
          />
        </Section>
      </div>
    </>
  );
}

function ProviderBadge({ value, t }: { value: string; t: AdminDict }) {
  return (
    <Badge tone="neutral" dot>
      {value === "disabled" ? t.settings.disabled : value}
    </Badge>
  );
}

function isAppRole(code: string): boolean {
  return APP_ROLES.some((r) => r === code);
}

function roleColumns(t: AdminDict): Column<RoleOption>[] {
  return [
    {
      key: "code",
      header: t.settings.colRoleCode,
      cell: (row) => (
        <span className="flex flex-col">
          <span className="font-semibold">{roleLabel(t, row.code)}</span>
          <span className="text-[13px] text-[--color-fg-muted]">{row.code}</span>
        </span>
      ),
    },
    {
      key: "uiRole",
      header: t.settings.colUiRole,
      // Rendered from the real mapping, so this table can never drift from it.
      cell: (row) => <Badge tone="brand">{UI_ROLE_LABEL[toUiRole([row.code as AppRole])]}</Badge>,
    },
  ];
}
