"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { ArrowLeft, Check, Lightbulb, Lock } from "lucide-react";
import { PageHeader } from "@/shared/layout/page-header";
import { Button, Card, CardTitle, Textarea, VideoEmbed } from "@/shared/ui";
import type { CourseTaskWorkspaceData } from "@/shared/data/learning";
import {
  saveCourseTaskDraft,
  setTaskEmoji,
  submitCourseTask,
} from "@/shared/data/learning-actions";
import { TaskStatusBadge, lockReasonText } from "./labels";

const EMOJIS = ["🤩", "😀", "🙂", "😐", "😕", "😩"];
type SaveState = "idle" | "saving" | "saved" | "error";

export function CourseTaskWorkspace({
  locale,
  data,
  courseHref,
}: {
  locale: string;
  data: CourseTaskWorkspaceData;
  courseHref: string;
}) {
  const router = useRouter();
  const { task, options, submission } = data;

  const state = submission?.state ?? null;
  const readOnly = state === "submitted" || state === "accepted";
  const editable = !data.locked && !readOnly;

  const [text, setText] = useState(submission?.responseText ?? "");
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(submission?.selectedOptionIds ?? []),
  );
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [pickedEmoji, setPickedEmoji] = useState<string | null>(data.emoji);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const firstRun = useRef(true);

  // Debounced auto-save (~800ms). The in_progress submission IS the draft, so a
  // reload restores exactly what was typed — nothing is lost.
  useEffect(() => {
    if (!editable) return;
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    setSaveState("saving");
    const handle = setTimeout(() => {
      void saveCourseTaskDraft(task.id, {
        responseText: text,
        selectedOptionIds: [...selected],
      }).then((result) => setSaveState(result.ok ? "saved" : "error"));
    }, 800);
    return () => clearTimeout(handle);
  }, [text, selected, editable, task.id]);

  function toggleOption(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function onSubmit() {
    setSubmitError(null);
    setSubmitting(true);
    // Flush the latest answer, then lock it in.
    const saveResult = await saveCourseTaskDraft(task.id, {
      responseText: text,
      selectedOptionIds: [...selected],
    });
    if (!saveResult.ok) {
      setSubmitError(saveResult.error.message);
      setSubmitting(false);
      return;
    }
    const result = await submitCourseTask(task.id);
    setSubmitting(false);
    if (result.ok) router.refresh();
    else setSubmitError(result.error.message);
  }

  async function pickEmoji(emoji: string) {
    const result = await setTaskEmoji(task.id, emoji);
    if (result.ok) {
      setPickedEmoji(emoji);
      router.refresh();
    }
  }

  const header = (
    <PageHeader
      title={task.title}
      breadcrumbs={[
        { label: "Kurse", href: `/${locale}/learn/courses` },
        { label: "Aufgabe" },
      ]}
      locale={locale}
    />
  );

  if (data.locked) {
    return (
      <>
        {header}
        <Card className="flex flex-col items-start gap-3">
          <span className="flex items-center gap-2 text-[15px] font-semibold text-(--color-fg-muted)">
            <Lock className="size-5" aria-hidden />
            Diese Aufgabe ist noch gesperrt
          </span>
          <p className="text-[14px] text-(--color-fg-muted)">{lockReasonText(data.lockReason)}</p>
          <Link href={courseHref as Route}>
            <Button variant="outline" size="sm" iconLeft={<ArrowLeft className="size-4" aria-hidden />}>
              Zurück zum Kurs
            </Button>
          </Link>
        </Card>
      </>
    );
  }

  return (
    <>
      {header}

      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between gap-3">
          <Link
            href={courseHref as Route}
            className="inline-flex items-center gap-1 text-[14px] text-(--color-fg-muted) hover:text-(--color-brand)"
          >
            <ArrowLeft className="size-4" aria-hidden />
            Zurück
          </Link>
          {state && <TaskStatusBadge state={state} />}
        </div>

        {task.description && (
          <p className="max-w-prose whitespace-pre-wrap text-[15px] leading-6">{task.description}</p>
        )}

        {task.hint && (
          <div className="flex items-start gap-2 rounded-(--radius-md) border border-(--color-border) bg-(--color-surface) p-3">
            <Lightbulb className="mt-0.5 size-4 shrink-0 text-(--color-warning)" aria-hidden />
            <p className="text-[14px] text-(--color-fg-muted)">{task.hint}</p>
          </div>
        )}

        {/* Before-video: the lead-in the learner watches while working. */}
        {task.videoBeforeUrl && (
          <section className="flex flex-col gap-2">
            <h2 className="text-[16px] font-semibold">Video zur Aufgabe</h2>
            <VideoEmbed url={task.videoBeforeUrl} title="Video zur Aufgabe" intro locale={locale} />
          </section>
        )}

        {editable ? (
          <EditForm
            mcqQuestion={task.mcqQuestion}
            options={options}
            selected={selected}
            onToggle={toggleOption}
            text={text}
            onText={setText}
            saveState={saveState}
            submitting={submitting}
            submitError={submitError}
            onSubmit={onSubmit}
          />
        ) : (
          <ReadOnlyAnswer
            mcqQuestion={task.mcqQuestion}
            options={options}
            selected={selected}
            text={text}
          />
        )}

        {/* After submit: the after-video + a one-time feedback emoji to the admin. */}
        {readOnly && (
          <>
            {task.videoAfterUrl && (
              <section className="flex flex-col gap-2">
                <h2 className="text-[16px] font-semibold">Nachbereitung</h2>
                <VideoEmbed url={task.videoAfterUrl} title="Video nach der Aufgabe" locale={locale} />
              </section>
            )}
            <EmojiFeedback picked={pickedEmoji} onPick={pickEmoji} />
          </>
        )}
      </div>
    </>
  );
}

function EditForm({
  mcqQuestion,
  options,
  selected,
  onToggle,
  text,
  onText,
  saveState,
  submitting,
  submitError,
  onSubmit,
}: {
  mcqQuestion: string | null;
  options: { id: string; label: string }[];
  selected: Set<string>;
  onToggle: (id: string) => void;
  text: string;
  onText: (value: string) => void;
  saveState: SaveState;
  submitting: boolean;
  submitError: string | null;
  onSubmit: () => void;
}) {
  return (
    <Card className="flex flex-col gap-6">
      {(mcqQuestion || options.length > 0) && (
        <fieldset className="flex flex-col gap-3">
          <legend className="text-[15px] font-semibold">
            {mcqQuestion ?? "Wähle die zutreffenden Antworten"}
          </legend>
          <p className="text-[13px] text-(--color-fg-muted)">Mehrere Antworten können richtig sein.</p>
          <div className="flex flex-col gap-2">
            {options.map((option) => {
              const checked = selected.has(option.id);
              return (
                <label
                  key={option.id}
                  className="flex cursor-pointer items-center gap-3 rounded-(--radius-md) border border-(--color-border) p-3 hover:bg-(--color-surface) has-[:checked]:border-(--color-brand) has-[:checked]:bg-(--color-brand-soft)"
                >
                  <input
                    type="checkbox"
                    className="size-4 accent-(--color-brand)"
                    checked={checked}
                    onChange={() => onToggle(option.id)}
                  />
                  <span className="text-[14px]">{option.label}</span>
                </label>
              );
            })}
          </div>
        </fieldset>
      )}

      <div className="flex flex-col gap-2">
        <label htmlFor="task-response" className="text-[15px] font-semibold">
          Deine Antwort
        </label>
        <Textarea
          id="task-response"
          rows={6}
          value={text}
          onChange={(event) => onText(event.target.value)}
          placeholder="Schreibe hier deine Antwort…"
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-[13px] text-(--color-fg-muted)" aria-live="polite">
          {saveState === "saving" && "Speichert…"}
          {saveState === "saved" && "Automatisch gespeichert"}
          {saveState === "error" && (
            <span className="text-(--color-danger)">Speichern fehlgeschlagen</span>
          )}
        </span>
        <Button onClick={onSubmit} loading={submitting} iconLeft={<Check className="size-4" aria-hidden />}>
          Einreichen
        </Button>
      </div>

      {submitError && <p className="text-[13px] font-medium text-(--color-danger)">{submitError}</p>}
      <p className="text-[13px] text-(--color-fg-muted)">
        Nach dem Einreichen ist die Aufgabe schreibgeschützt und geht an die Trainerin.
      </p>
    </Card>
  );
}

function ReadOnlyAnswer({
  mcqQuestion,
  options,
  selected,
  text,
}: {
  mcqQuestion: string | null;
  options: { id: string; label: string }[];
  selected: Set<string>;
  text: string;
}) {
  return (
    <Card className="flex flex-col gap-6">
      {(mcqQuestion || options.length > 0) && (
        <div className="flex flex-col gap-3">
          <p className="text-[15px] font-semibold">{mcqQuestion ?? "Deine Auswahl"}</p>
          <div className="flex flex-col gap-2">
            {options.map((option) => {
              const checked = selected.has(option.id);
              return (
                <div
                  key={option.id}
                  className={
                    checked
                      ? "flex items-center gap-3 rounded-(--radius-md) border border-(--color-brand) bg-(--color-brand-soft) p-3"
                      : "flex items-center gap-3 rounded-(--radius-md) border border-(--color-border) p-3 opacity-70"
                  }
                >
                  <input type="checkbox" className="size-4 accent-(--color-brand)" checked={checked} disabled readOnly />
                  <span className="text-[14px]">{option.label}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="flex flex-col gap-2">
        <p className="text-[15px] font-semibold">Deine Antwort</p>
        <p className="whitespace-pre-wrap rounded-(--radius-md) border border-(--color-border) bg-(--color-surface) p-3 text-[14px]">
          {text || <span className="text-(--color-fg-subtle)">— keine Antwort —</span>}
        </p>
      </div>
    </Card>
  );
}

function EmojiFeedback({ picked, onPick }: { picked: string | null; onPick: (emoji: string) => void }) {
  return (
    <Card className="flex flex-col gap-3">
      <CardTitle>Wie war diese Aufgabe?</CardTitle>
      {picked ? (
        <p className="flex items-center gap-2 text-[14px] text-(--color-fg-muted)">
          <span className="text-[24px]" aria-hidden>
            {picked}
          </span>
          Danke für dein Feedback!
        </p>
      ) : (
        <>
          <p className="text-[13px] text-(--color-fg-muted)">
            Ein Tipp an das Team — einmalig und danach nicht mehr änderbar.
          </p>
          <div className="flex flex-wrap gap-2">
            {EMOJIS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                aria-label={`Feedback ${emoji}`}
                onClick={() => onPick(emoji)}
                className="flex size-12 items-center justify-center rounded-(--radius-md) border border-(--color-border) text-[24px] transition-transform hover:scale-110 hover:border-(--color-brand) focus-visible:outline-2 focus-visible:outline-(--color-brand)"
              >
                {emoji}
              </button>
            ))}
          </div>
        </>
      )}
    </Card>
  );
}
