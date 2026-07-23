import { PageHeader } from "@/shared/layout";
import { requireRole } from "@/shared/auth/guard";
import { UserCreateForm } from "@/features/admin/user-create-form";

export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  await requireRole(["admin"], locale);

  return (
    <>
      <PageHeader
        title="Benutzer erstellen"
        description="Legt ein Konto an, das sich sofort anmelden kann."
        breadcrumbs={[
          { label: "Benutzer", href: `/${locale}/admin/users` },
          { label: "Neu" },
        ]}
        locale={locale}
      />
      <UserCreateForm locale={locale} />
    </>
  );
}
