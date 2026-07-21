import type { Metadata } from "next";
import Link from "next/link";
import type { Route } from "next";
import { PageHeader } from "@/shared/layout";
import { Button, EmptyState, ErrorState } from "@/shared/ui";
import { listMyLearningCourses } from "@/shared/data/learning";
import { CourseCard } from "@/features/learning/course-ui";
import { learnStrings } from "@/features/learning/i18n";

export const metadata: Metadata = { title: "Meine Kurse · DiTeLe" };

export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const s = learnStrings(locale);
  const result = await listMyLearningCourses(locale);

  if (!result.ok) {
    return (
      <>
        <PageHeader title={s.courses.title} />
        <ErrorState message={result.error.message} />
      </>
    );
  }

  const courses = result.data;

  return (
    <>
      <PageHeader title={s.courses.title} description={s.courses.description} />

      {courses.length === 0 ? (
        <EmptyState
          title={s.courses.emptyTitle}
          description={s.courses.emptyDescription}
          action={
            <Link href={`/${locale}/catalog` as Route}>
              <Button>{s.courses.emptyAction}</Button>
            </Link>
          }
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 lg:gap-5">
          {courses.map((course, index) => (
            <div
              key={course.enrollmentId}
              className="animate-fade-in-up"
              style={{ animationDelay: `${Math.min(index * 40, 240)}ms` }}
            >
              <CourseCard course={course} locale={locale} strings={s.courses} />
            </div>
          ))}
        </div>
      )}
    </>
  );
}
