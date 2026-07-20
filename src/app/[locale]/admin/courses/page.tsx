import { notFound } from "next/navigation";
import { z } from "zod";

import { isLocale } from "@/shared/i18n/config";

import { readContentStudioAccess } from "./access";
import { adminContentCopy } from "./copy";
import { readAdminCourseList } from "./data";
import { ContentPermissionDenied, CourseListView } from "./views";

export default async function AdminCoursesPage({
  params,
  searchParams,
}: {
  readonly params: Promise<{ locale: string }>;
  readonly searchParams: Promise<{ page?: string | string[] }>;
}) {
  const [{ locale }, query] = await Promise.all([params, searchParams]);
  if (!isLocale(locale)) notFound();
  const parsedPage = z.coerce.number().int().positive().safeParse(
    typeof query.page === "string" ? query.page : "1",
  );
  const page = parsedPage.success ? parsedPage.data : 1;
  const access = await readContentStudioAccess(locale, `/${locale}/admin/courses`);
  const labels = adminContentCopy[locale];
  if (!access.canManage) return <ContentPermissionDenied labels={labels} />;
  const result = await readAdminCourseList(access.principal, locale, page);
  if (page > result.totalPages) notFound();
  return <CourseListView {...result} labels={labels} locale={locale} />;
}
