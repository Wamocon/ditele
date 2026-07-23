import { PageHeader } from "@/shared/layout";
import { ErrorState } from "@/shared/ui";
import { requireRole } from "@/shared/auth/guard";
import { getProfile } from "@/shared/data/admin";
import { ProfileForm } from "@/features/admin/profile-form";

export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const { principal } = await requireRole(["admin"], locale);

  const result = await getProfile(principal.userId);

  const header = (
    <PageHeader title="Profil" description="Ihr Anzeigename und Avatar." locale={locale} />
  );

  if (!result.ok) {
    return (
      <>
        {header}
        <ErrorState message={result.error.message} />
      </>
    );
  }

  return (
    <>
      {header}
      <ProfileForm locale={locale} profile={result.data} />
    </>
  );
}
