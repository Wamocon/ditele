import type { Metadata } from "next";

import { PageHeader } from "@/shared/layout";
import { ErrorState } from "@/shared/ui";
import { requireRole } from "@/shared/auth/guard";
import { listCourseProgress } from "@/shared/data/review";
import { ProgressTable } from "@/features/review/progress-table";

export const metadata: Metadata = { title: "Fortschritt" };

/** Progress of the learners in the trainer's courses across both chains. */
export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  await requireRole(["trainer", "admin"], locale);

  const result = await listCourseProgress();

  return (
    <>
      <PageHeader
        title="Fortschritt"
        description="Angenommene Kurs- und Arena-Aufgaben sowie die gesammelten XP je Lernende:r."
      />
      {result.ok ? (
        <ProgressTable rows={result.data} />
      ) : (
        <ErrorState message={result.error.message} />
      )}
    </>
  );
}
