"use client";

import { useActionState } from "react";
import { CheckCircle2, HelpCircle, SkipForward } from "lucide-react";

import { Button, Field, Textarea } from "@/shared/ui";
import { idleState } from "@/features/admin/action-state";
import type { LearnStrings } from "./i18n";
import type { TaskGateQuestion } from "./model";
import { answerGateQuestionAction, skipGateQuestionAction } from "./gate-actions";

/**
 * The pre-task question — FEATURE_BUILD_PLAN §1.6.
 *
 * ⚠️ THE ONE THING TO GET RIGHT HERE: this question does **not** block the task
 * it sits on. A learner may skip it and carry straight on doing this task. What
 * it blocks is progression PAST it — the NEXT task stays locked until it is
 * answered.
 *
 * So this panel is never a barrier: it renders above the task, both buttons are
 * always available, and nothing below it is disabled by it. Rendering it as a
 * gate the learner must clear would be a different, stricter product than the
 * one that was asked for, and the difference is invisible until somebody skips.
 *
 * The consequence of skipping is stated in the panel rather than discovered
 * later at a locked task, because "why is the next task locked" is the exact
 * confusion the wording exists to prevent.
 */
export function GateQuestionPanel({
  taskId,
  locale,
  gate,
  strings,
}: {
  taskId: string;
  locale: string;
  gate: TaskGateQuestion;
  strings: LearnStrings["task"];
}) {
  const [answerState, answerAction, answering] = useActionState(
    answerGateQuestionAction,
    idleState
  );
  const [skipState, skipAction, skipping] = useActionState(skipGateQuestionAction, idleState);

  const answered = gate.state === "answered";
  const skipped = gate.state === "skipped";
  const message =
    answerState.status === "error"
      ? answerState.message
      : skipState.status === "error"
        ? skipState.message
        : "";

  return (
    <section
      className="flex flex-col gap-3 rounded-(--radius-md) border border-(--color-border) bg-(--color-surface-2) p-4"
      aria-labelledby={`gate-${gate.id}`}
    >
      <div className="flex items-start gap-3">
        {answered ? (
          <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-(--color-success)" aria-hidden />
        ) : (
          <HelpCircle className="mt-0.5 size-5 shrink-0 text-(--color-brand)" aria-hidden />
        )}
        <div className="flex flex-col gap-1">
          <h2 id={`gate-${gate.id}`} className="text-[17px] font-semibold leading-6">
            {strings.gateHeading}
          </h2>
          <p className="text-[13px] leading-5 text-(--color-fg-muted)">{strings.gateIntro}</p>
        </div>
      </div>

      {/* Course material: German, straight from the learner's own snapshot. */}
      <p className="text-[15px] leading-6">{gate.question}</p>

      {skipped && (
        <p className="text-[13px] leading-5 text-(--color-warning)">{strings.gateSkippedNotice}</p>
      )}

      {message && (
        <p role="alert" className="text-[13px] text-(--color-danger)">
          {message}
        </p>
      )}

      <form action={answerAction} className="flex flex-col gap-2">
        <input type="hidden" name="locale" value={locale} />
        <input type="hidden" name="taskId" value={taskId} />
        <Field label={strings.gateAnswerLabel}>
          <Textarea
            name="answerText"
            rows={3}
            placeholder={strings.gateAnswerPlaceholder}
            defaultValue={gate.answerText}
          />
        </Field>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" size="sm" disabled={answering}>
            {answered ? strings.gateChangeAnswer : strings.gateAnswerNow}
          </Button>
          {answered && (
            <span className="text-[13px] text-(--color-success)">{strings.gateAnswered}</span>
          )}
        </div>
      </form>

      {/* A separate form, not a second button in the one above: a submit inside
          that form would carry the answer text and the two actions would fight
          over which one the Enter key means. */}
      {!answered && (
        <form action={skipAction}>
          <input type="hidden" name="locale" value={locale} />
          <input type="hidden" name="taskId" value={taskId} />
          <Button
            type="submit"
            variant="ghost"
            size="sm"
            disabled={skipping}
            iconLeft={<SkipForward className="size-4" aria-hidden />}
          >
            {strings.gateSkip}
          </Button>
        </form>
      )}
    </section>
  );
}
