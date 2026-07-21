import type { Metadata } from "next";
import { PageHeader } from "@/shared/layout";
import { EmptyState, ErrorState, StatusBadge } from "@/shared/ui";
import { getMyLearningCourse } from "@/shared/data/learning";
import { ProgressBar } from "@/features/learning/course-ui";
import { StageList } from "@/features/learning/stage-list";
import { format, learnStrings } from "@/features/learning/i18n";

export const metadata: Metadata = { title: "Kursdetail · DiTeLe" };

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
        <ErrorState message={result.error.message} />
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
        ]}
      />

      <div className="flex flex-col gap-6">
        {/* Progress stays in view while the learner scans the curriculum — on
            desktop, where there is room for it without eating the viewport. */}
        <div className="z-10 flex flex-col gap-3 rounded-(--radius-lg) border border-(--color-border) bg-(--color-bg) p-4 lg:sticky lg:top-[calc(var(--header-height)+8px)] lg:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-[13px] font-semibold leading-5 tabular-nums">{progressLabel}</p>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-[0.04em] text-(--color-fg-muted)">
                {s.course.cohortLabel}: {course.cohortName}
              </span>
              <StatusBadge state={course.cohortState} />
              <StatusBadge state={course.enrollmentState} />
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
      </div>
    </>
  );
}
