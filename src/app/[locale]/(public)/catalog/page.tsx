import type { Metadata } from "next";

import { PageHeader } from "@/shared/layout";
import { EmptyState, ErrorState } from "@/shared/ui";
import { listActiveCourses } from "@/shared/data/catalog";
import { CourseCard } from "../_components/course-card";

const TITLE = "Kurse";
const DESCRIPTION =
  "Alle aktuell verfügbaren Kurse. Ein Administrator legt Kurse an und weist sie Teilnehmenden zu.";

export function generateMetadata(): Metadata {
  return { title: `${TITLE} · DiTeLe`, description: DESCRIPTION };
}

export default async function CatalogPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const result = await listActiveCourses();

  return (
    <>
      <PageHeader title={TITLE} description={DESCRIPTION} />

      {!result.ok ? (
        <ErrorState
          title="Kurse konnten nicht geladen werden"
          message="Bitte laden Sie die Seite neu oder versuchen Sie es später erneut."
        />
      ) : result.data.length === 0 ? (
        <EmptyState
          title="Noch keine Kurse"
          description="Sobald ein Kurs freigeschaltet ist, erscheint er hier."
        />
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 lg:gap-5">
          {result.data.map((course) => (
            <li key={course.id} className="h-full">
              <CourseCard course={course} locale={locale} labels={{ open: "Ansehen" }} />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
