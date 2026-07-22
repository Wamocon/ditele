"use client";

import { useState, useTransition } from "react";
import { Frown, Meh, Smile } from "lucide-react";
import { cn } from "@/shared/ui";
import { submitTaskFeedbackAction } from "./feedback-actions";
import type { LearnStrings } from "./i18n";

/**
 * The task emoji, shown once a task is finished. Three faces — not happy,
 * normal, very happy — and one click records it. It is intentionally tiny and
 * optional: a learner who ignores it loses nothing, which is what keeps a
 * one-tap rating honest rather than a chore.
 *
 * `initial` lets a task that was already rated render its choice selected, so
 * the panel is a stable record rather than a prompt that forgets.
 */
const FACES = [
  { sentiment: "unhappy", Icon: Frown, tone: "text-(--color-danger)" },
  { sentiment: "neutral", Icon: Meh, tone: "text-(--color-warning)" },
  { sentiment: "happy", Icon: Smile, tone: "text-(--color-success)" },
] as const;

export function TaskFeedback({
  locale,
  taskId,
  initial,
  strings,
}: {
  locale: string;
  taskId: string;
  initial: string | null;
  strings: LearnStrings["task"];
}) {
  const [chosen, setChosen] = useState<string | null>(initial);
  const [done, setDone] = useState(initial !== null);
  const [pending, startTransition] = useTransition();

  const choose = (sentiment: string) => {
    setChosen(sentiment);
    startTransition(async () => {
      const result = await submitTaskFeedbackAction({ locale, taskId, sentiment });
      if (result.status === "success") setDone(true);
    });
  };

  return (
    <div className="flex flex-col gap-2 rounded-(--radius-md) border border-(--color-border) bg-(--color-surface) px-4 py-3">
      <p className="text-[13px] font-semibold leading-5">
        {done ? strings.feedbackThanks : strings.feedbackPrompt}
      </p>
      <div className="flex items-center gap-2" role="group" aria-label={strings.feedbackPrompt}>
        {FACES.map(({ sentiment, Icon, tone }) => {
          const label =
            sentiment === "unhappy"
              ? strings.feedbackUnhappy
              : sentiment === "neutral"
                ? strings.feedbackNeutral
                : strings.feedbackHappy;
          const selected = chosen === sentiment;
          return (
            <button
              key={sentiment}
              type="button"
              aria-label={label}
              aria-pressed={selected}
              disabled={pending}
              onClick={() => choose(sentiment)}
              className={cn(
                "flex min-h-11 min-w-11 items-center justify-center rounded-(--radius-md) border p-2 transition-colors",
                selected
                  ? "border-(--color-brand) bg-(--color-brand-soft)"
                  : "border-(--color-border) hover:border-(--color-brand) hover:bg-(--color-surface)",
                pending && "opacity-60"
              )}
            >
              <Icon className={cn("size-7", selected ? tone : "text-(--color-fg-muted)")} aria-hidden />
            </button>
          );
        })}
      </div>
    </div>
  );
}
