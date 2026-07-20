import { notFound } from "next/navigation";
import { z } from "zod";

import { canRenderProtectedPage } from "@/app/[locale]/_data/principal";
import { CourseWorkspace } from "@/features/learning/components/course-workspace";
import { isLocale } from "@/shared/i18n/config";
import { localizedDynamicRoute, localizedRoute } from "@/shared/i18n/routes";

import { courseWorkspaceCopy } from "./copy";
import { readLearnerCourseWorkspace } from "./data";

export default async function LearnerCoursePage({
  params,
}: {
  params: Promise<{ locale: string; courseId: string }>;
}) {
  const { locale, courseId } = await params;
  if (!isLocale(locale) || !z.string().uuid().safeParse(courseId).success) notFound();
  if (
    !(await canRenderProtectedPage(
      locale,
      `/${locale}/learn/courses/${courseId}`,
      ["learner"],
    ))
  ) {
    return null;
  }
  const course = await readLearnerCourseWorkspace(courseId, locale);
  if (!course) notFound();
  const formatter = new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  });

  return (
    <CourseWorkspace
      course={course}
      dashboardHref={localizedRoute(locale, "/learn")}
      formatDateTime={(value) => formatter.format(new Date(value))}
      labels={courseWorkspaceCopy[locale]}
      taskHref={(taskId) =>
        localizedDynamicRoute(locale, `/learn/tasks/${taskId}`)
      }
    />
  );
}
