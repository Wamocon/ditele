import type { Metadata } from "next";
import { PageHeader } from "@/shared/layout";
import { EmptyState, ErrorState, StatusBadge } from "@/shared/ui";
import { getMyLearningCourse } from "@/shared/data/learning";
import { ProgressBar } from "@/features/learning/course-ui";
import { StageList } from "@/features/learning/stage-list";
import { CourseFeedback } from "@/features/learning/course-feedback";
import { format, learnStrings } from "@/features/learning/i18n";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const s = learnStrings(locale);
  return { title: `${s.course.breadcrumb} · DiTeLe` };
}

export default async function Page({
  params,
}: {
  params: Promise<{ locale: string; courseId: string }>;
}) {
  const { locale, courseId } = await params;
  const s = learnStrings(locale);
  const result = await getMyLearningCourse(courseId, locale);

  if (!result.ok) {
    return (
      <>
        <PageHeader title={s.course.breadcrumb} />
        <ErrorState error={result.error} locale={locale} />
      </>
    );
  }

  const course = result.data;
  const progressLabel = format(s.course.progressValue, {
    done: course.completedActivities,
    total: course.totalActivities,
  });

  return (
    <>
      <PageHeader
        title={course.title}
        description={course.summary}
        breadcrumbs={[
          { label: s.courses.title, href: `/${locale}/learn/courses` },
          { label: course.title },
        ]} locale={locale} />

      <div className="flex flex-col gap-6">
        {/* Progress stays in view while the learner scans the curriculum — on
            desktop, where there is room for it without eating the viewport. */}
        <div className="z-10 flex flex-col gap-3 rounded-(--radius-lg) border border-(--color-border) bg-(--color-bg) p-4 lg:sticky lg:top-[calc(var(--header-height)+8px)] lg:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-[13px] font-semibold leading-5 tabular-nums">{progressLabel}</p>
            {/* The cohort's name and state used to sit here as "Gruppe:
                Standard" with its own badge. There is no group in this
                product — a learner is enrolled in a COURSE — and the row was
                showing an internal scheduling record that every learner shares
                and none of them chose. The enrolment badge, which is about
                this learner, is what remains. */}
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge state={course.enrollmentState} locale={locale} />
            </div>
          </div>
          <ProgressBar
            done={course.completedActivities}
            total={course.totalActivities}
            label={s.course.progressLabel}
          />
        </div>

        {course.stages.length === 0 ? (
          <EmptyState title={s.course.emptyTitle} description={s.course.emptyDescription} />
        ) : (
          <StageList stages={course.stages} locale={locale} strings={s.course} />
        )}

        {/* Course complete — invite a 5-star rating and a comment. */}
        {course.totalActivities > 0 &&
          course.completedActivities >= course.totalActivities && (
            <CourseFeedback locale={locale} courseId={courseId} strings={s.course} />
          )}
      </div>
    </>
  );
}
