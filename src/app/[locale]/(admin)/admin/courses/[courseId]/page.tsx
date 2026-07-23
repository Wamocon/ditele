import type { Route } from "next";
import Link from "next/link";
import { Users } from "lucide-react";

import { PageHeader } from "@/shared/layout";
import { Button, Card, CardTitle, ErrorState } from "@/shared/ui";
import { requireRole } from "@/shared/auth/guard";
import { getCourse, listCourseTasks, listArenaTasks } from "@/shared/data/admin";
import { CourseForm } from "@/features/admin/course-form";
import { CourseStateControl } from "@/features/admin/course-state-control";
import { CourseTasksManager } from "@/features/admin/course-tasks-manager";

export default async function Page({
  params,
}: {
  params: Promise<{ locale: string; courseId: string }>;
}) {
  const { locale, courseId } = await params;
  await requireRole(["admin"], locale);

  const courseResult = await getCourse(courseId);
  if (!courseResult.ok) {
    return (
      <>
        <PageHeader title="Kurs" locale={locale} />
        <ErrorState message={courseResult.error.message} />
      </>
    );
  }
  const course = courseResult.data;

  const [tasksResult, arenaResult] = await Promise.all([listCourseTasks(courseId), listArenaTasks()]);

  const header = (
    <PageHeader
      title={course.title}
      description={course.slug}
      breadcrumbs={[
        { label: "Kurse", href: `/${locale}/admin/courses` },
        { label: course.title },
      ]}
      locale={locale}
      actions={
        <Link href={`/${locale}/admin/courses/${courseId}/people` as Route}>
          <Button variant="outline" iconLeft={<Users className="size-4" aria-hidden />}>
            Personen verwalten
          </Button>
        </Link>
      }
    />
  );

  const arenaOptions = arenaResult.ok
    ? arenaResult.data.map((a) => ({ id: a.id, title: a.title, order_index: a.order_index }))
    : [];

  return (
    <>
      {header}

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="flex flex-col gap-4 lg:order-1">
          <CardTitle>Kursdetails</CardTitle>
          <CourseForm locale={locale} course={course} />
        </div>
        <div className="lg:order-2">
          <CourseStateControl locale={locale} courseId={courseId} state={course.state} />
        </div>
      </div>

      <div className="mt-8">
        {tasksResult.ok ? (
          <CourseTasksManager
            locale={locale}
            courseId={courseId}
            tasks={tasksResult.data}
            arenaTasks={arenaOptions}
          />
        ) : (
          <Card>
            <ErrorState message={tasksResult.error.message} />
          </Card>
        )}
      </div>
    </>
  );
}
