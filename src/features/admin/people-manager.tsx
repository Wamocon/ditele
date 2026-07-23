"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, UserMinus } from "lucide-react";

import { Button, Card, CardTitle, Select, Badge, EmptyState } from "@/shared/ui";
import type { CourseAssignments, Profile, ActionResult } from "@/shared/data/admin";
import {
  enrollStudentAction,
  removeStudentAction,
  addTrainerAction,
  removeTrainerAction,
} from "@/shared/data/admin-actions";

import { FormMessage } from "./form-message";

type Kind = "student" | "trainer";

function PeopleSection({
  locale,
  courseId,
  title,
  emptyText,
  assigned,
  candidates,
  kind,
}: {
  locale: string;
  courseId: string;
  title: string;
  emptyText: string;
  assigned: Profile[];
  candidates: Profile[];
  kind: Kind;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [selected, setSelected] = useState("");
  const [error, setError] = useState<string | null>(null);

  function run(fn: () => Promise<ActionResult>) {
    setError(null);
    startTransition(async () => {
      const result = await fn();
      if (!result.ok) setError(result.error);
      else router.refresh();
    });
  }

  function onAdd() {
    if (!selected) return;
    const id = selected;
    setSelected("");
    run(() =>
      kind === "student"
        ? enrollStudentAction(courseId, id, locale)
        : addTrainerAction(courseId, id, locale)
    );
  }

  function onRemove(id: string) {
    run(() =>
      kind === "student"
        ? removeStudentAction(courseId, id, locale)
        : removeTrainerAction(courseId, id, locale)
    );
  }

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <CardTitle>{title}</CardTitle>
        <Badge tone="neutral">{assigned.length}</Badge>
      </div>

      {assigned.length === 0 ? (
        <EmptyState title={emptyText} />
      ) : (
        <ul className="flex flex-col gap-2">
          {assigned.map((person) => (
            <li
              key={person.id}
              className="flex items-center justify-between gap-3 rounded-(--radius-md) border border-(--color-border) px-3 py-2"
            >
              <div className="flex flex-col">
                <span className="text-[15px] font-medium leading-5">{person.display_name || "—"}</span>
                {!person.is_active && (
                  <span className="text-[13px] text-(--color-fg-muted)">Inaktiv</span>
                )}
              </div>
              <Button
                variant="ghost"
                size="sm"
                iconLeft={<UserMinus className="size-4" aria-hidden />}
                onClick={() => onRemove(person.id)}
                disabled={pending}
              >
                Entfernen
              </Button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex items-end gap-2">
        <div className="flex-1">
          <Select value={selected} onChange={(e) => setSelected(e.target.value)} disabled={candidates.length === 0}>
            <option value="">
              {candidates.length === 0 ? "Keine verfügbaren Personen" : "Person auswählen…"}
            </option>
            {candidates.map((c) => (
              <option key={c.id} value={c.id}>
                {c.display_name || c.id}
              </option>
            ))}
          </Select>
        </div>
        <Button
          iconLeft={<Plus className="size-4" aria-hidden />}
          onClick={onAdd}
          disabled={pending || !selected}
        >
          Hinzufügen
        </Button>
      </div>

      {error && <FormMessage tone="error">{error}</FormMessage>}
    </Card>
  );
}

export function PeopleManager({
  locale,
  courseId,
  assignments,
}: {
  locale: string;
  courseId: string;
  assignments: CourseAssignments;
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <PeopleSection
        locale={locale}
        courseId={courseId}
        title="Teilnehmer"
        emptyText="Noch keine Teilnehmer eingeschrieben."
        assigned={assignments.students}
        candidates={assignments.candidateStudents}
        kind="student"
      />
      <PeopleSection
        locale={locale}
        courseId={courseId}
        title="Trainer"
        emptyText="Noch keine Trainer zugewiesen."
        assigned={assignments.trainers}
        candidates={assignments.candidateTrainers}
        kind="trainer"
      />
    </div>
  );
}
