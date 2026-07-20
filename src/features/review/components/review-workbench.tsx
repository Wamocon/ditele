import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Field, Input, Textarea } from "@/shared/ui/field";

import type { ReviewSubmission } from "../model";
import styles from "./review.module.css";

export interface ReviewWorkbenchLabels {
  readonly title: string;
  readonly learner: string;
  readonly group: string;
  readonly attempt: string;
  readonly submittedAt: string;
  readonly duration: string;
  readonly hintUsage: string;
  readonly hintsUsed: (count: number) => string;
  readonly noHintsUsed: string;
  readonly answer: string;
  readonly evidence: string;
  readonly noEvidence: string;
  readonly selectedAnswers: string;
  readonly rubric: string;
  readonly score: string;
  readonly reviewerComment: string;
  readonly reviewerCommentDescription: string;
  readonly accept: string;
  readonly requestRevision: string;
  readonly transfer: string;
  readonly transferTo: string;
  readonly transferReason: string;
  readonly transferReasonDescription: string;
  readonly history: string;
  readonly noHistory: string;
  readonly states: Readonly<Record<ReviewSubmission["state"], string>>;
  readonly evidenceKinds: Readonly<Record<ReviewSubmission["evidence"][number]["kind"], string>>;
}

export interface ReviewWorkbenchProps {
  readonly submission: ReviewSubmission;
  readonly labels: ReviewWorkbenchLabels;
  readonly decisionAction: (formData: FormData) => void | Promise<void>;
  readonly transferAction: (formData: FormData) => void | Promise<void>;
  readonly transferIdempotencyKey: string;
  readonly availableTrainers: readonly { readonly id: string; readonly name: string }[];
  readonly formatDateTime: (isoDate: string) => string;
  readonly formatDuration: (seconds: number) => string;
}

export function ReviewWorkbench({
  submission,
  labels,
  decisionAction,
  transferAction,
  transferIdempotencyKey,
  availableTrainers,
  formatDateTime,
  formatDuration,
}: ReviewWorkbenchProps) {
  const selectedAnswers = submission.selectedAnswers ?? submission.selectedAnswerIds.map(
    (id) => ({ id, label: id }),
  );

  return (
    <div className="stack">
      <header className={styles.workbenchHeader}>
        <div>
          <h1>{labels.title}</h1>
          <p className="muted">{submission.taskTitle}</p>
        </div>
        <Badge tone={submission.state === "resubmitted" ? "warning" : "neutral"}>
          {labels.states[submission.state]}
        </Badge>
      </header>

      <dl className={styles.factGrid}>
        <div><dt>{labels.learner}</dt><dd>{submission.learnerName}</dd></div>
        <div><dt>{labels.group}</dt><dd>{submission.groupName}</dd></div>
        <div><dt>{labels.attempt}</dt><dd>{submission.attemptNumber}</dd></div>
        <div><dt>{labels.submittedAt}</dt><dd>{formatDateTime(submission.submittedAt ?? submission.updatedAt)}</dd></div>
        <div><dt>{labels.duration}</dt><dd>{formatDuration(submission.solvingDurationSeconds)}</dd></div>
        <div>
          <dt>{labels.hintUsage}</dt>
          <dd>{submission.hintUsage.length > 0
            ? labels.hintsUsed(submission.hintUsage.length)
            : labels.noHintsUsed}</dd>
        </div>
      </dl>

      <div className={styles.workbench}>
        <div className="stack">
          <section className="panel" aria-labelledby="review-answer-title">
            <header className="panel__header"><h2 id="review-answer-title">{labels.answer}</h2></header>
            <div className="panel__body stack">
              <p className={styles.answer}>{submission.answerText}</p>
              {selectedAnswers.length > 0 ? (
                <div>
                  <strong>{labels.selectedAnswers}</strong>
                  <ul className={styles.selectedAnswers}>
                    {selectedAnswers.map((answer) => <li key={answer.id}>{answer.label}</li>)}
                  </ul>
                </div>
              ) : null}
            </div>
          </section>

          <section className="panel" aria-labelledby="review-evidence-title">
            <header className="panel__header"><h2 id="review-evidence-title">{labels.evidence}</h2></header>
            <div className="panel__body">
              {submission.evidence.length === 0 ? <p className="muted">{labels.noEvidence}</p> : (
                <ul className={styles.evidenceList}>
                  {submission.evidence.map((evidence) => (
                    <li key={evidence.id}>
                      <div className={styles.sectionHeader}>
                        <strong>{evidence.name}</strong>
                        <span className="muted">{labels.evidenceKinds[evidence.kind]}</span>
                      </div>
                      {evidence.uri ? <a href={evidence.uri}>{evidence.uri}</a> : null}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>

          <section className="panel" aria-labelledby="review-history-title">
            <header className="panel__header"><h2 id="review-history-title">{labels.history}</h2></header>
            <div className="panel__body">
              {submission.reviewHistory.length === 0 ? <p className="muted">{labels.noHistory}</p> : (
                <ol className={styles.historyList}>
                  {submission.reviewHistory.map((review) => (
                    <li key={review.id}>
                      <div className={styles.sectionHeader}>
                        <Badge tone={review.decision === "accepted" ? "success" : "warning"}>
                          {labels.states[review.decision]}
                        </Badge>
                        <time dateTime={review.createdAt}>{formatDateTime(review.createdAt)}</time>
                      </div>
                      <p>{review.comment}</p>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </section>
        </div>

        <aside className="stack">
          <form action={decisionAction} className="panel">
            <header className="panel__header"><h2>{labels.rubric}</h2></header>
            <div className="panel__body stack">
              <input type="hidden" name="submissionId" value={submission.id} />
              <input type="hidden" name="expectedVersion" value={submission.version} />
              {submission.rubric?.criteria.map((criterion) => (
                <div className={styles.rubricCriterion} key={criterion.id}>
                  <div>
                    <strong>{criterion.title}</strong>
                    <p className="muted">{criterion.description}</p>
                  </div>
                  <Field htmlFor={`score-${criterion.id}`} label={`${labels.score} / ${criterion.maxScore}`}>
                    <Input
                      id={`score-${criterion.id}`}
                      max={criterion.maxScore}
                      min={0}
                      name={`score:${criterion.id}`}
                      required={criterion.required}
                      step="any"
                      type="number"
                    />
                  </Field>
                </div>
              ))}
              <Field
                htmlFor="review-comment"
                label={labels.reviewerComment}
                description={labels.reviewerCommentDescription}
              >
                <Textarea id="review-comment" name="comment" minLength={3} required />
              </Field>
            </div>
            <footer className="panel__footer cluster">
              <Button name="decision" value="accepted" type="submit">{labels.accept}</Button>
              <Button name="decision" value="revision_required" type="submit" variant="danger">
                {labels.requestRevision}
              </Button>
            </footer>
          </form>

          {availableTrainers.length > 0 ? (
            <form action={transferAction} className="panel">
              <header className="panel__header"><h2>{labels.transfer}</h2></header>
              <div className="panel__body stack">
                <input type="hidden" name="submissionId" value={submission.id} />
                <input type="hidden" name="expectedVersion" value={submission.version} />
                <input type="hidden" name="idempotencyKey" value={transferIdempotencyKey} />
                <Field htmlFor="review-transfer-to" label={labels.transferTo}>
                  <select className="select" id="review-transfer-to" name="toTrainerId" required>
                    <option value="" />
                    {availableTrainers.map((trainer) => (
                      <option key={trainer.id} value={trainer.id}>{trainer.name}</option>
                    ))}
                  </select>
                </Field>
                <Field
                  htmlFor="review-transfer-reason"
                  label={labels.transferReason}
                  description={labels.transferReasonDescription}
                >
                  <Textarea
                    id="review-transfer-reason"
                    maxLength={2000}
                    minLength={3}
                    name="reason"
                    required
                  />
                </Field>
              </div>
              <footer className="panel__footer"><Button type="submit" variant="secondary">{labels.transfer}</Button></footer>
            </form>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
