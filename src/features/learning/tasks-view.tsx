"use client";

import Link from "next/link";
import type { Route } from "next";
import { ChevronRight, Lock } from "lucide-react";
import { PageHeader } from "@/shared/layout/page-header";
import { Card, EmptyState } from "@/shared/ui";
import type { FlatTask } from "@/shared/data/learning";
import { TaskStatusBadge, lockReasonText } from "./labels";

export function TasksView({ locale, tasks }: { locale: string; tasks: FlatTask[] }) {
  // Group the flat list by course so the learner sees where each task belongs,
  // but there are no stages — inside a course it is a single ordered list.
  const groups = new Map<string, { title: string; items: FlatTask[] }>();
  for (const task of tasks) {
    const group = groups.get(task.courseId) ?? { title: task.courseTitle, items: [] };
    group.items.push(task);
    groups.set(task.courseId, group);
  }

  return (
    <>
      <PageHeader
        title="Aufgaben"
        description="Alle Kursaufgaben. Eine Aufgabe öffnet sich, sobald ihre Bedingungen erfüllt sind."
        locale={locale}
      />

      {tasks.length === 0 ? (
        <EmptyState
          title="Keine Aufgaben"
          description="Sobald du einem Kurs zugewiesen bist, erscheinen seine Aufgaben hier."
        />
      ) : (
        <div className="flex flex-col gap-8">
          {[...groups.entries()].map(([courseId, group]) => (
            <section key={courseId} className="flex flex-col gap-3">
              <h2 className="text-[16px] font-semibold text-(--color-fg-muted)">{group.title}</h2>
              <ul className="flex list-none flex-col gap-2 p-0">
                {group.items.map((task) => (
                  <li key={task.id}>
                    <TaskRow locale={locale} task={task} />
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </>
  );
}

function TaskRow({ locale, task }: { locale: string; task: FlatTask }) {
  const body = (
    <Card
      interactive={task.unlocked}
      className="flex items-center gap-3"
      aria-disabled={!task.unlocked}
    >
      <span
        className={
          task.unlocked
            ? "flex size-8 shrink-0 items-center justify-center rounded-full bg-(--color-brand-soft) text-[14px] font-semibold text-(--color-brand) tabular-nums"
            : "flex size-8 shrink-0 items-center justify-center rounded-full bg-(--color-surface-2) text-(--color-fg-subtle)"
        }
      >
        {task.unlocked ? task.orderIndex : <Lock className="size-4" aria-hidden />}
      </span>

      <div className="min-w-0 flex-1">
        <p className={task.unlocked ? "text-[15px] font-semibold" : "text-[15px] font-semibold text-(--color-fg-muted)"}>
          {task.title}
        </p>
        {!task.unlocked && (
          <p className="text-[13px] text-(--color-fg-muted)">{lockReasonText(task.lockReason)}</p>
        )}
      </div>

      <TaskStatusBadge state={task.submissionState} />
      {task.unlocked && <ChevronRight className="size-5 shrink-0 text-(--color-fg-subtle)" aria-hidden />}
    </Card>
  );

  if (!task.unlocked) return body;
  return (
    <Link href={`/${locale}/learn/tasks/${task.id}` as Route} className="block">
      {body}
    </Link>
  );
}
