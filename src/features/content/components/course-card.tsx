"use client";

import { useActionState, useState } from "react";
import type { Route } from "next";
import Link from "next/link";
import { Copy, Users } from "lucide-react";

import { Button, Card, CardTitle, Field, Input, StatusBadge } from "@/shared/ui";
import type { AdminCourseRow } from "@/features/content/model";
import { idleState } from "@/features/admin/action-state";
import { duplicateCourseAction } from "@/app/[locale]/(admin)/admin/courses/actions";

export interface CourseCardLabels {
  learners: string;
  trainers: string;
  tasks: string;
  versions: string;
  duration: string;
  hours: string;
  noDuration: string;
  open: string;
  people: string;
  duplicate: string;
  duplicateSlugLabel: string;
  duplicateSlugHint: string;
  duplicateSubmit: string;
}

/** One statistic. Kept flat and unlabelled-on-top so four fit a narrow card. */
function Stat({ value, label }: { value: string | number; label: string }) {
  return (
    <div className="min-w-0">
      <div className="tabular text-[20px] font-semibold leading-6">{value}</div>
      <div className="truncate text-[12px] leading-4 text-(--color-fg-muted)">{label}</div>
    </div>
  );
}

export function CourseCard({
  locale,
  course,
  learnerCount,
  trainerCount,
  labels,
}: {
  locale: string;
  course: AdminCourseRow;
  learnerCount: number;
  trainerCount: number;
  labels: CourseCardLabels;
}) {
  const [duplicating, setDuplicating] = useState(false);
  const [state, action, pending] = useActionState(duplicateCourseAction, idleState);

  const durationText =
    course.estimatedMinutes && course.estimatedMinutes > 0
      ? labels.hours.replace(
          "{count}",
          String(Math.round((course.estimatedMinutes / 60) * 10) / 10)
        )
      : labels.noDuration;

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <CardTitle className="truncate">
            <Link
              href={`/${locale}/admin/courses/${course.id}` as Route}
              className="hover:text-(--color-brand) hover:underline"
            >
              {course.title}
            </Link>
          </CardTitle>
          <p className="truncate text-[13px] text-(--color-fg-muted)">{course.slug}</p>
        </div>
        {/* `statusLabel` inside StatusBadge is the one DB-state → language
            mapping (WS-0). Active vs inactive IS the "Activate the course"
            toggle: FEATURE_BUILD_PLAN §3 records that no new state column was
            added because record_state already carries draft/active/inactive/
            archived. */}
        <StatusBadge state={course.state} locale={locale} />
      </div>

      <div className="grid grid-cols-4 gap-3">
        <Stat value={learnerCount} label={labels.learners} />
        <Stat value={trainerCount} label={labels.trainers} />
        <Stat value={course.taskCount} label={labels.tasks} />
        <Stat value={durationText} label={labels.duration} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Link href={`/${locale}/admin/courses/${course.id}` as Route}>
          <Button variant="secondary">{labels.open}</Button>
        </Link>
        <Link href={`/${locale}/admin/courses/${course.id}/people` as Route}>
          <Button variant="ghost" iconLeft={<Users className="size-4" aria-hidden />}>
            {labels.people}
          </Button>
        </Link>
        <Button
          type="button"
          variant="ghost"
          iconLeft={<Copy className="size-4" aria-hidden />}
          aria-expanded={duplicating}
          onClick={() => setDuplicating((open) => !open)}
        >
          {labels.duplicate}
        </Button>
      </div>

      {duplicating && (
        <form action={action} className="flex flex-col gap-2 border-t border-(--color-border) pt-3">
          <input type="hidden" name="locale" value={locale} />
          <input type="hidden" name="courseId" value={course.id} />
          <Field label={labels.duplicateSlugLabel} hint={labels.duplicateSlugHint}>
            <Input name="slug" defaultValue={`${course.slug}-kopie`} required />
          </Field>
          <div className="flex items-center gap-2">
            <Button type="submit" disabled={pending}>
              {labels.duplicateSubmit}
            </Button>
            {state.status !== "idle" && (
              <span
                role="status"
                className={
                  state.status === "error"
                    ? "text-[13px] text-(--color-danger)"
                    : "text-[13px] text-(--color-fg-muted)"
                }
              >
                {state.message}
              </span>
            )}
          </div>
        </form>
      )}
    </Card>
  );
}
