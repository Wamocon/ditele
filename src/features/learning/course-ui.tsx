import Link from "next/link";
import type { Route } from "next";
import { ArrowRight } from "lucide-react";
import { Badge, Card, CardTitle, StatusBadge, cn } from "@/shared/ui";
import type { LearningCourseSummary } from "./model";
import { format, type LearnStrings } from "./i18n";
import { progressPercent } from "./format";

/**
 * The presentational pieces the learning screens share. Server Components —
 * none of this needs the browser, so none of it ships JavaScript.
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
      className={cn("h-1.5 w-full overflow-hidden rounded-full bg-[--color-surface-2]", className)}
      role="progressbar"
      aria-valuenow={percent}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
    >
      <div
        className="h-full animate-progress-fill rounded-full bg-[--color-brand]"
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
}: {
  done: number;
  total: number;
  size?: number;
  label: string;
}) {
  const percent = progressPercent(done, total);
  const stroke = 5;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;

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
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={stroke}
          className="stroke-[--color-surface-2]"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - percent / 100)}
          className="stroke-[--color-brand]"
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-[13px] font-semibold tabular-nums">
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
 * `list_my_learning_courses` already returns `next_task_id` and
 * `next_task_title`, so this costs one call and no extra query.
 */
export function ContinueCard({
  course,
  locale,
  strings,
}: {
  course: LearningCourseSummary;
  locale: string;
  strings: LearnStrings["dashboard"];
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
    <Card className="relative overflow-hidden border-[--color-brand] shadow-[--shadow-brand]">
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="brand">{strings.continueEyebrow}</Badge>
          {!done && course.nextTaskState && <StatusBadge state={course.nextTaskState} />}
        </div>

        <div className="flex items-start gap-4">
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <p className="text-[13px] leading-5 text-[--color-fg-muted]">{course.title}</p>
            <p className="text-[22px] font-semibold leading-7 lg:text-[26px] lg:leading-8">
              {done ? strings.continueAllDone : course.nextTaskTitle}
            </p>
          </div>
          <ProgressRing
            done={course.completedActivities}
            total={course.totalActivities}
            label={strings.continueProgress}
          />
        </div>

        <p className="text-[13px] leading-5 text-[--color-fg-muted] tabular-nums">
          {format(strings.continueProgress, {
            done: course.completedActivities,
            total: course.totalActivities,
          })}
        </p>

        <Link
          href={href}
          className={cn(
            "inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-[--radius-md] px-6",
            "bg-[--color-brand] text-[15px] font-semibold text-[--color-brand-fg]",
            "transition-[background-color,transform] duration-[--duration-base] ease-[--ease-out]",
            "hover:bg-[--color-brand-hover] active:scale-[0.97] sm:w-auto sm:self-start"
          )}
        >
          {action}
          <ArrowRight className="size-4" aria-hidden />
        </Link>
      </div>
    </Card>
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
    <Card interactive className="flex h-full flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <CardTitle className="truncate">{course.title}</CardTitle>
          <p className="text-[13px] leading-5 text-[--color-fg-muted] tabular-nums">
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
        className="mt-auto inline-flex min-h-11 items-center gap-2 text-[15px] font-semibold text-[--color-brand] hover:underline"
      >
        {strings.openCourse}
        <ArrowRight className="size-4" aria-hidden />
      </Link>
    </Card>
  );
}

/* ── Stat tile ───────────────────────────────────────────────────────────── */

export function StatTile({ label, value }: { label: string; value: number }) {
  return (
    <Card className="flex flex-col gap-1">
      <p className="text-[11px] font-semibold uppercase tracking-[0.04em] text-[--color-fg-muted]">
        {label}
      </p>
      <p className="text-[30px] font-semibold leading-9 tabular-nums">{value}</p>
    </Card>
  );
}
