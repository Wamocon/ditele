import { notFound } from "next/navigation";
import { z } from "zod";

import { isLocale } from "@/shared/i18n/config";

import { readContentStudioAccess } from "../access";
import { adminContentCopy } from "../copy";
import { readAdminCourse } from "../data";
import { ContentPermissionDenied, CourseDetailView } from "../views";

export default async function AdminCourseDetailPage({
  params,
}: {
  readonly params: Promise<{ locale: string; courseId: string }>;
}) {
  const { locale, courseId } = await params;
  if (!isLocale(locale) || !z.string().uuid().safeParse(courseId).success) notFound();
  const access = await readContentStudioAccess(locale, `/${locale}/admin/courses/${courseId}`);
  const labels = adminContentCopy[locale];
  if (!access.canManage) return <ContentPermissionDenied labels={labels} />;
  const course = await readAdminCourse(access.principal, courseId, locale);
  if (!course) notFound();
  return <CourseDetailView course={course} labels={labels} locale={locale} />;
}
