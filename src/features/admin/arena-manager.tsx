"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Trash2, ArrowUp, ArrowDown, Award } from "lucide-react";

import { Button, Card, Field, Input, Textarea, Select, Badge, EmptyState, ConfirmDialog } from "@/shared/ui";
import type { ArenaTaskDetail, Badge as BadgeRow, SaveArenaTaskInput } from "@/shared/data/admin";
import { saveArenaTaskAction, deleteArenaTaskAction, reorderArenaTasksAction } from "@/shared/data/admin-actions";

import { FormMessage } from "./form-message";

function ArenaTaskEditor({
  locale,
  task,
  badges,
  onDone,
}: {
  locale: string;
  task?: ArenaTaskDetail;
  badges: BadgeRow[];
  onDone: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [title, setTitle] = useState(task?.title ?? "");
  const [description, setDescription] = useState(task?.description ?? "");
  const [htmlWindow, setHtmlWindow] = useState(task?.html_window ?? "");
  const [hint, setHint] = useState(task?.hint ?? "");
  const [xp, setXp] = useState(String(task?.xp_reward ?? 0));
  const [badgeId, setBadgeId] = useState(task?.badge_id ?? "");
  const [acceptance, setAcceptance] = useState(task?.answer?.acceptance_criteria ?? "");
  const [answerKey, setAnswerKey] = useState(task?.answer?.answer_key ?? "");

  function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    const input: SaveArenaTaskInput = {
      ...(task ? { id: task.id } : {}),
      title,
      description,
      html_window: htmlWindow,
      hint,
      xp_reward: Number.parseInt(xp, 10) || 0,
      badge_id: badgeId || null,
      acceptance_criteria: acceptance,
      answer_key: answerKey,
    };
    startTransition(async () => {
      const result = await saveArenaTaskAction(input, locale);
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
        <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Login-Formular testen" />
      </Field>

      <Field label="Beschreibung">
        <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
      </Field>

      <Field
        label="HTML-Fenster"
        hint="Das HTML, das dem Teilnehmer zum Untersuchen angezeigt wird."
      >
        <Textarea
          value={htmlWindow}
          onChange={(e) => setHtmlWindow(e.target.value)}
          rows={5}
          className="font-mono text-[13px]"
          placeholder="<form>…</form>"
        />
      </Field>

      <Field label="Hinweis (Hint)">
        <Input value={hint} onChange={(e) => setHint(e.target.value)} />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="XP-Belohnung">
          <Input type="number" min={0} value={xp} onChange={(e) => setXp(e.target.value)} />
        </Field>
        <Field label="Badge (optional)">
          <Select value={badgeId} onChange={(e) => setBadgeId(e.target.value)}>
            <option value="">Kein Badge</option>
            {badges.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <Field
        label="Abnahmekriterien (nur Trainer/Admin)"
        hint="Wie die Einreichung zu bewerten ist. Für Teilnehmer nicht sichtbar."
      >
        <Textarea value={acceptance} onChange={(e) => setAcceptance(e.target.value)} rows={2} />
      </Field>

      <Field
        label="Lösungsschlüssel (nur Trainer/Admin)"
        hint="Referenzlösung / eingebaute Fehler. Für Teilnehmer nicht sichtbar."
      >
        <Textarea value={answerKey} onChange={(e) => setAnswerKey(e.target.value)} rows={2} />
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

export function ArenaTasksManager({
  locale,
  tasks,
  badges,
}: {
  locale: string;
  tasks: ArenaTaskDetail[];
  badges: BadgeRow[];
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const badgeName = new Map(badges.map((b) => [b.id, b.name]));
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
      const result = await reorderArenaTasksAction(next, locale);
      if (!result.ok) setError(result.error);
      else router.refresh();
    });
  }

  function confirmDelete() {
    if (!confirmId) return;
    const id = confirmId;
    setError(null);
    startTransition(async () => {
      const result = await deleteArenaTaskAction(id, locale);
      setConfirmId(null);
      if (!result.ok) setError(result.error);
      else router.refresh();
    });
  }

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center justify-end">
        {editing !== "new" && (
          <Button size="sm" iconLeft={<Plus className="size-4" aria-hidden />} onClick={() => setEditing("new")}>
            Arena-Aufgabe erstellen
          </Button>
        )}
      </div>

      {error && <FormMessage tone="error">{error}</FormMessage>}

      {editing === "new" && <ArenaTaskEditor locale={locale} badges={badges} onDone={done} />}

      {tasks.length === 0 && editing !== "new" ? (
        <EmptyState
          title="Noch keine Arena-Aufgaben"
          description="Erstellen Sie die erste Bug-Hunt-Aufgabe für die globale Arena-Kette."
        />
      ) : (
        <ol className="flex flex-col gap-3">
          {tasks.map((task, index) => {
            if (editing === task.id) {
              return (
                <li key={task.id}>
                  <ArenaTaskEditor locale={locale} task={task} badges={badges} onDone={done} />
                </li>
              );
            }
            return (
              <li key={task.id}>
                <Card className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <span className="tabular mt-0.5 inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-(--color-surface-2) text-[13px] font-semibold">
                      {index + 1}
                    </span>
                    <div className="flex flex-col gap-1">
                      <p className="font-semibold leading-5">{task.title}</p>
                      <div className="flex flex-wrap gap-1.5">
                        <Badge tone="info">{task.xp_reward} XP</Badge>
                        {task.badge_id && (
                          <Badge tone="brand">
                            <Award className="size-3" aria-hidden />
                            {badgeName.get(task.badge_id) ?? "Badge"}
                          </Badge>
                        )}
                        {task.answer?.answer_key ? (
                          <Badge tone="success">Lösung hinterlegt</Badge>
                        ) : (
                          <Badge tone="warning">Ohne Lösung</Badge>
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
                    <Button variant="ghost" size="icon" onClick={() => setEditing(task.id)} aria-label="Bearbeiten">
                      <Pencil className="size-4" aria-hidden />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => setConfirmId(task.id)} aria-label="Löschen">
                      <Trash2 className="size-4" aria-hidden />
                    </Button>
                  </div>
                </Card>
              </li>
            );
          })}
        </ol>
      )}

      <ConfirmDialog
        open={confirmId !== null}
        title="Arena-Aufgabe löschen?"
        description="Die Aufgabe und ihr Lösungsschlüssel werden dauerhaft entfernt."
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
