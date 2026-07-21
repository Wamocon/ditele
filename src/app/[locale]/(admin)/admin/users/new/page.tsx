import { PageHeader } from "@/shared/layout";
import { ErrorState } from "@/shared/ui";
import { listRoles } from "@/shared/data/admin";
import { CreateUserForm } from "@/features/admin/create-user-form";
import { getAdminDict } from "@/features/admin/i18n";
import { Section } from "@/features/admin/ui";

export default async function NewUserPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getAdminDict(locale);
  const rolesResult = await listRoles();

  return (
    <>
      <PageHeader
        title={t.userNew.title}
        description={t.userNew.description}
        breadcrumbs={[
          { label: t.common.administration, href: `/${locale}/admin` },
          { label: t.users.title, href: `/${locale}/admin/users` },
          { label: t.userNew.title },
        ]}
      />

      {rolesResult.ok ? (
        <Section title={t.userNew.title}>
          <CreateUserForm roles={rolesResult.data} locale={locale} t={t} />
        </Section>
      ) : (
        <ErrorState message={rolesResult.error.message} />
      )}
    </>
  );
}
