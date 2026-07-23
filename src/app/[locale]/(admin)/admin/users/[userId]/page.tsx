import { PageHeader } from "@/shared/layout";
import { Card, DataTable, ErrorState, type Column } from "@/shared/ui";
import { requireRole } from "@/shared/auth/guard";
import { getProfile } from "@/shared/data/admin";
import { UI_ROLE_LABEL } from "@/shared/auth/role";
import { UserEditForm } from "@/features/admin/user-edit-form";

interface DetailRow {
  label: string;
  value: string;
}

export default async function Page({
  params,
}: {
  params: Promise<{ locale: string; userId: string }>;
}) {
  const { locale, userId } = await params;
  await requireRole(["admin"], locale);

  const result = await getProfile(userId);

  if (!result.ok) {
    return (
      <>
        <PageHeader
          title="Benutzer"
          breadcrumbs={[{ label: "Benutzer", href: `/${locale}/admin/users` }, { label: "Detail" }]}
          locale={locale}
        />
        <ErrorState message={result.error.message} />
      </>
    );
  }

  const profile = result.data;

  const detailRows: DetailRow[] = [
    { label: "Rolle", value: UI_ROLE_LABEL[profile.role] },
    { label: "Sprache", value: profile.locale },
    { label: "Status", value: profile.is_active ? "Aktiv" : "Inaktiv" },
    { label: "Benutzer-ID", value: profile.id },
  ];

  const detailColumns: Column<DetailRow>[] = [
    { key: "label", header: "Feld", cell: (r) => <span className="font-medium">{r.label}</span> },
    { key: "value", header: "Wert", cell: (r) => <span className="text-(--color-fg-muted)">{r.value}</span> },
  ];

  return (
    <>
      <PageHeader
        title={profile.display_name || "Benutzer"}
        breadcrumbs={[
          { label: "Benutzer", href: `/${locale}/admin/users` },
          { label: profile.display_name || "Detail" },
        ]}
        locale={locale}
      />

      <div className="flex flex-col gap-6">
        <Card>
          <DataTable columns={detailColumns} rows={detailRows} rowKey={(r) => r.label} caption="Profil" />
        </Card>

        <UserEditForm locale={locale} profile={profile} />
      </div>
    </>
  );
}
