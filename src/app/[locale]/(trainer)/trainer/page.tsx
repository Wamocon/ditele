import type { Metadata } from "next";

import { PageHeader } from "@/shared/layout";
import { ErrorState } from "@/shared/ui";
import { requireRole } from "@/shared/auth/guard";
import { getTrainerOverview } from "@/shared/data/review";
import { TrainerOverviewScreen } from "@/features/review/overview";

export const metadata: Metadata = { title: "Übersicht" };

/** Trainer landing page: how much is waiting and which courses they hold. */
export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  await requireRole(["trainer", "admin"], locale);

  const result = await getTrainerOverview();

  return (
    <>
      <PageHeader
        title="Übersicht"
        description="Ihre offenen Reviews und die Ihnen zugewiesenen Kurse."
      />
      {result.ok ? (
        <TrainerOverviewScreen data={result.data} locale={locale} />
      ) : (
        <ErrorState message={result.error.message} />
      )}
    </>
  );
}
