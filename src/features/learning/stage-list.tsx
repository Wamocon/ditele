import Link from "next/link";
import type { Route } from "next";
import {
  CheckCircle2,
  ChevronDown,
  Circle,
  CircleDot,
  Clock,
  HelpCircle,
  Lock,
  RotateCcw,
  Swords,
} from "lucide-react";
import { Badge, StatusBadge, cn } from "@/shared/ui";
import {
  arenaHubHref,
  gateQuestionLock,
  huntPrerequisite,
  huntScenarioLock,
  huntTaskHref,
  type LockReason,
} from "@/features/arena/model";
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
 * Substring matching, so a reason code nobody has seen still produces a real
 * German sentence instead of an enum — a user must never be shown
 * `not_yet_available`.
 *
 * ⚠️ The real code for an unmet task prerequisite is **`required_task`**, not
 * `prerequisite` (ISSUES.md I-037 — both design documents name a code that does
 * not exist). It matched none of the branches below and fell through to the
 * generic default, so the one lock reason this phase actually produces was the
 * one with the vaguest message. `required` is now matched explicitly.
 */
function lockReasonText(reason: LockReason | undefined, strings: LearnStrings["course"]): string {
  const value = (reason?.code ?? "").toLowerCase();

  /**
   * ⚠️ THE TWO PHASE-1C CODES ARE MATCHED FIRST, AND EXACTLY.
   *
   * The substring rules below are deliberately loose, and that is a trap for
   * these two. `required_hunt` contains "required", so it would have fallen
   * into the prerequisite branch and told a learner to "finish the previous
   * tasks" when what they actually need is to pass a hunt in the Arena — advice
   * that is not merely vague but wrong, and that sends them looking in the one
   * place the answer is not.
   *
   * `gate_question` matched nothing and fell to `lockReasonDefault`, the
   * vaguest sentence there is.
   */
  if (value === "required_hunt") {
    return reason?.scenarioTitle
      ? format(strings.lockReasonHuntNamed, { scenario: reason.scenarioTitle })
      : strings.lockReasonHunt;
  }
  if (value === "gate_question") {
    return reason?.previousTaskTitle
      ? format(strings.lockReasonGateQuestionNamed, { task: reason.previousTaskTitle })
      : strings.lockReasonGateQuestion;
  }

  if (value.includes("schedul") || value.includes("available") || value.includes("time")) {
    return strings.lockReasonSchedule;
  }
  if (
    value.includes("required") ||
    value.includes("prereq") ||
    value.includes("sequen") ||
    value.includes("previous")
  ) {
    return strings.lockReasonPrerequisite;
  }
  if (value.includes("cohort") || value.includes("enrol")) return strings.lockReasonCohort;
  return strings.lockReasonDefault;
}

function ActivityIcon({ activity }: { activity: LearningActivity }) {
  const className = "size-5 shrink-0";
  if (activity.locked) return <Lock className={cn(className, "text-(--color-fg-subtle)")} aria-hidden />;
  // §5.5: an Arena task is visually distinct. The crossed swords mark it apart
  // from every course-task state icon at a glance; its state still shows through
  // the StatusBadge beside the title, so nothing is lost by overriding the icon.
  if (activity.taskKind === "hunt")
    return <Swords className={cn(className, "text-(--color-brand)")} aria-hidden />;
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

  // The hunt that unlocks this task, if a hunt is what it is waiting on.
  const hunt = activity.locked ? huntPrerequisite(activity.lockReasons) : null;
  // The Phase 1c gates. Both can be outstanding at once — §1.6 is explicit that
  // the next task stays locked until the question is answered "even if its own
  // Arena task is already approved" — so they are read separately and both are
  // shown, rather than taking `lockReasons[0]` and hoping it is the useful one.
  const scenarioLock = activity.locked ? huntScenarioLock(activity.lockReasons) : null;
  const gateLock = activity.locked ? gateQuestionLock(activity.lockReasons) : null;

  /**
   * Every distinct reason, in order, deduped by the sentence it produces.
   *
   * The previous code rendered `lockReasons[0]` alone. With one reason that was
   * right; with two it silently hid one, so a learner who cleared the hunt
   * would come back to a task that was still locked and now showed a message
   * they had already satisfied.
   */
  const lockSentences = activity.locked
    ? [...new Set(activity.lockReasons.map((reason) => lockReasonText(reason, strings)))]
    : [];

  const body = (
    <>
      <ActivityIcon activity={activity} />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[15px] font-semibold leading-6">{activity.title}</span>
          {/* §5.5: the kind badge, so the row reads as an Arena task before it is
              opened — and cues that clicking it goes to the Arena, not a task page. */}
          {activity.taskKind === "hunt" && <Badge tone="brand">{strings.arenaBadge}</Badge>}
          {!activity.locked && activity.state !== "available" && (
            <StatusBadge state={activity.state} locale={locale} />
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
          <>
            {lockSentences.length === 0 ? (
              <p className="text-[13px] leading-5 text-(--color-fg-subtle)">
                {courseTitle ? `${courseTitle} · ` : ""}
                {strings.lockReasonDefault}
              </p>
            ) : (
              lockSentences.map((sentence, index) => (
                <p key={sentence} className="text-[13px] leading-5 text-(--color-fg-subtle)">
                  {index === 0 && courseTitle ? `${courseTitle} · ` : ""}
                  {sentence}
                </p>
              ))
            )}
            {hunt && (
              /**
               * ⭐ G8, the half that never landed — `05_…` calls this "the whole
               * feature the user described as a link on the locked tasks that
               * redirects to gamification mode".
               *
               * WS-8 enriched the lock reason with `required_task_id` and
               * shipped `huntTaskHref` to build this link, but
               * `features/learning/**` is WS-2's tree, so the only place the
               * link was ever rendered was WS-11's Arena hub. A learner looking
               * at the locked task itself — which is where they actually meet
               * the wall — got a grey row and a sentence.
               *
               * Rendered only in the locked branch: the unlocked row is itself
               * an `<a>`, and nesting an anchor inside an anchor is invalid.
               */
              <Link
                href={huntTaskHref(locale, hunt.requiredTaskId ?? "") as Route}
                className={cn(
                  "mt-1 inline-flex min-h-11 w-fit items-center gap-1.5 rounded-(--radius-sm)",
                  "px-2 text-[13px] font-semibold leading-5 text-(--color-brand)",
                  "underline-offset-4 hover:bg-(--color-brand-soft) hover:underline"
                )}
              >
                <Swords className="size-4 shrink-0" aria-hidden />
                {hunt.requiredTaskTitle
                  ? format(strings.lockPlayHuntNamed, { title: hunt.requiredTaskTitle })
                  : strings.lockPlayHunt}
                <span aria-hidden>→</span>
              </Link>
            )}

            {/**
             * The Phase 1c Arena gate. Unlike `hunt` above it names a SCENARIO
             * rather than a task, and an accepted hunt of that scenario counts
             * from anywhere — so there is no task id to link to and the Arena
             * hub is the honest destination. `!hunt` so a task waiting on both
             * kinds does not grow two nearly identical buttons.
             */}
            {scenarioLock && !hunt && (
              <Link
                href={arenaHubHref(locale) as Route}
                className={cn(
                  "mt-1 inline-flex min-h-11 w-fit items-center gap-1.5 rounded-(--radius-sm)",
                  "px-2 text-[13px] font-semibold leading-5 text-(--color-brand)",
                  "underline-offset-4 hover:bg-(--color-brand-soft) hover:underline"
                )}
              >
                <Swords className="size-4 shrink-0" aria-hidden />
                {strings.lockGoToArena}
                <span aria-hidden>→</span>
              </Link>
            )}

            {/**
             * The pre-task question gate points BACKWARDS: §1.6 says a skipped
             * question blocks progression past its task, not the task itself.
             * So the link goes to the PREVIOUS task, which is where the question
             * is asked — sending the learner to the locked task would be a door
             * they cannot open.
             */}
            {gateLock?.previousTaskId && (
              <Link
                href={huntTaskHref(locale, gateLock.previousTaskId) as Route}
                className={cn(
                  "mt-1 inline-flex min-h-11 w-fit items-center gap-1.5 rounded-(--radius-sm)",
                  "px-2 text-[13px] font-semibold leading-5 text-(--color-brand)",
                  "underline-offset-4 hover:bg-(--color-brand-soft) hover:underline"
                )}
              >
                <HelpCircle className="size-4 shrink-0" aria-hidden />
                {strings.lockAnswerQuestion}
                <span aria-hidden>→</span>
              </Link>
            )}
          </>
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
        {/* ⚠️ Two attributes came off this row when it gained an action, and
            both would have silently disabled that action.

            `opacity-80`: opacity applies to a whole subtree and cannot be
            undone by a child, so it dimmed the "play the hunt" link and its
            focus ring along with the text — and a contrast audit reading
            computed colours would not have noticed, because the element's own
            opacity is still 1.

            `aria-disabled`: this is a plain `<div>`, not a control, so the
            attribute was decorative to begin with — but assistive technology
            propagates it, and the browser check refused to click the link with
            "element is not enabled". A learner using a screen reader would have
            been told the one actionable thing on the row was unavailable. The
            lock icon and the sentence already say the task is locked. */}
        <div className={cn(shared, "bg-(--color-surface) text-(--color-fg-muted)")}>
          {body}
        </div>
      </li>
    );
  }

  // §5.5: "an Arena row sends the learner to Arena, a course row opens the task."
  // The gate question stays on the course task — this only changes where the row
  // opens, not where the question lives.
  const href = (
    activity.taskKind === "hunt"
      ? arenaHubHref(locale)
      : `/${locale}/learn/tasks/${activity.id}`
  ) as Route;

  return (
    <li>
      <Link
        href={href}
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
