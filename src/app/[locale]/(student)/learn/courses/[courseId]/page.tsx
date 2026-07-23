import type { Metadata } from "next";
import { PageHeader } from "@/shared/layout";
import { ErrorState } from "@/shared/ui";
import { getCourseCompletion, getMyCourse } from "@/shared/data/learning";
import { CourseDetailView } from "@/features/learning/course-detail-view";

export const metadata: Metadata = { title: "Kurs · DiTeLe" };

export default async function Page({
  params,
}: {
  params: Promise<{ locale: string; courseId: string }>;
}) {
  const { locale, courseId } = await params;
  const [detailResult, completionResult] = await Promise.all([
    getMyCourse(courseId),
    getCourseCompletion(courseId),
  ]);

  if (!detailResult.ok) {
    return (
      <>
        <PageHeader
          title="Kurs"
          breadcrumbs={[{ label: "Kurse", href: `/${locale}/learn/courses` }]}
          locale={locale}
        />
        <ErrorState error={detailResult.error} locale={locale} />
      </>
    );
  }

  const completion = completionResult.ok
    ? completionResult.data
    : { complete: false, completionVideoUrl: null, hasReview: false };

  return <CourseDetailView locale={locale} detail={detailResult.data} completion={completion} />;
}
