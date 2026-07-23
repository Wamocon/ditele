import type { Route } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { Card, CardTitle, CardDescription, DotMark } from "@/shared/ui";
import type { CatalogCourse } from "@/shared/data/catalog";

export interface CourseCardLabels {
  /** e.g. "Ansehen" */
  open: string;
}

/**
 * The public course tile. Used by the landing preview grid and the catalog.
 *
 * The whole card is one link, so there is a single tab stop and the entire
 * surface is tappable at 375px. On the clean schema a course carries a `title`,
 * a plain-text `description` and an optional `cover_image_url` — no level, no
 * rating, no task count.
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
  return (
    <Card interactive padded={false} className="h-full">
      <Link
        href={`/${locale}/catalog/${course.slug}` as Route}
        className="flex h-full flex-col rounded-(--radius-lg)"
      >
        {course.cover_image_url ? (
          <span className="block aspect-video w-full overflow-hidden rounded-t-(--radius-lg) bg-(--color-surface-2)">
            {/* Cover URLs are arbitrary remote hosts, so a plain <img> avoids
                next/image's per-domain allowlist (which lives in next.config). */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={course.cover_image_url}
              alt=""
              className="size-full object-cover"
              loading="lazy"
            />
          </span>
        ) : (
          <span className="flex aspect-video w-full items-center justify-center rounded-t-(--radius-lg) bg-(--color-brand-soft)">
            <DotMark className="scale-150" />
          </span>
        )}

        <span className="flex flex-1 flex-col gap-2 p-4 lg:p-5">
          <CardTitle className="text-[18px]">{course.title}</CardTitle>

          {course.description && (
            <CardDescription className="line-clamp-3 flex-1 text-[15px] leading-6">
              {course.description}
            </CardDescription>
          )}

          <span className="mt-auto flex items-center gap-1.5 pt-1 text-[13px] font-semibold text-(--color-brand)">
            {labels.open}
            <ArrowRight className="size-4" aria-hidden />
          </span>
        </span>
      </Link>
    </Card>
  );
}
