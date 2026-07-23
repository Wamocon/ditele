"use client";

import Link from "next/link";
import type { Route } from "next";
import { ArrowRight, Award, BookOpen, Sparkles, Trophy } from "lucide-react";
import { PageHeader } from "@/shared/layout/page-header";
import { Badge, Button, Card, CardTitle, EmptyState } from "@/shared/ui";
import type { StudentDashboard } from "@/shared/data/learning";
import { ProgressBar } from "./progress-bar";
import { BadgeGrid } from "./badge-grid";

export function DashboardView({ locale, data }: { locale: string; data: StudentDashboard }) {
  const { courses, totalXp, badges, nextTask } = data;

  if (courses.length === 0) {
    return (
      <>
        <PageHeader title="Start" description="Willkommen zurück." locale={locale} />
        <EmptyState
          title="Noch keine Kurse"
          description="Du bist derzeit keinem Kurs zugewiesen. Sobald dich eine Administratorin einem Kurs hinzufügt, erscheint er hier."
        />
      </>
    );
  }

  return (
    <>
      <PageHeader title="Start" description="Dein Lernfortschritt auf einen Blick." locale={locale} />

      <div className="flex flex-col gap-8">
        <div className="grid gap-4 lg:grid-cols-3">
          <Card rim className="flex flex-col justify-between gap-4 lg:col-span-2">
            <div className="flex flex-col gap-1">
              <span className="text-[13px] font-semibold uppercase tracking-wide text-(--color-brand)">
                Weiter lernen
              </span>
              {nextTask ? (
                <>
                  <CardTitle>{nextTask.title}</CardTitle>
                  <p className="text-[14px] text-(--color-fg-muted)">{nextTask.courseTitle}</p>
                </>
              ) : (
                <>
                  <CardTitle>Alles erledigt</CardTitle>
                  <p className="text-[14px] text-(--color-fg-muted)">
                    Du hast alle offenen Aufgaben bearbeitet. Sehr gut!
                  </p>
                </>
              )}
            </div>
            {nextTask && (
              <Link href={`/${locale}/learn/tasks/${nextTask.id}` as Route} className="self-start">
                <Button iconRight={<ArrowRight className="size-4" aria-hidden />}>Aufgabe öffnen</Button>
              </Link>
            )}
          </Card>

          <div className="grid grid-cols-2 gap-4 lg:grid-cols-1">
            <StatTile icon={<Sparkles className="size-5" aria-hidden />} label="Gesammelte XP" value={totalXp} />
            <StatTile icon={<Award className="size-5" aria-hidden />} label="Badges" value={badges.length} />
          </div>
        </div>

        <section className="flex flex-col gap-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="flex items-center gap-2 text-[20px] font-semibold">
              <BookOpen className="size-5 text-(--color-brand)" aria-hidden />
              Meine Kurse
            </h2>
            <Link
              href={`/${locale}/learn/courses` as Route}
              className="inline-flex items-center gap-1 text-[14px] font-semibold text-(--color-brand) hover:underline"
            >
              Alle Kurse
              <ArrowRight className="size-4" aria-hidden />
            </Link>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            {courses.map((course) => (
              <Link key={course.enrollmentId} href={`/${locale}/learn/courses/${course.courseId}` as Route}>
                <Card interactive className="flex h-full flex-col gap-3">
                  <div className="flex items-start justify-between gap-3">
                    <CardTitle>{course.title}</CardTitle>
                    {course.completed && <Badge tone="success">Abgeschlossen</Badge>}
                  </div>
                  <p className="line-clamp-2 text-[14px] text-(--color-fg-muted)">{course.description}</p>
                  <div className="mt-auto flex flex-col gap-1.5">
                    <ProgressBar value={course.acceptedTasks} total={course.totalTasks} />
                    <p className="text-[13px] text-(--color-fg-muted) tabular-nums">
                      {course.acceptedTasks} von {course.totalTasks} Aufgaben angenommen
                    </p>
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        </section>

        {badges.length > 0 && (
          <section className="flex flex-col gap-4">
            <h2 className="flex items-center gap-2 text-[20px] font-semibold">
              <Trophy className="size-5 text-(--color-brand)" aria-hidden />
              Meine Badges
            </h2>
            <BadgeGrid badges={badges} />
          </section>
        )}
      </div>
    </>
  );
}

function StatTile({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <Card className="flex flex-col gap-2">
      <span className="flex size-9 items-center justify-center rounded-full bg-(--color-brand-soft) text-(--color-brand)">
        {icon}
      </span>
      <span className="text-[28px] font-semibold leading-none tabular-nums">{value}</span>
      <span className="text-[13px] text-(--color-fg-muted)">{label}</span>
    </Card>
  );
}
