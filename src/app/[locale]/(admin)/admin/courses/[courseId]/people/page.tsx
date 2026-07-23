import type { Route } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { PageHeader } from "@/shared/layout";
import { Button, ErrorState } from "@/shared/ui";
import { requireRole } from "@/shared/auth/guard";
import { getCourse, getCourseAssignments } from "@/shared/data/admin";
import { PeopleManager } from "@/features/admin/people-manager";

export default async function Page({
  params,
}: {
  params: Promise<{ locale: string; courseId: string }>;
}) {
  const { locale, courseId } = await params;
  await requireRole(["admin"], locale);

  const [courseResult, assignmentsResult] = await Promise.all([
    getCourse(courseId),
    getCourseAssignments(courseId),
  ]);

  const courseTitle = courseResult.ok ? courseResult.data.title : "";

  const header = (
    <PageHeader
      title="Personen"
      description={courseTitle ? `${courseTitle} — Teilnehmer und Trainer verwalten.` : "Teilnehmer und Trainer verwalten."}
      breadcrumbs={[
        { label: "Kurse", href: `/${locale}/admin/courses` },
        ...(courseTitle ? [{ label: courseTitle, href: `/${locale}/admin/courses/${courseId}` }] : []),
        { label: "Personen" },
      ]}
      locale={locale}
      actions={
        <Link href={`/${locale}/admin/courses/${courseId}` as Route}>
          <Button variant="ghost" iconLeft={<ArrowLeft className="size-4" aria-hidden />}>
            Zum Kurs
          </Button>
        </Link>
      }
    />
  );

  if (!assignmentsResult.ok) {
    return (
      <>
        {header}
        <ErrorState message={assignmentsResult.error.message} />
      </>
    );
  }

  return (
    <>
      {header}
      <PeopleManager locale={locale} courseId={courseId} assignments={assignmentsResult.data} />
    </>
  );
}
