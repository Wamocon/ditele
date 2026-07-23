"use client";

import Link from "next/link";
import type { Route } from "next";
import { ArrowRight } from "lucide-react";
import { PageHeader } from "@/shared/layout/page-header";
import { Badge, Button, Card, CardTitle, EmptyState } from "@/shared/ui";
import type { CourseSummary } from "@/shared/data/learning";
import { ProgressBar } from "./progress-bar";

export function CoursesView({ locale, courses }: { locale: string; courses: CourseSummary[] }) {
  return (
    <>
      <PageHeader title="Kurse" description="Deine zugewiesenen Kurse und dein Fortschritt." locale={locale} />

      {courses.length === 0 ? (
        <EmptyState
          title="Noch keine Kurse"
          description="Sobald dich eine Administratorin einem Kurs zuweist, erscheint er hier."
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {courses.map((course) => (
            <Card key={course.enrollmentId} className="flex flex-col gap-3">
              <div className="flex items-start justify-between gap-3">
                <CardTitle>{course.title}</CardTitle>
                {course.completed && <Badge tone="success">Abgeschlossen</Badge>}
              </div>
              <p className="line-clamp-3 text-[14px] text-(--color-fg-muted)">{course.description}</p>
              <div className="flex flex-col gap-1.5">
                <ProgressBar value={course.acceptedTasks} total={course.totalTasks} />
                <p className="text-[13px] text-(--color-fg-muted) tabular-nums">
                  {course.acceptedTasks} von {course.totalTasks} Aufgaben angenommen
                </p>
              </div>
              <Link href={`/${locale}/learn/courses/${course.courseId}` as Route} className="mt-1 self-start">
                <Button variant="outline" size="sm" iconRight={<ArrowRight className="size-4" aria-hidden />}>
                  Zum Kurs
                </Button>
              </Link>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
