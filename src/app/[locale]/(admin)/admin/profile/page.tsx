import { PageHeader } from "@/shared/layout";
import { ErrorState } from "@/shared/ui";
import { getOwnProfile } from "@/shared/data/admin";
import { getPrincipal } from "@/shared/data/session";
import { locales } from "@/shared/i18n/config";
import { getAdminDict, roleLabel } from "@/features/admin/i18n";
import { ProfileForm } from "@/features/admin/profile-form";
import { DefinitionList, Section } from "@/features/admin/ui";

export default async function AdminProfilePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getAdminDict(locale);

  const session = await getPrincipal();
  if (!session) {
    return (
      <>
        <PageHeader title={t.profile.title} description={t.profile.description} />
        <ErrorState message={t.common.saveFailed} />
      </>
    );
  }

  const result = await getOwnProfile(session.principal.userId);

  if (!result.ok) {
    return (
      <>
        <PageHeader title={t.profile.title} description={t.profile.description} />
        <ErrorState message={result.error.message} />
      </>
    );
  }

  const profile = result.data;

  return (
    <>
      <PageHeader
        title={t.profile.title}
        description={t.profile.description}
        breadcrumbs={[
          { label: t.common.administration, href: `/${locale}/admin` },
          { label: t.profile.title },
        ]}
      />

      <div className="flex flex-col gap-4">
        <Section title={t.profile.title}>
          <DefinitionList
            items={[
              { label: t.profile.email, value: profile.email ?? t.common.none },
              { label: t.profile.role, value: roleLabel(t, profile.roleCode) },
            ]}
          />
          <p className="text-[13px] leading-5 text-[--color-fg-muted]">{t.profile.emailHint}</p>
        </Section>

        <Section title={t.userDetail.profile}>
          <ProfileForm
            displayName={profile.displayName}
            locale={profile.locale}
            timezone={profile.timezone}
            expectedVersion={profile.rowVersion}
            locales={locales}
            t={t}
          />
        </Section>
      </div>
    </>
  );
}
