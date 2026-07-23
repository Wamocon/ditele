"use client";

import { useState, useTransition } from "react";
import { Plus, Trash2 } from "lucide-react";

import { Button, Card, Field, Input, Textarea, Select, cn } from "@/shared/ui";
import type { CourseTaskDetail, SaveCourseTaskInput, CourseTaskOptionInput } from "@/shared/data/admin";
import { saveCourseTaskAction } from "@/shared/data/admin-actions";

import { FormMessage } from "./form-message";

export interface ArenaOption {
  id: string;
  title: string;
  order_index: number;
}

interface OptionDraft {
  key: string;
  id?: string;
  label: string;
  is_correct: boolean;
}

let optionCounter = 0;
function newOption(): OptionDraft {
  optionCounter += 1;
  return { key: `new-${optionCounter}`, label: "", is_correct: false };
}

function initialOptions(task: CourseTaskDetail | undefined): OptionDraft[] {
  if (!task || task.options.length === 0) return [newOption(), newOption()];
  const correct = new Set(task.answer?.correct_option_ids ?? []);
  return task.options.map((o) => ({ key: o.id, id: o.id, label: o.label, is_correct: correct.has(o.id) }));
}

/**
 * Create / edit one course task, including its MCQ options (with correct
 * flags), the trainer-only verification answer, and an optional attached arena
 * task. Calls `saveCourseTaskAction`, then hands control back via `onDone`.
 */
export function CourseTaskEditor({
  locale,
  courseId,
  task,
  arenaTasks,
  onDone,
}: {
  locale: string;
  courseId: string;
  task?: CourseTaskDetail;
  arenaTasks: ArenaOption[];
  onDone: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [title, setTitle] = useState(task?.title ?? "");
  const [description, setDescription] = useState(task?.description ?? "");
  const [hint, setHint] = useState(task?.hint ?? "");
  const [videoBefore, setVideoBefore] = useState(task?.video_before_url ?? "");
  const [videoAfter, setVideoAfter] = useState(task?.video_after_url ?? "");
  const [mcqQuestion, setMcqQuestion] = useState(task?.mcq_question ?? "");
  const [arenaTaskId, setArenaTaskId] = useState(task?.arena_task_id ?? "");
  const [verification, setVerification] = useState(task?.answer?.verification_answer ?? "");
  const [options, setOptions] = useState<OptionDraft[]>(() => initialOptions(task));

  function setOption(key: string, patch: Partial<OptionDraft>) {
    setOptions((prev) => prev.map((o) => (o.key === key ? { ...o, ...patch } : o)));
  }
  function removeOption(key: string) {
    setOptions((prev) => prev.filter((o) => o.key !== key));
  }

  function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    const optionInputs: CourseTaskOptionInput[] = options
      .filter((o) => o.label.trim() !== "")
      .map((o) => (o.id ? { id: o.id, label: o.label, is_correct: o.is_correct } : { label: o.label, is_correct: o.is_correct }));

    const input: SaveCourseTaskInput = {
      ...(task ? { id: task.id } : {}),
      courseId,
      title,
      description,
      hint,
      video_before_url: videoBefore,
      video_after_url: videoAfter,
      mcq_question: mcqQuestion,
      arena_task_id: arenaTaskId || null,
      verification_answer: verification,
      options: optionInputs,
    };

    startTransition(async () => {
      const result = await saveCourseTaskAction(input, locale);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onDone();
    });
  }

  return (
    <Card as="form" onSubmit={onSubmit} className="flex flex-col gap-4 border-(--color-border-strong)">
      <Field label="Titel" required>
        <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Was ist Softwaretesten?" />
      </Field>

      <Field label="Beschreibung / Anleitung">
        <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
      </Field>

      <Field label="Hinweis (Hint)">
        <Input value={hint} onChange={(e) => setHint(e.target.value)} />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Video vorher (URL)">
          <Input value={videoBefore} onChange={(e) => setVideoBefore(e.target.value)} placeholder="https://…" />
        </Field>
        <Field label="Video nachher (URL)">
          <Input value={videoAfter} onChange={(e) => setVideoAfter(e.target.value)} placeholder="https://…" />
        </Field>
      </div>

      <Field
        label="Angehängte Arena-Aufgabe (optional)"
        hint="Diese Aufgabe wird erst freigeschaltet, wenn die gewählte Arena-Aufgabe angenommen ist."
      >
        <Select value={arenaTaskId} onChange={(e) => setArenaTaskId(e.target.value)}>
          <option value="">Keine</option>
          {arenaTasks.map((a) => (
            <option key={a.id} value={a.id}>
              #{a.order_index} · {a.title}
            </option>
          ))}
        </Select>
      </Field>

      <Field
        label="Pflichtfrage (MCQ)"
        hint="Text der Pflichtfrage. Leer lassen, wenn diese Aufgabe keine Gate-Frage hat."
      >
        <Input value={mcqQuestion} onChange={(e) => setMcqQuestion(e.target.value)} />
      </Field>

      <fieldset className="flex flex-col gap-3 rounded-(--radius-md) border border-(--color-border) p-3">
        <legend className="px-1 text-[13px] font-semibold text-(--color-fg-muted)">
          Antwortoptionen (mehrere richtig möglich)
        </legend>
        {options.length === 0 && (
          <p className="text-[13px] text-(--color-fg-muted)">Noch keine Optionen.</p>
        )}
        {options.map((o) => (
          <div key={o.key} className="flex items-center gap-2">
            <label
              className={cn(
                "flex shrink-0 cursor-pointer items-center gap-1.5 rounded-(--radius-sm) border px-2 py-2 text-[13px] font-semibold",
                o.is_correct
                  ? "border-(--color-success) bg-(--color-success-soft) text-(--color-success)"
                  : "border-(--color-border-strong) text-(--color-fg-muted)"
              )}
            >
              <input
                type="checkbox"
                checked={o.is_correct}
                onChange={(e) => setOption(o.key, { is_correct: e.target.checked })}
                className="size-4"
              />
              Richtig
            </label>
            <Input
              value={o.label}
              onChange={(e) => setOption(o.key, { label: e.target.value })}
              placeholder="Antworttext"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => removeOption(o.key)}
              aria-label="Option entfernen"
            >
              <Trash2 className="size-4" aria-hidden />
            </Button>
          </div>
        ))}
        <div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            iconLeft={<Plus className="size-4" aria-hidden />}
            onClick={() => setOptions((prev) => [...prev, newOption()])}
          >
            Option hinzufügen
          </Button>
        </div>
      </fieldset>

      <Field
        label="Verifizierungsantwort (nur Trainer/Admin)"
        hint="Referenzantwort für die Bewertung. Für Teilnehmer nicht sichtbar."
      >
        <Textarea value={verification} onChange={(e) => setVerification(e.target.value)} rows={2} />
      </Field>

      {error && <FormMessage tone="error">{error}</FormMessage>}

      <div className="flex items-center gap-2">
        <Button type="submit" loading={pending}>
          Aufgabe speichern
        </Button>
        <Button type="button" variant="ghost" onClick={onDone} disabled={pending}>
          Abbrechen
        </Button>
      </div>
    </Card>
  );
}
