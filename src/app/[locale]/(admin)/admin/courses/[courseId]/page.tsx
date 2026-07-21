import type { Route } from "next";
import Link from "next/link";
import { PageHeader } from "@/shared/layout";
import { Button, ErrorState } from "@/shared/ui";
import { requireRole } from "@/shared/auth/guard";
import { getAdminCourse } from "@/shared/data/content";
import { adminStrings } from "@/features/content/i18n";
import { CourseDetail } from "@/features/content/components/course-detail";
import { pickLocalized } from "@/features/content/model";

export default async function Page({
  params,
}: {
  params: Promise<{ locale: string; courseId: string }>;
}) {
  const { locale, courseId } = await params;
  await requireRole(["admin"], locale);

  const strings = adminStrings(locale);
  const result = await getAdminCourse(courseId);

  if (!result.ok) {
    return (
      <>
        <PageHeader title={strings.course.title} />
        <ErrorState message={result.error.message} />
      </>
    );
  }

  const course = result.data;
  const title =
    pickLocalized(
      Object.fromEntries(course.localizations.map((entry) => [entry.locale, entry.title])),
      locale
    ) || course.slug;

  return (
    <>
      <PageHeader
        title={title}
        description={course.slug}
        breadcrumbs={[
          { label: strings.courses.title, href: `/${locale}/admin/courses` },
          { label: title },
        ]}
        actions={
          <Link href={`/${locale}/admin/courses` as Route}>
            <Button variant="outline">{strings.course.back}</Button>
          </Link>
        }
      />
      <CourseDetail locale={locale} course={course} />
    </>
  );
}
