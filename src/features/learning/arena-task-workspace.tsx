"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { ArrowLeft, Check, ImagePlus, Lightbulb, Lock } from "lucide-react";
import { PageHeader } from "@/shared/layout/page-header";
import { Button, Card, Input, Textarea } from "@/shared/ui";
import type { ArenaTaskWorkspaceData } from "@/shared/data/learning";
import { addArenaImage, saveArenaDraft, submitArenaTask } from "@/shared/data/learning-actions";
import { TaskStatusBadge } from "./labels";

type SaveState = "idle" | "saving" | "saved" | "error";

export function ArenaTaskWorkspace({
  locale,
  data,
  arenaHref,
}: {
  locale: string;
  data: ArenaTaskWorkspaceData;
  arenaHref: string;
}) {
  const router = useRouter();
  const { task, submission, images } = data;

  const state = submission?.state ?? null;
  const readOnly = state === "submitted" || state === "accepted";
  const editable = !data.locked && !readOnly;

  const [text, setText] = useState(submission?.responseText ?? "");
  const [submissionId, setSubmissionId] = useState<string | null>(submission?.id ?? null);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [caption, setCaption] = useState("");
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const fileRef = useRef<HTMLInputElement>(null);
  const firstRun = useRef(true);

  // Debounced auto-save of the bug report text.
  useEffect(() => {
    if (!editable) return;
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    setSaveState("saving");
    const handle = setTimeout(() => {
      void saveArenaDraft(task.id, { responseText: text }).then((result) => {
        if (result.ok) {
          setSubmissionId(result.data.submissionId);
          setSaveState("saved");
        } else {
          setSaveState("error");
        }
      });
    }, 800);
    return () => clearTimeout(handle);
  }, [text, editable, task.id]);

  /** Make sure a draft submission exists so images have something to attach to. */
  async function ensureSubmissionId(): Promise<string | null> {
    if (submissionId) return submissionId;
    const result = await saveArenaDraft(task.id, { responseText: text });
    if (!result.ok) {
      setAddError(result.error.message);
      return null;
    }
    setSubmissionId(result.data.submissionId);
    return result.data.submissionId;
  }

  async function onAddImage() {
    setAddError(null);
    const file = fileRef.current?.files?.[0];
    if (!file) {
      setAddError("Bitte ein Bild auswählen.");
      return;
    }
    setAdding(true);
    const id = await ensureSubmissionId();
    if (!id) {
      setAdding(false);
      return;
    }
    const formData = new FormData();
    formData.set("file", file);
    formData.set("caption", caption);
    const result = await addArenaImage(id, formData);
    setAdding(false);
    if (result.ok) {
      setCaption("");
      if (fileRef.current) fileRef.current.value = "";
      router.refresh();
    } else {
      setAddError(result.error.message);
    }
  }

  async function onSubmit() {
    setSubmitError(null);
    setSubmitting(true);
    const saveResult = await saveArenaDraft(task.id, { responseText: text });
    if (!saveResult.ok) {
      setSubmitError(saveResult.error.message);
      setSubmitting(false);
      return;
    }
    const result = await submitArenaTask(task.id);
    setSubmitting(false);
    if (result.ok) router.refresh();
    else setSubmitError(result.error.message);
  }

  const header = (
    <PageHeader
      title={task.title}
      breadcrumbs={[{ label: "Arena", href: `/${locale}/learn/arena` }, { label: task.title }]}
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
            Diese Arena-Aufgabe ist noch gesperrt
          </span>
          <p className="text-[14px] text-(--color-fg-muted)">
            Schließe zuerst die vorherige Arena-Aufgabe ab, damit die Trainerin sie annehmen kann.
          </p>
          <Link href={arenaHref as Route}>
            <Button variant="outline" size="sm" iconLeft={<ArrowLeft className="size-4" aria-hidden />}>
              Zurück zur Arena
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
            href={arenaHref as Route}
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

        <section className="flex flex-col gap-2">
          <h2 className="text-[16px] font-semibold">Testumgebung</h2>
          <p className="text-[13px] text-(--color-fg-muted)">
            Untersuche das Fenster und finde die Fehler. Es läuft isoliert und hat keinen Zugriff auf deine Sitzung.
          </p>
          {/*
            The window is admin-authored HTML rendered in a sandboxed frame.
            `sandbox` withholds `allow-same-origin`, so scripts run in an opaque
            origin with no access to our cookies, storage or DOM. srcDoc content
            is `about:srcdoc`, which the app CSP (`frame-src 'self'`) permits.
          */}
          <iframe
            title={`Testumgebung: ${task.title}`}
            srcDoc={task.htmlWindow}
            sandbox="allow-scripts allow-forms"
            className="h-[600px] w-full rounded-(--radius-lg) border border-(--color-border) bg-white"
          />
        </section>

        <Card className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <label htmlFor="arena-report" className="text-[15px] font-semibold">
              Fehlerbericht
            </label>
            {editable ? (
              <Textarea
                id="arena-report"
                rows={6}
                value={text}
                onChange={(event) => setText(event.target.value)}
                placeholder="Beschreibe die gefundenen Fehler: Was ist passiert, was wäre erwartet, wie reproduziert man es?"
              />
            ) : (
              <p className="whitespace-pre-wrap rounded-(--radius-md) border border-(--color-border) bg-(--color-surface) p-3 text-[14px]">
                {text || <span className="text-(--color-fg-subtle)">— kein Bericht —</span>}
              </p>
            )}
            {editable && (
              <span className="text-[13px] text-(--color-fg-muted)" aria-live="polite">
                {saveState === "saving" && "Speichert…"}
                {saveState === "saved" && "Automatisch gespeichert"}
                {saveState === "error" && (
                  <span className="text-(--color-danger)">Speichern fehlgeschlagen</span>
                )}
              </span>
            )}
          </div>

          <ImageList images={images} />

          {editable && (
            <div className="flex flex-col gap-3 border-t border-(--color-border) pt-4">
              <span className="text-[14px] font-semibold">Bild hinzufügen</span>
              <Input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="h-auto py-2 file:mr-3 file:rounded-(--radius-sm) file:border-0 file:bg-(--color-surface-2) file:px-3 file:py-1.5 file:text-[13px] file:font-semibold"
              />
              <Input
                type="text"
                value={caption}
                onChange={(event) => setCaption(event.target.value)}
                placeholder="Bildunterschrift (welcher Fehler ist zu sehen?)"
              />
              {addError && <p className="text-[13px] font-medium text-(--color-danger)">{addError}</p>}
              <Button
                variant="outline"
                size="sm"
                onClick={onAddImage}
                loading={adding}
                iconLeft={<ImagePlus className="size-4" aria-hidden />}
                className="self-start"
              >
                Bild hochladen
              </Button>
            </div>
          )}
        </Card>

        {editable && (
          <div className="flex flex-col gap-2">
            {submitError && <p className="text-[13px] font-medium text-(--color-danger)">{submitError}</p>}
            <div className="flex items-center justify-between gap-3">
              <p className="text-[13px] text-(--color-fg-muted)">
                Nach dem Einreichen geht dein Bericht an die Trainerin.
              </p>
              <Button onClick={onSubmit} loading={submitting} iconLeft={<Check className="size-4" aria-hidden />}>
                Einreichen
              </Button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

function ImageList({ images }: { images: { id: string; url: string | null; caption: string }[] }) {
  if (images.length === 0) return null;
  return (
    <div className="flex flex-col gap-2">
      <span className="text-[14px] font-semibold">Angehängte Bilder ({images.length})</span>
      <ul className="grid list-none gap-3 p-0 sm:grid-cols-2">
        {images.map((image) => (
          <li key={image.id} className="flex flex-col gap-1 rounded-(--radius-md) border border-(--color-border) p-2">
            {image.url ? (
              // eslint-disable-next-line @next/next/no-img-element -- signed URL to a private bucket object
              <img
                src={image.url}
                alt={image.caption || "Fehlerbild"}
                className="aspect-video w-full rounded-(--radius-sm) object-cover"
              />
            ) : (
              <div className="flex aspect-video w-full items-center justify-center rounded-(--radius-sm) bg-(--color-surface-2) text-[13px] text-(--color-fg-subtle)">
                Bild nicht verfügbar
              </div>
            )}
            {image.caption && <p className="text-[13px] text-(--color-fg-muted)">{image.caption}</p>}
          </li>
        ))}
      </ul>
    </div>
  );
}
