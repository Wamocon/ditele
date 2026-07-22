"use client";

import { useState, useTransition } from "react";
import { ChevronDown, ChevronUp, Plus, Trash2 } from "lucide-react";
import { Badge, Button, Card, Field, Input, StatusBadge, Textarea, cn } from "@/shared/ui";
import {
  addTaskAction,
  deleteStageAction,
  deleteTaskAction,
  reorderStagesAction,
  reorderTasksAction,
  saveStageAction,
  type ActionState,
} from "../actions";
import type { AdminStrings } from "../i18n";
import { CONTENT_LOCALES, type StudioStage } from "../model";
import { TaskEditorDialog } from "./task-editor-dialog";

function localeLabel(locale: string, strings: AdminStrings): string {
  if (locale === "de") return strings.shared.localeDe;
  if (locale === "en") return strings.shared.localeEn;
  return strings.shared.localeRu;
}

/** Moves one id within a list and returns the new order. */
function moved(ids: string[], id: string, direction: -1 | 1): string[] {
  const index = ids.indexOf(id);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= ids.length) return ids;
  const next = [...ids];
  const [entry] = next.splice(index, 1);
  next.splice(target, 0, entry as string);
  return next;
}

export interface StageCardProps {
  locale: string;
  courseId: string;
  versionId: string;
  stage: StudioStage;
  stageOrder: string[];
  /** Active Arena scenarios, for the task editor's gate picker. */
  scenarios?: { id: string; code: string; title: string }[];
  strings: AdminStrings;
  readOnly: boolean;
  /** Hide all stage chrome (badge, title, reorder, edit, delete) and show only
   *  the task list, so the course reads as a flat list of tasks (§ stages
   *  hidden). The stage still exists; it is simply not presented. */
  flat?: boolean;
}

export function StageCard({
  locale,
  courseId,
  versionId,
  stage,
  stageOrder,
  scenarios = [],
  strings,
  readOnly,
  flat = false,
}: StageCardProps) {
  const s = strings.studio;
  const [pending, startTransition] = useTransition();
  const [state, setState] = useState<ActionState>({ status: "idle" });
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [confirmingTask, setConfirmingTask] = useState<string | null>(null);
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);
  const [editingMeta, setEditingMeta] = useState(false);

  const [drafts, setDrafts] = useState(() =>
    Object.fromEntries(
      CONTENT_LOCALES.map((contentLocale) => {
        const entry = stage.localizations.find((item) => item.locale === contentLocale);
        return [
          contentLocale,
          { title: entry?.title ?? "", descriptionHtml: entry?.descriptionHtml ?? "" },
        ];
      })
    )
  );

  const german = stage.localizations.find((item) => item.locale === "de");
  const heading = german?.title?.trim()
    ? german.title
    : s.stageNumber.replace("{position}", String(stage.position + 1));
  const taskOrder = stage.tasks.map((task) => task.id);

  const run = (action: () => Promise<ActionState>) =>
    startTransition(async () => {
      setState(await action());
    });

  return (
    <Card className="flex flex-col gap-4">
      {!flat && (
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="brand">{s.stageNumber.replace("{position}", String(stage.position + 1))}</Badge>
            <StatusBadge state={stage.state} locale={locale} />
          </div>
          <h3 className="text-[18px] font-semibold leading-6">{heading}</h3>
        </div>

        {!readOnly && (
          <div className="flex flex-wrap items-center gap-1">
            <Button
              size="sm"
              variant="ghost"
              aria-label={strings.shared.moveUp}
              disabled={pending || stageOrder.indexOf(stage.id) === 0}
              onClick={() =>
                run(() =>
                  reorderStagesAction({
                    locale,
                    courseId,
                    versionId,
                    orderedIds: moved(stageOrder, stage.id, -1),
                  })
                )
              }
            >
              <ChevronUp className="size-4" aria-hidden />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              aria-label={strings.shared.moveDown}
              disabled={pending || stageOrder.indexOf(stage.id) === stageOrder.length - 1}
              onClick={() =>
                run(() =>
                  reorderStagesAction({
                    locale,
                    courseId,
                    versionId,
                    orderedIds: moved(stageOrder, stage.id, 1),
                  })
                )
              }
            >
              <ChevronDown className="size-4" aria-hidden />
            </Button>
            <Button size="sm" variant="outline" onClick={() => setEditingMeta((open) => !open)}>
              {strings.shared.edit}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              aria-label={s.stageDelete}
              onClick={() => setConfirmingDelete(true)}
            >
              <Trash2 className="size-4 text-(--color-danger)" aria-hidden />
            </Button>
          </div>
        )}
      </div>
      )}

      {state.status === "error" && (
        <p
          role="alert"
          className="rounded-(--radius-md) bg-(--color-danger-soft) px-3 py-2 text-[13px] text-(--color-danger)"
        >
          {state.message}
        </p>
      )}

      {/* Inline confirm — `ConfirmDialog` is Wave 0b and has not landed. */}
      {confirmingDelete && (
        <div className="flex flex-wrap items-center gap-2 rounded-(--radius-md) bg-(--color-danger-soft) px-3 py-2 text-[13px]">
          <span className="text-(--color-danger)">{s.stageDeleteConfirm}</span>
          <Button
            size="sm"
            variant="danger"
            loading={pending}
            onClick={() =>
              run(() =>
                deleteStageAction({
                  locale,
                  courseId,
                  versionId,
                  stageId: stage.id,
                  remainingOrder: stageOrder.filter((id) => id !== stage.id),
                })
              )
            }
          >
            {strings.shared.delete}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setConfirmingDelete(false)}>
            {s.cancelTask}
          </Button>
        </div>
      )}

      {editingMeta && (
        <div className="flex flex-col gap-3 rounded-(--radius-md) bg-(--color-surface) p-3">
          {CONTENT_LOCALES.map((contentLocale) => (
            <div key={contentLocale} className="flex flex-col gap-2">
              <p className="text-[11px] font-semibold uppercase tracking-[0.04em] text-(--color-fg-muted)">
                {localeLabel(contentLocale, strings)}
              </p>
              <Field label={strings.shared.title} required>
                <Input
                  value={drafts[contentLocale]?.title ?? ""}
                  disabled={readOnly}
                  onChange={(event) =>
                    setDrafts((current) => ({
                      ...current,
                      [contentLocale]: { ...current[contentLocale]!, title: event.target.value },
                    }))
                  }
                />
              </Field>
              <Field label={strings.shared.description} required>
                <Textarea
                  rows={2}
                  value={drafts[contentLocale]?.descriptionHtml ?? ""}
                  disabled={readOnly}
                  onChange={(event) =>
                    setDrafts((current) => ({
                      ...current,
                      [contentLocale]: {
                        ...current[contentLocale]!,
                        descriptionHtml: event.target.value,
                      },
                    }))
                  }
                />
              </Field>
            </div>
          ))}
          <div className="flex gap-2">
            <Button
              size="sm"
              loading={pending}
              onClick={() =>
                run(async () => {
                  const result = await saveStageAction({
                    locale,
                    courseId,
                    versionId,
                    stageId: stage.id,
                    localizations: CONTENT_LOCALES.map((contentLocale) => ({
                      locale: contentLocale,
                      title: drafts[contentLocale]?.title ?? "",
                      descriptionHtml: drafts[contentLocale]?.descriptionHtml ?? "",
                    })),
                  });
                  if (result.status === "ok") setEditingMeta(false);
                  return result;
                })
              }
            >
              {strings.course.saveLocalization}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setEditingMeta(false)}>
              {s.cancelTask}
            </Button>
          </div>
        </div>
      )}

      {/* ── tasks ─────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h4 className="text-[13px] font-semibold uppercase tracking-[0.04em] text-(--color-fg-muted)">
            {s.tasks}
          </h4>
          {!readOnly && (
            <Button
              size="sm"
              variant="outline"
              loading={pending}
              iconLeft={<Plus className="size-4" aria-hidden />}
              onClick={() =>
                run(() => addTaskAction({ locale, courseId, versionId, stageId: stage.id }))
              }
            >
              {s.taskAdd}
            </Button>
          )}
        </div>

        {stage.tasks.length === 0 ? (
          <p className="rounded-(--radius-md) border border-dashed border-(--color-border-strong) px-3 py-4 text-center text-[13px] text-(--color-fg-muted)">
            {s.tasksEmpty}
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {stage.tasks.map((task) => {
              const label =
                task.localizations.find((item) => item.locale === "de")?.title?.trim() ||
                `${s.tasks} ${task.position + 1}`;
              const open = openTaskId === task.id;
              const kindLabel =
                task.kind === "practical"
                  ? s.taskKindPractical
                  : task.kind === "placement"
                    ? s.taskKindPlacement
                    : s.taskKindKnowledge;
              return (
                <li
                  key={task.id}
                  className={cn(
                    "rounded-(--radius-md) border border-(--color-border) p-3",
                    open && "bg-(--color-surface)"
                  )}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <button
                      type="button"
                      aria-expanded={open}
                      onClick={() => setOpenTaskId(open ? null : task.id)}
                      className="flex min-h-11 flex-1 items-center gap-2 text-left text-[15px] font-medium hover:text-(--color-brand)"
                    >
                      <span className="tabular text-(--color-fg-subtle)">{task.position + 1}.</span>
                      <span>{label}</span>
                      <Badge tone={task.kind === "practical" ? "brand" : "neutral"}>{kindLabel}</Badge>
                    </button>

                    {!readOnly && (
                      <div className="flex items-center gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          aria-label={strings.shared.moveUp}
                          disabled={pending || task.position === 0}
                          onClick={() =>
                            run(() =>
                              reorderTasksAction({
                                locale,
                                courseId,
                                versionId,
                                stageId: stage.id,
                                orderedIds: moved(taskOrder, task.id, -1),
                              })
                            )
                          }
                        >
                          <ChevronUp className="size-4" aria-hidden />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          aria-label={strings.shared.moveDown}
                          disabled={pending || task.position === stage.tasks.length - 1}
                          onClick={() =>
                            run(() =>
                              reorderTasksAction({
                                locale,
                                courseId,
                                versionId,
                                stageId: stage.id,
                                orderedIds: moved(taskOrder, task.id, 1),
                              })
                            )
                          }
                        >
                          <ChevronDown className="size-4" aria-hidden />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          aria-label={s.taskDelete}
                          onClick={() => setConfirmingTask(task.id)}
                        >
                          <Trash2 className="size-4 text-(--color-danger)" aria-hidden />
                        </Button>
                      </div>
                    )}
                  </div>

                  {confirmingTask === task.id && (
                    <div className="mt-2 flex flex-wrap items-center gap-2 rounded-(--radius-md) bg-(--color-danger-soft) px-3 py-2 text-[13px]">
                      <span className="text-(--color-danger)">{s.taskDeleteConfirm}</span>
                      <Button
                        size="sm"
                        variant="danger"
                        loading={pending}
                        onClick={() =>
                          run(() =>
                            deleteTaskAction({
                              locale,
                              courseId,
                              versionId,
                              stageId: stage.id,
                              taskId: task.id,
                              remainingOrder: taskOrder.filter((id) => id !== task.id),
                            })
                          )
                        }
                      >
                        {strings.shared.delete}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setConfirmingTask(null)}>
                        {s.cancelTask}
                      </Button>
                    </div>
                  )}

                  {/**
                    * §1.4 asks for a modal, explicitly not a page and not a
                    * dropdown. It used to expand inline here, which pushed
                    * every task below it down the list and left an author
                    * scrolling past tasks they were not editing.
                    *
                    * Still mounted only while open: the editor holds a full
                    * draft of the task in state, and mounting one per task
                    * would build that draft for every row on every render.
                    */}
                  {open && (
                    <TaskEditorDialog
                      open={open}
                      locale={locale}
                      courseId={courseId}
                      versionId={versionId}
                      task={task}
                      scenarios={scenarios}
                      strings={strings}
                      readOnly={readOnly}
                      onClose={() => setOpenTaskId(null)}
                    />
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Card>
  );
}
