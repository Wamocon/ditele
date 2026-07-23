"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Trash2, ArrowUp, ArrowDown, Link2 } from "lucide-react";

import { Button, Card, Badge, EmptyState, ConfirmDialog } from "@/shared/ui";
import type { CourseTaskDetail } from "@/shared/data/admin";
import { deleteCourseTaskAction, reorderCourseTasksAction } from "@/shared/data/admin-actions";

import { CourseTaskEditor, type ArenaOption } from "./course-task-editor";
import { FormMessage } from "./form-message";

export function CourseTasksManager({
  locale,
  courseId,
  tasks,
  arenaTasks,
}: {
  locale: string;
  courseId: string;
  tasks: CourseTaskDetail[];
  arenaTasks: ArenaOption[];
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const arenaTitle = new Map(arenaTasks.map((a) => [a.id, a]));
  const orderedIds = tasks.map((t) => t.id);

  function done() {
    setEditing(null);
    router.refresh();
  }

  function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= orderedIds.length) return;
    const next = [...orderedIds];
    const a = next[index];
    const b = next[target];
    if (!a || !b) return;
    next[index] = b;
    next[target] = a;
    setError(null);
    startTransition(async () => {
      const result = await reorderCourseTasksAction(courseId, next, locale);
      if (!result.ok) setError(result.error);
      else router.refresh();
    });
  }

  function confirmDelete() {
    if (!confirmId) return;
    const id = confirmId;
    setError(null);
    startTransition(async () => {
      const result = await deleteCourseTaskAction(id, courseId, locale);
      setConfirmId(null);
      if (!result.ok) setError(result.error);
      else router.refresh();
    });
  }

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[20px] font-semibold leading-7">Kursaufgaben</h2>
        {editing !== "new" && (
          <Button
            size="sm"
            iconLeft={<Plus className="size-4" aria-hidden />}
            onClick={() => setEditing("new")}
          >
            Aufgabe hinzufügen
          </Button>
        )}
      </div>

      {error && <FormMessage tone="error">{error}</FormMessage>}

      {editing === "new" && (
        <CourseTaskEditor locale={locale} courseId={courseId} arenaTasks={arenaTasks} onDone={done} />
      )}

      {tasks.length === 0 && editing !== "new" ? (
        <EmptyState
          title="Noch keine Kursaufgaben"
          description="Fügen Sie die erste Aufgabe hinzu, um den Kurs aufzubauen."
        />
      ) : (
        <ol className="flex flex-col gap-3">
          {tasks.map((task, index) => {
            const attached = task.arena_task_id ? arenaTitle.get(task.arena_task_id) : undefined;
            const correctCount = task.answer?.correct_option_ids.length ?? 0;
            if (editing === task.id) {
              return (
                <li key={task.id}>
                  <CourseTaskEditor
                    locale={locale}
                    courseId={courseId}
                    task={task}
                    arenaTasks={arenaTasks}
                    onDone={done}
                  />
                </li>
              );
            }
            return (
              <li key={task.id}>
                <Card className="flex flex-col gap-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <span className="tabular mt-0.5 inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-(--color-surface-2) text-[13px] font-semibold">
                        {index + 1}
                      </span>
                      <div className="flex flex-col gap-1">
                        <p className="font-semibold leading-5">{task.title}</p>
                        <div className="flex flex-wrap gap-1.5">
                          {task.mcq_question ? (
                            <Badge tone="info">Pflichtfrage</Badge>
                          ) : (
                            <Badge tone="neutral">Keine Frage</Badge>
                          )}
                          <Badge tone="neutral">{task.options.length} Optionen</Badge>
                          {correctCount > 0 && <Badge tone="success">{correctCount} richtig</Badge>}
                          {attached && (
                            <Badge tone="brand">
                              <Link2 className="size-3" aria-hidden />
                              Arena #{attached.order_index}
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => move(index, -1)}
                        disabled={pending || index === 0}
                        aria-label="Nach oben"
                      >
                        <ArrowUp className="size-4" aria-hidden />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => move(index, 1)}
                        disabled={pending || index === tasks.length - 1}
                        aria-label="Nach unten"
                      >
                        <ArrowDown className="size-4" aria-hidden />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setEditing(task.id)}
                        aria-label="Bearbeiten"
                      >
                        <Pencil className="size-4" aria-hidden />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setConfirmId(task.id)}
                        aria-label="Löschen"
                      >
                        <Trash2 className="size-4" aria-hidden />
                      </Button>
                    </div>
                  </div>
                </Card>
              </li>
            );
          })}
        </ol>
      )}

      <ConfirmDialog
        open={confirmId !== null}
        title="Aufgabe löschen?"
        description="Die Aufgabe und ihre Optionen werden dauerhaft entfernt."
        confirmLabel="Löschen"
        cancelLabel="Abbrechen"
        destructive
        busy={pending}
        onConfirm={confirmDelete}
        onCancel={() => setConfirmId(null)}
      />
    </section>
  );
}
