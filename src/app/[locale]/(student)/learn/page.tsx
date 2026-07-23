import type { Metadata } from "next";
import { PageHeader } from "@/shared/layout";
import { ErrorState } from "@/shared/ui";
import { getStudentDashboard } from "@/shared/data/learning";
import { DashboardView } from "@/features/learning/dashboard-view";

export const metadata: Metadata = { title: "Start · DiTeLe" };

export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const result = await getStudentDashboard();

  if (!result.ok) {
    return (
      <>
        <PageHeader title="Start" locale={locale} />
        <ErrorState error={result.error} locale={locale} />
      </>
    );
  }

  return <DashboardView locale={locale} data={result.data} />;
}
