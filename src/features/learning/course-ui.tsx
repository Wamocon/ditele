import Link from "next/link";
import type { Route } from "next";
import type { ReactNode } from "react";
import { ArrowRight } from "lucide-react";
import { Badge, Card, CardTitle, CountUp, Spotlight, StatusBadge, cn } from "@/shared/ui";
import type { LearningCourseSummary } from "./model";
import { format, type LearnStrings } from "./i18n";
import { progressPercent } from "./format";

/**
 * The presentational pieces the learning screens share.
 *
 * These stay Server Components. The two interactive flourishes — the pointer
 * spotlight and the counting figures — are imported client components, so the
 * JavaScript boundary sits around those two widgets rather than around a whole
 * dashboard of otherwise static content.
 */

/* ── Progress ────────────────────────────────────────────────────────────── */

export function ProgressBar({
  done,
  total,
  className,
  label,
}: {
  done: number;
  total: number;
  className?: string;
  label: string;
}) {
  const percent = progressPercent(done, total);
  return (
    <div
      className={cn("h-1.5 w-full overflow-hidden rounded-full bg-(--color-surface-2)", className)}
      role="progressbar"
      aria-valuenow={percent}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
    >
      <div
        className={cn(
          "h-full animate-progress-fill rounded-full",
          // A shallow gradient reads as depth at 6px tall where a second colour
          // stop would just read as two bars.
          "bg-linear-to-r from-(--color-brand) to-(--color-brand-hover)"
        )}
        style={{ width: `${percent}%` }}
      />
    </div>
  );
}

export function ProgressRing({
  done,
  total,
  size = 52,
  label,
  emphasis = false,
}: {
  done: number;
  total: number;
  size?: number;
  label: string;
  /** Larger figure and a brand-tinted halo. One per screen at most. */
  emphasis?: boolean;
}) {
  const percent = progressPercent(done, total);
  const stroke = emphasis ? 7 : 5;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - percent / 100);

  return (
    <div
      className="relative shrink-0"
      style={{ width: size, height: size }}
      role="progressbar"
      aria-valuenow={percent}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
    >
      <svg width={size} height={size} className="-rotate-90 overflow-visible" aria-hidden>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={stroke}
          className="stroke-(--color-surface-2)"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className={cn(
            "animate-draw-ring stroke-(--color-brand)",
            emphasis && "drop-shadow-[0_0_6px_var(--glow)]"
          )}
          // The keyframe animates *from* a full offset (an empty ring) to the
          // inline value above, so one keyframe serves every percentage.
          style={{ "--ring-circumference": `${circumference}px` } as React.CSSProperties}
        />
      </svg>
      <span
        className={cn(
          "absolute inset-0 flex items-center justify-center font-semibold tabular-nums",
          emphasis ? "text-[19px]" : "text-[13px]"
        )}
      >
        {percent}%
      </span>
    </div>
  );
}

/* ── The "Weiter lernen" card ────────────────────────────────────────────── */

/**
 * ⭐ The second-highest-priority element in WS-2 after the workspace itself.
 *
 * A learner who is shown a list of courses has to decide what to do. A learner
 * who is shown *"Weiter mit: Aufgabe 7 — Testfälle aus Anforderungen ableiten"*
 * and one red button just carries on. It is the largest thing on the dashboard,
 * above the fold, with exactly one primary action.
 *
 * This is the single card on the screen that carries the gradient rim and the
 * pointer spotlight. Both are rank signals, so spending them anywhere else
 * would flatten the hierarchy this card exists to create.
 */
export function ContinueCard({
  course,
  locale,
  strings,
  className,
}: {
  course: LearningCourseSummary;
  locale: string;
  strings: LearnStrings["dashboard"];
  className?: string;
}) {
  const done = course.nextTaskId === null;
  const href = (
    done
      ? `/${locale}/learn/courses/${course.courseId}`
      : `/${locale}/learn/tasks/${course.nextTaskId}`
  ) as Route;

  const action = done
    ? strings.continueAllDoneAction
    : course.nextTaskState === "in_progress"
      ? strings.continueResume
      : course.nextTaskState === "submitted" || course.nextTaskState === "resubmitted"
        ? strings.continueReview
        : strings.continueStart;

  return (
    <Spotlight size={560} className={cn("h-full rounded-(--radius-lg)", className)}>
      {/*
        Centred, not space-between. This card spans two grid rows so it is as
        tall as the two summary cards beside it, and a learner with one short
        task title does not have enough content to fill that. Pushing the CTA to
        the floor left a dead band through the middle of the most important card
        on the page; centring the block keeps it reading as one deliberate unit
        at any content length.
      */}
      <Card rim padded={false} className="flex h-full flex-col justify-center gap-6 p-5 lg:p-7">
        <div className="flex flex-col gap-5">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="brand">{strings.continueEyebrow}</Badge>
            {!done && course.nextTaskState && <StatusBadge state={course.nextTaskState} />}
          </div>

          <div className="flex items-start gap-5">
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <p className="text-[13px] leading-5 text-(--color-fg-muted)">{course.title}</p>
              <h2 className="text-balance text-[26px] font-semibold leading-8 lg:text-[34px] lg:leading-[2.75rem]">
                {done ? strings.continueAllDone : course.nextTaskTitle}
              </h2>
              <p className="text-[13px] leading-5 text-(--color-fg-muted) tabular-nums">
                {format(strings.continueProgress, {
                  done: course.completedActivities,
                  total: course.totalActivities,
                })}
              </p>
            </div>
          </div>
        </div>

        <Link
          href={href}
          className={cn(
            "shine group inline-flex min-h-12 w-full items-center justify-center gap-2",
            "rounded-(--radius-md) px-6 sm:w-auto sm:self-start",
            "bg-(--color-brand) text-[15px] font-semibold text-(--color-brand-fg)",
            "shadow-(--shadow-sm) transition-[background-color,box-shadow,transform]",
            "duration-(--duration-base) ease-(--ease-out)",
            "hover:bg-(--color-brand-hover) hover:shadow-(--shadow-brand) active:scale-[0.97]"
          )}
        >
          {action}
          <ArrowRight
            className="size-4 transition-transform duration-(--duration-base) ease-(--ease-out) group-hover:translate-x-0.5"
            aria-hidden
          />
        </Link>
      </Card>
    </Spotlight>
  );
}

/* ── Course card ─────────────────────────────────────────────────────────── */

export function CourseCard({
  course,
  locale,
  strings,
}: {
  course: LearningCourseSummary;
  locale: string;
  strings: LearnStrings["courses"];
}) {
  const progressLabel = format(strings.progress, {
    done: course.completedActivities,
    total: course.totalActivities,
  });

  return (
    <Spotlight size={340} className="h-full rounded-(--radius-lg)">
      <Card interactive className="flex h-full flex-col gap-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-1">
            <CardTitle className="truncate">{course.title}</CardTitle>
            <p className="text-[13px] leading-5 text-(--color-fg-muted) tabular-nums">
              {progressLabel}
            </p>
          </div>
          <ProgressRing
            done={course.completedActivities}
            total={course.totalActivities}
            label={progressLabel}
          />
        </div>

        <ProgressBar
          done={course.completedActivities}
          total={course.totalActivities}
          label={progressLabel}
        />

        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge state={course.enrollmentState} />
          <StatusBadge state={course.cohortState} />
        </div>

        <Link
          href={`/${locale}/learn/courses/${course.courseId}` as Route}
          className="group mt-auto inline-flex min-h-11 items-center gap-2 text-[15px] font-semibold text-(--color-brand) hover:underline"
        >
          {strings.openCourse}
          <ArrowRight
            className="size-4 transition-transform duration-(--duration-base) ease-(--ease-out) group-hover:translate-x-0.5"
            aria-hidden
          />
        </Link>
      </Card>
    </Spotlight>
  );
}

/* ── Stat tile ───────────────────────────────────────────────────────────── */

export function StatTile({
  label,
  value,
  locale = "de-DE",
  icon,
  compact = false,
}: {
  label: string;
  value: number;
  locale?: string;
  icon?: ReactNode;
  /** Row form, for stacking several inside one bento cell. */
  compact?: boolean;
}) {
  if (compact) {
    return (
      <div className="flex items-center justify-between gap-3">
        <span className="flex items-center gap-2.5 text-[13px] text-(--color-fg-muted)">
          {icon && <span className="text-(--color-fg-subtle)">{icon}</span>}
          {label}
        </span>
        <span className="text-[19px] font-semibold leading-6 tabular-nums">
          <CountUp value={value} locale={locale} />
        </span>
      </div>
    );
  }

  return (
    <Card className="flex flex-col gap-1">
      <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.04em] text-(--color-fg-muted)">
        {icon && <span className="text-(--color-fg-subtle)">{icon}</span>}
        {label}
      </p>
      <p className="text-[30px] font-semibold leading-9 tabular-nums">
        <CountUp value={value} locale={locale} />
      </p>
    </Card>
  );
}
