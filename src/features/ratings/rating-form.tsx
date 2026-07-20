"use client";

import { useActionState, useId, useState } from "react";
import { useFormStatus } from "react-dom";

import { Button } from "@/shared/ui/button";
import type { Locale } from "@/shared/i18n/config";

import type { RatingCopy } from "./rating-copy";
import {
  ratingActionInitialState,
  type ExistingRating,
  type RatingActionState,
  type RatingTarget,
} from "./rating-model";
import styles from "./rating-form.module.css";

const STAR_VALUES = [1, 2, 3, 4, 5] as const;

export type RatingServerAction = (
  previousState: RatingActionState,
  formData: FormData,
) => Promise<RatingActionState>;

function SubmitButton({
  labels,
  hasExisting,
  score,
}: {
  readonly labels: RatingCopy;
  readonly hasExisting: boolean;
  readonly score: number;
}) {
  const { pending } = useFormStatus();
  return (
    <Button disabled={pending || score < 1} type="submit">
      {pending ? labels.submitting : hasExisting ? labels.update : labels.submit}
    </Button>
  );
}

export function RatingForm({
  action,
  copy,
  existing,
  idempotencyKey,
  locale,
  target,
  targetId,
}: {
  readonly action: RatingServerAction;
  readonly copy: RatingCopy;
  readonly existing?: ExistingRating;
  readonly idempotencyKey: string;
  readonly locale: Locale;
  readonly target: RatingTarget;
  readonly targetId: string;
}) {
  const [state, formAction] = useActionState(action, ratingActionInitialState);
  const [score, setScore] = useState(existing?.score ?? 0);
  const [hover, setHover] = useState(0);
  const titleId = useId();
  const active = hover || score;
  const title = target === "course" ? copy.courseTitle : copy.taskTitle;
  const description =
    target === "course" ? copy.courseDescription : copy.taskDescription;

  return (
    <section
      aria-labelledby={titleId}
      className={`panel stack ${styles.panel}`}
    >
      <div className="stack">
        <h2 id={titleId}>{title}</h2>
        <p className="muted">{description}</p>
      </div>

      <form action={formAction} className={`stack ${styles.form}`}>
        <input name="ratingTarget" type="hidden" value={target} />
        <input name="targetId" type="hidden" value={targetId} />
        <input name="locale" type="hidden" value={locale} />
        <input
          name="expectedVersion"
          type="hidden"
          value={existing?.rowVersion ?? 0}
        />
        <input name="idempotencyKey" type="hidden" value={idempotencyKey} />

        <fieldset
          className={styles.stars}
          onMouseLeave={() => setHover(0)}
        >
          <legend className={styles.legend}>{copy.scoreLabel}</legend>
          <div className={styles.starRow}>
            {STAR_VALUES.map((value) => (
              <label
                className={styles.star}
                data-filled={value <= active ? "true" : "false"}
                data-selected={value === score ? "true" : "false"}
                key={value}
                onMouseEnter={() => setHover(value)}
              >
                <input
                  checked={score === value}
                  className={styles.starInput}
                  name="score"
                  onChange={() => setScore(value)}
                  required
                  type="radio"
                  value={value}
                />
                <span aria-hidden="true" className={styles.starIcon}>
                  ★
                </span>
                <span className={styles.srOnly}>
                  {copy.starLabelTemplate.replace("{score}", String(value))}
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <label className={styles.commentLabel}>
          <span>{copy.comment}</span>
          <textarea
            className={styles.comment}
            defaultValue={existing?.comment ?? ""}
            maxLength={2000}
            name="comment"
            placeholder={copy.commentPlaceholder}
            rows={3}
          />
        </label>

        {score < 1 ? (
          <p className="muted">{copy.chooseScore}</p>
        ) : null}

        {state.status === "success" ? (
          <p className={styles.success} role="status">
            {state.message}
          </p>
        ) : null}
        {state.status === "error" || state.status === "conflict" ? (
          <p
            className={state.status === "conflict" ? styles.conflict : styles.error}
            role="alert"
          >
            {state.message}
          </p>
        ) : null}

        <div>
          <SubmitButton
            hasExisting={existing !== undefined}
            labels={copy}
            score={score}
          />
        </div>
      </form>
    </section>
  );
}
