import type { Route } from "next";
import Link from "next/link";
import { ArrowRight, Clock, ListChecks } from "lucide-react";

import { Card, CardTitle, CardDescription } from "@/shared/ui";
import type { CatalogCourse } from "@/shared/data/catalog";
import { formatDuration } from "../_lib/format";

export interface CourseCardLabels {
  open: string;
  tasks: string;
  hoursShort: string;
  minutesShort: string;
}

/**
 * The public course tile. Used by the landing preview grid and the catalog.
 *
 * The whole card is one link, so there is a single tab stop and the entire
 * surface is tappable at 375px. `estimated_minutes` and `task_count` are the
 * only facts the public RPC exposes — there is no level and no rating (I-016).
 */
export function CourseCard({
  course,
  locale,
  labels,
}: {
  course: CatalogCourse;
  locale: string;
  labels: CourseCardLabels;
}) {
  const duration = formatDuration(course.estimated_minutes, {
    hours: labels.hoursShort,
    minutes: labels.minutesShort,
  });
  const tasks = course.task_count ?? 0;

  return (
    <Card interactive padded={false} className="h-full">
      <Link
        href={`/${locale}/catalog/${course.slug}` as Route}
        className="flex h-full flex-col gap-3 rounded-(--radius-lg) p-4 lg:p-5"
      >
        {/* The red/navy/red mark stands in for a thumbnail — no images in the payload. */}
        <span className="flex items-center gap-1" aria-hidden>
          <span className="size-2 rounded-full bg-(--color-brand)" />
          <span className="size-2 rounded-full bg-(--color-ink)" />
          <span className="size-2 rounded-full bg-(--color-brand)" />
        </span>

        <CardTitle className="text-[18px]">{course.title ?? course.slug}</CardTitle>

        {course.summary && (
          <CardDescription className="line-clamp-3 flex-1">{course.summary}</CardDescription>
        )}

        <dl className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-1 pt-1 text-[13px] text-(--color-fg-muted)">
          {duration && (
            <div className="flex items-center gap-1.5">
              <Clock className="size-4" aria-hidden />
              <dt className="sr-only">{labels.hoursShort}</dt>
              <dd className="tabular">{duration}</dd>
            </div>
          )}
          <div className="flex items-center gap-1.5">
            <ListChecks className="size-4" aria-hidden />
            <dt className="sr-only">{labels.tasks}</dt>
            <dd className="tabular">
              {tasks} {labels.tasks}
            </dd>
          </div>
        </dl>

        <span className="flex items-center gap-1.5 text-[13px] font-semibold text-(--color-brand)">
          {labels.open}
          <ArrowRight className="size-4" aria-hidden />
        </span>
      </Link>
    </Card>
  );
}
