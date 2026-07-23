import type { Metadata } from "next";
import { PageHeader } from "@/shared/layout";
import { ErrorState } from "@/shared/ui";
import { getMyCourseTask } from "@/shared/data/learning";
import { CourseTaskWorkspace } from "@/features/learning/course-task-workspace";

export const metadata: Metadata = { title: "Aufgabe · DiTeLe" };

export default async function Page({
  params,
}: {
  params: Promise<{ locale: string; taskId: string }>;
}) {
  const { locale, taskId } = await params;
  const result = await getMyCourseTask(taskId);

  if (!result.ok) {
    return (
      <>
        <PageHeader
          title="Aufgabe"
          breadcrumbs={[{ label: "Kurse", href: `/${locale}/learn/courses` }, { label: "Aufgabe" }]}
          locale={locale}
        />
        <ErrorState error={result.error} locale={locale} />
      </>
    );
  }

  const courseHref = `/${locale}/learn/courses/${result.data.task.courseId}`;
  return <CourseTaskWorkspace locale={locale} data={result.data} courseHref={courseHref} />;
}
