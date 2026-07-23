"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";

import { Badge, Button, Card, StatusBadge, Textarea } from "@/shared/ui";
import type { CourseReview, ArenaReview, SubmissionReview } from "@/shared/data/review";
import { reviewSubmissionAction } from "./actions";
import { initialReviewState } from "./action-state";
import { formatDateTime, taskKindLabel } from "./format";

/**
 * The review screen. The task and the learner's answer sit above the answer key
 * (trainer-only) and the decision, so a review is one scroll and one click.
 */
export function ReviewScreen({
  review,
  locale,
}: {
  review: SubmissionReview;
  locale: string;
}) {
  return (
    <div className="flex flex-col gap-6">
      <MetaStrip review={review} locale={locale} />

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-2">
        <TaskPanel review={review} />
        <AnswerPanel review={review} />
      </div>

      <AnswerKeyPanel review={review} />

      <DecisionPanel review={review} locale={locale} />
    </div>
  );
}

/* ── Meta ────────────────────────────────────────────────────────────────── */

function MetaStrip({ review, locale }: { review: SubmissionReview; locale: string }) {
  const items = [
    { label: "Lernende:r", value: review.studentName },
    { label: "Art", value: taskKindLabel(review.taskKind) },
    { label: "Eingereicht", value: formatDateTime(review.submittedAt, locale) },
  ];
  return (
    <div className="grid grid-cols-1 gap-px overflow-hidden rounded-(--radius-lg) border border-(--color-border) bg-(--color-border) sm:grid-cols-3">
      {items.map((item) => (
        <div key={item.label} className="flex flex-col gap-1 bg-(--color-bg) px-4 py-3">
          <span className="text-[11px] font-semibold uppercase tracking-[0.04em] text-(--color-fg-muted)">
            {item.label}
          </span>
          <span className="text-[15px] leading-6">{item.value}</span>
        </div>
      ))}
    </div>
  );
}

/* ── Task ────────────────────────────────────────────────────────────────── */

function TaskPanel({ review }: { review: SubmissionReview }) {
  const title = review.course?.title ?? review.arena?.title ?? "Aufgabe";
  const description = review.course?.description ?? review.arena?.description ?? "";

  return (
    <Card className="flex flex-col gap-4">
      <h2 className="text-[18px] font-semibold leading-6">Aufgabe</h2>
      <div className="flex flex-col gap-1">
        <span className="text-[15px] font-semibold leading-6">{title}</span>
        {description ? (
          <p className="max-w-[68ch] whitespace-pre-wrap text-[15px] leading-6 text-(--color-fg-muted)">
            {description}
          </p>
        ) : (
          <p className="text-[13px] leading-5 text-(--color-fg-muted)">Keine Beschreibung.</p>
        )}
      </div>

      {review.course?.mcqQuestion && (
        <div className="flex flex-col gap-1 rounded-(--radius-md) bg-(--color-surface) p-3">
          <span className="text-[11px] font-semibold uppercase tracking-[0.04em] text-(--color-fg-muted)">
            Pflichtfrage
          </span>
          <p className="text-[15px] leading-6">{review.course.mcqQuestion}</p>
        </div>
      )}
    </Card>
  );
}

/* ── Learner answer ──────────────────────────────────────────────────────── */

function AnswerPanel({ review }: { review: SubmissionReview }) {
  return (
    <Card className="flex flex-col gap-4">
      <h2 className="text-[18px] font-semibold leading-6">Antwort der/des Lernenden</h2>

      {review.responseText ? (
        <p className="max-w-[68ch] whitespace-pre-wrap text-[15px] leading-6">{review.responseText}</p>
      ) : (
        <p className="text-[13px] leading-5 text-(--color-fg-muted)">Kein Text abgegeben.</p>
      )}

      {review.course && <McqAnswer course={review.course} />}
      {review.arena && <ArenaImages arena={review.arena} />}
    </Card>
  );
}

function McqAnswer({ course }: { course: CourseReview }) {
  if (course.options.length === 0) return null;
  return (
    <div className="flex flex-col gap-2">
      <span className="text-[11px] font-semibold uppercase tracking-[0.04em] text-(--color-fg-muted)">
        Auswahl (Multiple Choice)
      </span>
      <ul className="flex flex-col gap-1.5">
        {course.options.map((option) => (
          <li
            key={option.id}
            className={`flex flex-wrap items-center gap-2 rounded-(--radius-md) border p-2.5 text-[15px] leading-6 ${
              option.isCorrect ? "border-(--color-success) bg-(--color-success-soft)" : "border-(--color-border)"
            }`}
          >
            <span className={option.selected ? "font-semibold" : "text-(--color-fg-muted)"}>
              {option.label}
            </span>
            {option.selected && (
              <Badge tone={option.isCorrect ? "success" : "danger"} dot>
                {option.isCorrect ? "Ausgewählt · richtig" : "Ausgewählt · falsch"}
              </Badge>
            )}
            {!option.selected && option.isCorrect && (
              <Badge tone="warning" dot>
                Nicht ausgewählt
              </Badge>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function ArenaImages({ arena }: { arena: ArenaReview }) {
  if (arena.images.length === 0) {
    return (
      <div className="flex flex-col gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-[0.04em] text-(--color-fg-muted)">
          Screenshots
        </span>
        <p className="text-[13px] leading-5 text-(--color-fg-muted)">Keine Bilder angehängt.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <span className="text-[11px] font-semibold uppercase tracking-[0.04em] text-(--color-fg-muted)">
        Screenshots ({arena.images.length})
      </span>
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {arena.images.map((image) => (
          <li
            key={image.id}
            className="flex flex-col gap-2 rounded-(--radius-md) border border-(--color-border) p-2"
          >
            {image.url ? (
              // Signed, short-lived storage URL — a plain img avoids caching an
              // expiring link through the image optimizer.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={image.url}
                alt={image.caption || "Screenshot"}
                loading="lazy"
                className="max-h-80 w-full rounded-(--radius-sm) object-contain"
              />
            ) : (
              <div className="flex h-32 items-center justify-center rounded-(--radius-sm) bg-(--color-surface) text-[13px] text-(--color-fg-muted)">
                Bild nicht verfügbar
              </div>
            )}
            {image.caption && (
              <p className="text-[13px] leading-5 text-(--color-fg-muted)">{image.caption}</p>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ── Answer key (trainer-only) ───────────────────────────────────────────── */

function AnswerKeyPanel({ review }: { review: SubmissionReview }) {
  const hasCourseKey = Boolean(review.course && (review.course.verificationAnswer || review.course.options.length > 0));
  const hasArenaKey = Boolean(review.arena && (review.arena.acceptanceCriteria || review.arena.answerKey));
  if (!hasCourseKey && !hasArenaKey) return null;

  return (
    <Card className="flex flex-col gap-4 border-(--color-brand) bg-(--color-brand-soft)">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-[18px] font-semibold leading-6">Lösungsschlüssel</h2>
        <Badge tone="brand" dot>
          Nur für Trainer:innen
        </Badge>
      </div>

      {review.course && (
        <KeyBlock label="Musterlösung / Prüfantwort" value={review.course.verificationAnswer} />
      )}

      {review.arena && (
        <>
          <KeyBlock label="Abnahmekriterien" value={review.arena.acceptanceCriteria} />
          <KeyBlock label="Lösungsschlüssel" value={review.arena.answerKey} />
        </>
      )}
    </Card>
  );
}

function KeyBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[11px] font-semibold uppercase tracking-[0.04em] text-(--color-fg-muted)">
        {label}
      </span>
      {value ? (
        <p className="max-w-[68ch] whitespace-pre-wrap text-[15px] leading-6">{value}</p>
      ) : (
        <p className="text-[13px] leading-5 text-(--color-fg-muted)">Nicht hinterlegt.</p>
      )}
    </div>
  );
}

/* ── Decision ────────────────────────────────────────────────────────────── */

function DecisionPanel({ review, locale }: { review: SubmissionReview; locale: string }) {
  const router = useRouter();
  const [state, formAction, isPending] = useActionState(reviewSubmissionAction, initialReviewState);

  // On a recorded decision, re-run the server component so the status badge and
  // the (now closed) form reflect the new state.
  useEffect(() => {
    if (state.status === "success") router.refresh();
  }, [state.status, router]);

  const decidable = review.state === "submitted" && !state.decided;

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[18px] font-semibold leading-6">Entscheidung</h2>
        <StatusBadge state={review.state} locale={locale} />
      </div>

      {state.status !== "idle" && (
        <div
          role={state.status === "error" ? "alert" : "status"}
          className={`rounded-(--radius-md) border px-3 py-2.5 text-[15px] leading-6 ${
            state.status === "error"
              ? "border-(--color-danger) bg-(--color-danger-soft) text-(--color-danger)"
              : "border-(--color-success) bg-(--color-success-soft) text-(--color-success)"
          }`}
        >
          {state.message}
        </div>
      )}

      {decidable ? (
        <form action={formAction} className="flex flex-col gap-4">
          <input type="hidden" name="submissionId" value={review.id} />
          <input type="hidden" name="locale" value={locale} />

          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] font-semibold leading-4">
              Kommentar
              <span className="ml-0.5 text-(--color-brand)" aria-hidden>
                *
              </span>
            </span>
            <Textarea
              name="comment"
              required
              rows={4}
              placeholder="Rückmeldung an die/den Lernende:n …"
            />
          </label>

          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <Button
              type="submit"
              name="decision"
              value="needs_revision"
              variant="outline"
              loading={isPending}
            >
              Nachbesserung nötig
            </Button>
            <Button type="submit" name="decision" value="accepted" variant="primary" loading={isPending}>
              Angenommen
            </Button>
          </div>
          {review.taskKind === "arena" && (
            <p className="text-[13px] leading-5 text-(--color-fg-muted)">
              Beim Annehmen erhält die/der Lernende die XP der Aufgabe
              {review.arena?.badgeName ? ` und das Abzeichen „${review.arena.badgeName}"` : ""}; die
              nächste Arena-Aufgabe wird freigeschaltet.
            </p>
          )}
        </form>
      ) : (
        <p className="text-[13px] leading-5 text-(--color-fg-muted)">
          {review.state === "submitted"
            ? "Diese Einreichung wurde soeben entschieden."
            : "Diese Einreichung wartet nicht auf eine Entscheidung."}
        </p>
      )}
    </Card>
  );
}
