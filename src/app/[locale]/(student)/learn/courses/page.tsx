import type { Metadata } from "next";
import { PageHeader } from "@/shared/layout";
import { ErrorState } from "@/shared/ui";
import { listMyCourses } from "@/shared/data/learning";
import { CoursesView } from "@/features/learning/courses-view";

export const metadata: Metadata = { title: "Kurse · DiTeLe" };

export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const result = await listMyCourses();

  if (!result.ok) {
    return (
      <>
        <PageHeader title="Kurse" locale={locale} />
        <ErrorState error={result.error} locale={locale} />
      </>
    );
  }

  return <CoursesView locale={locale} courses={result.data} />;
}
