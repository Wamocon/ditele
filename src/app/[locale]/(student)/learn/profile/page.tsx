import type { Metadata } from "next";
import { PageHeader } from "@/shared/layout";
import { ErrorState } from "@/shared/ui";
import { getMyProfile } from "@/shared/data/learning";
import { ProfileView } from "@/features/learning/profile-view";

export const metadata: Metadata = { title: "Profil · DiTeLe" };

export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const result = await getMyProfile();

  if (!result.ok) {
    return (
      <>
        <PageHeader title="Profil" locale={locale} />
        <ErrorState error={result.error} locale={locale} />
      </>
    );
  }

  return <ProfileView locale={locale} profile={result.data} />;
}
