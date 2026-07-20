import { Badge } from "@/shared/ui/badge";
import type { ReviewSubmission } from "@/features/review/model";
import type { Locale } from "@/shared/i18n/config";

import { reviewDetailCopy } from "./copy";
import styles from "@/features/review/components/review.module.css";

export function ReviewedPanel({
  locale,
  submission,
}: {
  readonly locale: Locale;
  readonly submission: ReviewSubmission;
}) {
  const labels = reviewDetailCopy[locale].workbench;
  const dateFormatter = new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  });
  const selectedAnswers = submission.selectedAnswers ?? submission.selectedAnswerIds.map(
    (id) => ({ id, label: id }),
  );

  return (
    <article aria-labelledby="reviewed-submission-title" className="stack">
      <header className="page-heading cluster">
        <div>
          <h1 id="reviewed-submission-title">{labels.title}</h1>
          <p className="muted">{submission.taskTitle}</p>
        </div>
        <Badge
          tone={submission.state === "accepted"
            ? "success"
            : submission.state === "withdrawn"
              ? "neutral"
              : "warning"}
        >
          {labels.states[submission.state]}
        </Badge>
      </header>

      <dl className={styles.factGrid}>
        <div><dt>{labels.learner}</dt><dd>{submission.learnerName}</dd></div>
        <div><dt>{labels.group}</dt><dd>{submission.groupName}</dd></div>
        <div><dt>{labels.attempt}</dt><dd>{submission.attemptNumber}</dd></div>
        <div>
          <dt>{labels.submittedAt}</dt>
          <dd>{dateFormatter.format(new Date(submission.submittedAt ?? submission.updatedAt))}</dd>
        </div>
      </dl>

      <section aria-labelledby="reviewed-answer-title" className="panel stack">
        <h2 id="reviewed-answer-title">{labels.answer}</h2>
        <p>{submission.answerText}</p>
        {selectedAnswers.length > 0 ? (
          <div>
            <strong>{labels.selectedAnswers}</strong>
            <ul className={styles.selectedAnswers}>
              {selectedAnswers.map((answer) => <li key={answer.id}>{answer.label}</li>)}
            </ul>
          </div>
        ) : null}
      </section>

      <section aria-labelledby="reviewed-evidence-title" className="panel stack">
        <h2 id="reviewed-evidence-title">{labels.evidence}</h2>
        {submission.evidence.length === 0 ? (
          <p className="muted">{labels.noEvidence}</p>
        ) : (
          <ul>
            {submission.evidence.map((evidence) => (
              <li key={evidence.id}>
                {evidence.uri ? <a href={evidence.uri}>{evidence.name}</a> : evidence.name}
                {` — ${labels.evidenceKinds[evidence.kind]}`}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="reviewed-history-title" className="panel stack">
        <h2 id="reviewed-history-title">{labels.history}</h2>
        {submission.reviewHistory.length === 0 ? (
          <p className="muted">{labels.noHistory}</p>
        ) : (
          <ol>
            {submission.reviewHistory.map((review) => (
              <li key={review.id}>
                <p>
                  <strong>{labels.states[review.decision]}</strong>
                  {` — ${dateFormatter.format(new Date(review.createdAt))}`}
                </p>
                <p>{review.comment}</p>
              </li>
            ))}
          </ol>
        )}
      </section>
    </article>
  );
}
