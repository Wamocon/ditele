import type { Metadata } from "next";
import Link from "next/link";
import type { Route } from "next";
import { PageHeader } from "@/shared/layout";
import { Button, EmptyState, ErrorState } from "@/shared/ui";
import { listMyLearningCourses, type LearningCourseSummary } from "@/shared/data/learning";
import { ContinueCard, CourseCard, StatTile } from "@/features/learning/course-ui";
import { learnStrings } from "@/features/learning/i18n";

export const metadata: Metadata = { title: "Übersicht · DiTeLe" };

/**
 * The course the "Weiter lernen" card should point at.
 *
 * A learner opening the dashboard wants the thing they were last doing, so a
 * half-finished task outranks a fresh one, and any course with work left
 * outranks a finished one. Only when everything is done does a completed course
 * get the slot — with a "well done" message rather than a dead button.
 */
function pickContinueCourse(courses: LearningCourseSummary[]): LearningCourseSummary | null {
  const rank = (course: LearningCourseSummary) => {
    if (course.nextTaskState === "in_progress" || course.nextTaskState === "revision_required") return 0;
    if (course.nextTaskId !== null && course.nextTaskState !== "submitted") return 1;
    if (course.nextTaskId !== null) return 2;
    return 3;
  };
  const sorted = [...courses].sort((a, b) => rank(a) - rank(b));
  return sorted[0] ?? null;
}

export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const s = learnStrings(locale);
  const result = await listMyLearningCourses(locale);

  if (!result.ok) {
    return (
      <>
        <PageHeader title={s.dashboard.title} />
        <ErrorState message={result.error.message} />
      </>
    );
  }

  const courses = result.data;

  if (courses.length === 0) {
    return (
      <>
        <PageHeader title={s.dashboard.title} description={s.dashboard.description} />
        <EmptyState
          title={s.dashboard.emptyTitle}
          description={s.dashboard.emptyDescription}
          action={
            <Link href={`/${locale}/catalog` as Route}>
              <Button>{s.dashboard.emptyAction}</Button>
            </Link>
          }
        />
      </>
    );
  }

  const continueCourse = pickContinueCourse(courses);
  const done = courses.reduce((sum, course) => sum + course.completedActivities, 0);
  const total = courses.reduce((sum, course) => sum + course.totalActivities, 0);

  return (
    <>
      <PageHeader title={s.dashboard.title} description={s.dashboard.description} />

      <div className="flex flex-col gap-8">
        {continueCourse && (
          <ContinueCard course={continueCourse} locale={locale} strings={s.dashboard} />
        )}

        <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 lg:gap-5">
          <StatTile label={s.dashboard.statCourses} value={courses.length} />
          <StatTile label={s.dashboard.statTasksDone} value={done} />
          <StatTile label={s.dashboard.statTasksOpen} value={Math.max(0, total - done)} />
        </div>

        <section className="flex flex-col gap-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-[22px] font-semibold leading-7">{s.dashboard.activeCourses}</h2>
            <Link
              href={`/${locale}/learn/courses` as Route}
              className="text-[15px] font-semibold text-[--color-brand] hover:underline"
            >
              {s.dashboard.allCourses}
            </Link>
          </div>

          <div className="grid gap-4 md:grid-cols-2 lg:gap-5">
            {courses.slice(0, 4).map((course, index) => (
              <div
                key={course.enrollmentId}
                className="animate-fade-in-up"
                // Stagger, capped at 240ms per MASTER_PLAN §6.6.
                style={{ animationDelay: `${Math.min(index * 40, 240)}ms` }}
              >
                <CourseCard course={course} locale={locale} strings={s.courses} />
              </div>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}
