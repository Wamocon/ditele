import { PageHeader } from "@/shared/layout";
import { requireRole } from "@/shared/auth/guard";
import { CourseForm } from "@/features/admin/course-form";

export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  await requireRole(["admin"], locale);

  return (
    <>
      <PageHeader
        title="Kurs erstellen"
        description="Der Kurs ist nach dem Erstellen sofort aktiv."
        breadcrumbs={[
          { label: "Kurse", href: `/${locale}/admin/courses` },
          { label: "Neu" },
        ]}
        locale={locale}
      />
      <CourseForm locale={locale} />
    </>
  );
}
