"use client";

import { useState, useTransition } from "react";
import { Star } from "lucide-react";
import { Button, Textarea, cn } from "@/shared/ui";
import { submitCourseFeedbackAction } from "./feedback-actions";
import type { LearnStrings } from "./i18n";
import { format } from "./i18n";

/**
 * Shown when a course is complete: five stars and an optional comment. One
 * submission per learner per course, upserted, so revisiting lets them change
 * it. Kept deliberately light — the completion screen is a celebration, not a
 * form to survive.
 */
export function CourseFeedback({
  locale,
  courseId,
  strings,
}: {
  locale: string;
  courseId: string;
  strings: LearnStrings["course"];
}) {
  const [stars, setStars] = useState(0);
  const [hover, setHover] = useState(0);
  const [comment, setComment] = useState("");
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  const submit = () => {
    if (stars < 1) return;
    setError("");
    startTransition(async () => {
      const result = await submitCourseFeedbackAction({ locale, courseId, stars, comment });
      if (result.status === "success") setDone(true);
      else setError(result.message);
    });
  };

  if (done) {
    return (
      <div className="rounded-(--radius-lg) border border-(--color-success) bg-(--color-success-soft) px-4 py-3">
        <p className="text-[15px] font-semibold text-(--color-success)">{strings.feedbackThanks}</p>
      </div>
    );
  }

  const active = hover || stars;

  return (
    <div className="flex flex-col gap-3 rounded-(--radius-lg) border border-(--color-border) bg-(--color-surface) p-4">
      <div className="flex flex-col gap-1">
        <p className="text-[15px] font-semibold leading-6">{strings.feedbackTitle}</p>
        <p className="text-[13px] leading-5 text-(--color-fg-muted)">{strings.feedbackPrompt}</p>
      </div>

      <div className="flex items-center gap-1" role="group" aria-label={strings.feedbackTitle}>
        {[1, 2, 3, 4, 5].map((value) => (
          <button
            key={value}
            type="button"
            aria-label={format(strings.feedbackStars, { count: value })}
            aria-pressed={stars === value}
            disabled={pending}
            onMouseEnter={() => setHover(value)}
            onMouseLeave={() => setHover(0)}
            onFocus={() => setHover(value)}
            onBlur={() => setHover(0)}
            onClick={() => setStars(value)}
            className="flex min-h-11 min-w-11 items-center justify-center rounded-(--radius-sm) p-1"
          >
            <Star
              className={cn(
                "size-8",
                value <= active
                  ? "fill-(--color-warning) text-(--color-warning)"
                  : "text-(--color-fg-subtle)"
              )}
              aria-hidden
            />
          </button>
        ))}
      </div>

      <Textarea
        rows={3}
        value={comment}
        placeholder={strings.feedbackCommentPlaceholder}
        onChange={(event) => setComment(event.target.value)}
        disabled={pending}
        aria-label={strings.feedbackComment}
      />

      {error && (
        <p role="alert" className="text-[13px] text-(--color-danger)">
          {error}
        </p>
      )}

      <div>
        <Button onClick={submit} loading={pending} disabled={stars < 1}>
          {strings.feedbackSubmit}
        </Button>
      </div>
    </div>
  );
}
