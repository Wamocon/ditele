import { PageHeader } from "@/shared/layout";
import { requireRole } from "@/shared/auth/guard";
import { adminStrings } from "@/features/content/i18n";
import { CourseForm } from "@/features/content/components/course-form";

export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  await requireRole(["admin"], locale);
  const strings = adminStrings(locale);

  return (
    <>
      <PageHeader
        title={strings.courseNew.title}
        description={strings.courseNew.subtitle}
        breadcrumbs={[
          { label: strings.courses.title, href: `/${locale}/admin/courses` },
          { label: strings.courseNew.title },
        ]}
      />
      <CourseForm locale={locale} strings={strings} />
    </>
  );
}
