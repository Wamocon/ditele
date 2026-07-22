import type { Metadata } from "next";
import Link from "next/link";
import type { Route } from "next";
import { ArrowRight, BookOpen, CircleCheck, CircleDashed } from "lucide-react";
import { PageHeader } from "@/shared/layout";
import { Button, Card, EmptyState, ErrorState, Reveal } from "@/shared/ui";
import { listMyLearningCourses, type LearningCourseSummary } from "@/shared/data/learning";
import { ContinueCard, CourseCard, ProgressRing, StatTile } from "@/features/learning/course-ui";
import { format, learnStrings } from "@/features/learning/i18n";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const s = learnStrings(locale);
  return { title: `${s.dashboard.title} · DiTeLe`, description: s.dashboard.description };
}

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
        <ErrorState error={result.error} locale={locale} />
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
  const overall = format(s.dashboard.continueProgress, { done, total });

  return (
    <>
      <PageHeader title={s.dashboard.title} description={s.dashboard.description} />

      <div className="flex flex-col gap-8 lg:gap-10">
        {/*
          Bento grid. The old layout gave the hero card and the three stat tiles
          equal visual weight in separate full-width bands, so the eye had no
          reason to land on the one thing the learner actually came to do. Here
          the "continue" card takes two thirds and two rows, and the summary
          figures fold into a single column beside it — same information, one
          clear first read.
        */}
        <div className="grid gap-4 lg:grid-cols-12 lg:gap-5">
          {continueCourse && (
            <div className="lg:col-span-8 lg:row-span-2">
              <ContinueCard course={continueCourse} locale={locale} strings={s.dashboard} />
            </div>
          )}

          <Card className="flex flex-col items-center justify-center gap-4 py-7 lg:col-span-4">
            <ProgressRing done={done} total={total} size={116} label={overall} emphasis />
            <p className="text-center text-[13px] leading-5 text-(--color-fg-muted) tabular-nums">
              {overall}
            </p>
          </Card>

          <Card className="flex flex-col justify-center gap-3 lg:col-span-4">
            <StatTile
              compact
              locale={locale}
              icon={<BookOpen className="size-4" aria-hidden />}
              label={s.dashboard.statCourses}
              value={courses.length}
            />
            <hr className="border-(--color-border)" />
            <StatTile
              compact
              locale={locale}
              icon={<CircleCheck className="size-4" aria-hidden />}
              label={s.dashboard.statTasksDone}
              value={done}
            />
            <hr className="border-(--color-border)" />
            <StatTile
              compact
              locale={locale}
              icon={<CircleDashed className="size-4" aria-hidden />}
              label={s.dashboard.statTasksOpen}
              value={Math.max(0, total - done)}
            />
          </Card>
        </div>

        <section className="flex flex-col gap-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-[22px] font-semibold leading-7">{s.dashboard.activeCourses}</h2>
            <Link
              href={`/${locale}/learn/courses` as Route}
              className="group inline-flex min-h-11 items-center gap-1.5 text-[15px] font-semibold text-(--color-brand) hover:underline"
            >
              {s.dashboard.allCourses}
              <ArrowRight
                className="size-4 transition-transform duration-(--duration-base) ease-(--ease-out) group-hover:translate-x-0.5"
                aria-hidden
              />
            </Link>
          </div>

          <div className="grid gap-4 md:grid-cols-2 lg:gap-5">
            {courses.slice(0, 4).map((course, index) => (
              <Reveal
                key={course.enrollmentId}
                // Stagger, capped at 240ms per MASTER_PLAN §6.6.
                delay={Math.min(index * 40, 240)}
              >
                <CourseCard course={course} locale={locale} strings={s.courses} />
              </Reveal>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}
