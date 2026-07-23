"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Card, CardTitle, Select, StatusBadge } from "@/shared/ui";
import type { CourseState } from "@/shared/data/admin";
import { setCourseStateAction } from "@/shared/data/admin-actions";

import { FormMessage } from "./form-message";

const STATES: { value: CourseState; label: string }[] = [
  { value: "active", label: "Aktiv" },
  { value: "inactive", label: "Inaktiv" },
  { value: "archived", label: "Archiviert" },
  { value: "deleted", label: "Gelöscht" },
];

export function CourseStateControl({
  locale,
  courseId,
  state,
}: {
  locale: string;
  courseId: string;
  state: CourseState;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onChange(next: CourseState) {
    if (next === state) return;
    setError(null);
    startTransition(async () => {
      const result = await setCourseStateAction(courseId, next, locale);
      if (!result.ok) setError(result.error);
      else router.refresh();
    });
  }

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <CardTitle>Status</CardTitle>
        <StatusBadge state={state} locale={locale} />
      </div>
      <Select
        value={state}
        onChange={(e) => onChange(e.target.value as CourseState)}
        disabled={pending}
        aria-label="Kursstatus"
      >
        {STATES.map((s) => (
          <option key={s.value} value={s.value}>
            {s.label}
          </option>
        ))}
      </Select>
      {error && <FormMessage tone="error">{error}</FormMessage>}
    </Card>
  );
}
