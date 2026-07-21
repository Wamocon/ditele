import Link from "next/link";
import type { Route } from "next";
import {
  CheckCircle2,
  ChevronDown,
  Circle,
  CircleDot,
  Clock,
  Lock,
  RotateCcw,
} from "lucide-react";
import { Badge, StatusBadge, cn } from "@/shared/ui";
import type { LearningActivity, LearningStage } from "./model";
import { format, type LearnStrings } from "./i18n";
import { formatDate } from "./format";

/**
 * The curriculum: stages as native `<details>` accordions, tasks as rows.
 *
 * `<details>` rather than a client component with `useState` — it is keyboard
 * accessible, works before hydration, survives with JavaScript disabled, and
 * ships no JavaScript at all. Nothing a custom accordion would add is needed
 * here.
 */

/**
 * `lock_reasons` are raw database strings and the seeded course has none, so the
 * exact vocabulary is unconfirmed. Matching on a substring means a reason we
 * have not seen still produces a real German sentence instead of an enum —
 * a user must never be shown `not_yet_available`.
 */
function lockReasonText(reason: string, strings: LearnStrings["course"]): string {
  const value = reason.toLowerCase();
  if (value.includes("schedul") || value.includes("available") || value.includes("time")) {
    return strings.lockReasonSchedule;
  }
  if (value.includes("prereq") || value.includes("sequen") || value.includes("previous")) {
    return strings.lockReasonPrerequisite;
  }
  if (value.includes("cohort") || value.includes("enrol")) return strings.lockReasonCohort;
  return strings.lockReasonDefault;
}

function ActivityIcon({ activity }: { activity: LearningActivity }) {
  const className = "size-5 shrink-0";
  if (activity.locked) return <Lock className={cn(className, "text-(--color-fg-subtle)")} aria-hidden />;
  switch (activity.state) {
    case "accepted":
    case "completed":
      return <CheckCircle2 className={cn(className, "text-(--color-success)")} aria-hidden />;
    case "submitted":
    case "resubmitted":
      return <Clock className={cn(className, "text-(--color-info)")} aria-hidden />;
    case "revision_required":
      return <RotateCcw className={cn(className, "text-(--color-warning)")} aria-hidden />;
    case "in_progress":
      return <CircleDot className={cn(className, "text-(--color-brand)")} aria-hidden />;
    default:
      return <Circle className={cn(className, "text-(--color-fg-subtle)")} aria-hidden />;
  }
}

export function TaskListItem({
  activity,
  locale,
  strings,
  /** Shown on `/learn/tasks`, where rows are pulled out of their course. */
  courseTitle,
}: {
  activity: LearningActivity;
  locale: string;
  strings: LearnStrings["course"];
  courseTitle?: string;
}) {
  const meta = [
    courseTitle ?? "",
    activity.expectedMinutes > 0 ? format(strings.minutes, { count: activity.expectedMinutes }) : "",
    activity.dueAt ? format(strings.dueAt, { date: formatDate(activity.dueAt, locale) }) : "",
  ].filter(Boolean);

  const body = (
    <>
      <ActivityIcon activity={activity} />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[15px] font-semibold leading-6">{activity.title}</span>
          {!activity.locked && activity.state !== "available" && (
            <StatusBadge state={activity.state} />
          )}
        </div>
        {activity.description && (
          <p className="line-clamp-2 text-[13px] leading-5 text-(--color-fg-muted)">
            {activity.description}
          </p>
        )}
        {activity.locked ? (
          // Show WHY it is locked. Greying a row out and saying nothing is the
          // most common way a learner concludes the platform is broken.
          <p className="text-[13px] leading-5 text-(--color-fg-subtle)">
            {courseTitle ? `${courseTitle} · ` : ""}
            {lockReasonText(activity.lockReasons[0] ?? "", strings)}
          </p>
        ) : (
          meta.length > 0 && (
            <p className="text-[13px] leading-5 text-(--color-fg-subtle) tabular-nums">
              {meta.join(" · ")}
            </p>
          )
        )}
      </div>
    </>
  );

  const shared =
    "flex min-h-11 items-start gap-3 rounded-(--radius-md) border border-(--color-border) px-3 py-3";

  if (activity.locked) {
    return (
      <li>
        <div className={cn(shared, "bg-(--color-surface) opacity-80")} aria-disabled>
          {body}
        </div>
      </li>
    );
  }

  return (
    <li>
      <Link
        href={`/${locale}/learn/tasks/${activity.id}` as Route}
        className={cn(
          shared,
          "bg-(--color-bg) transition-[background-color,border-color,transform] duration-(--duration-base) ease-(--ease-out)",
          "hover:border-(--color-brand) hover:bg-(--color-surface) lg:hover:-translate-y-0.5"
        )}
      >
        {body}
      </Link>
    </li>
  );
}

export function StageList({
  stages,
  locale,
  strings,
}: {
  stages: LearningStage[];
  locale: string;
  strings: LearnStrings["course"];
}) {
  return (
    <div className="flex flex-col gap-3">
      {stages.map((stage, index) => {
        // Open any stage that still has work in it, so a learner never has to
        // hunt for where they are.
        const hasOpenWork = stage.activities.some(
          (activity) => !activity.locked && activity.state !== "accepted"
        );

        return (
          <details
            key={stage.id}
            open={hasOpenWork || index === 0}
            className="group overflow-hidden rounded-(--radius-lg) border border-(--color-border) bg-(--color-bg)"
          >
            <summary className="flex min-h-11 cursor-pointer list-none items-center gap-3 px-4 py-3 hover:bg-(--color-surface)">
              <ChevronDown
                className="size-5 shrink-0 text-(--color-fg-muted) transition-transform duration-(--duration-base) group-open:rotate-180"
                aria-hidden
              />
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="text-[18px] font-semibold leading-6">{stage.title}</span>
                {stage.description && (
                  <span className="text-[13px] leading-5 text-(--color-fg-muted)">
                    {stage.description}
                  </span>
                )}
              </div>
              <Badge tone="neutral">
                {stage.activities.length === 1
                  ? strings.stageTask
                  : format(strings.stageTasks, { count: stage.activities.length })}
              </Badge>
            </summary>

            <div className="border-t border-(--color-border) p-3">
              {stage.activities.length === 0 ? (
                <p className="px-1 py-2 text-[13px] leading-5 text-(--color-fg-muted)">
                  {strings.emptyStage}
                </p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {stage.activities.map((activity) => (
                    <TaskListItem
                      key={activity.id}
                      activity={activity}
                      locale={locale}
                      strings={strings}
                    />
                  ))}
                </ul>
              )}
            </div>
          </details>
        );
      })}
    </div>
  );
}
