import { PageHeader } from "@/shared/layout";
import { ErrorState } from "@/shared/ui";
import { requireRole } from "@/shared/auth/guard";
import { listBadges } from "@/shared/data/admin";
import { BadgesManager } from "@/features/admin/badges-manager";

export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  await requireRole(["admin"], locale);

  const result = await listBadges();

  const header = (
    <PageHeader
      title="Badges"
      description="Auszeichnungen, die für angenommene Arena-Aufgaben vergeben werden."
      locale={locale}
    />
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
      <BadgesManager locale={locale} badges={result.data} />
    </>
  );
}
