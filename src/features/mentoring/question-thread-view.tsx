import type { Route } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

import { Badge } from "@/shared/ui/badge";
import { StatePanel } from "@/shared/ui/state-panel";

import type { QuestionWorkflowCopy } from "./question-workflow-copy";
import type { QuestionDetailView } from "./question-workflow-model";
import styles from "./question-workflow.module.css";

type QuestionThreadViewProps = {
  actions?: ReactNode;
  backHref: Route;
  formatDateTime: (value: string) => string;
  labels: QuestionWorkflowCopy["common"];
  openExplanation?: string;
  question: QuestionDetailView;
};

function tone(
  state: QuestionDetailView["state"],
): "neutral" | "success" | "warning" {
  if (state === "answered") return "success";
  if (state === "open" || state === "transferred") return "warning";
  return "neutral";
}

export function QuestionThreadView({
  actions,
  backHref,
  formatDateTime,
  labels,
  openExplanation,
  question,
}: QuestionThreadViewProps) {
  return (
    <article className={styles.detail}>
      <div>
        <Link className="button button--quiet" href={backHref}>
          {labels.back}
        </Link>
      </div>

      <header>
        <div className={styles.detailHeader}>
          <Badge tone={tone(question.state)}>{labels.states[question.state]}</Badge>
          <time className="muted" dateTime={question.updatedAt}>
            {labels.updated}: {formatDateTime(question.updatedAt)}
          </time>
        </div>
        <h1 className={styles.detailHeading}>{question.subject}</h1>
        <dl className={styles.metaGrid}>
          <div>
            <dt>{labels.task}</dt>
            <dd>{question.taskTitle}</dd>
          </div>
          <div>
            <dt>{labels.cohort}</dt>
            <dd>{question.cohortName}</dd>
          </div>
          <div>
            <dt>{labels.learner}</dt>
            <dd>{question.learnerName}</dd>
          </div>
          <div>
            <dt>{labels.assignedTrainer}</dt>
            <dd>{question.assignedTrainerName ?? labels.unassigned}</dd>
          </div>
          <div>
            <dt>{labels.created}</dt>
            <dd>
              <time dateTime={question.createdAt}>
                {formatDateTime(question.createdAt)}
              </time>
            </dd>
          </div>
        </dl>
      </header>

      {question.state === "open" && openExplanation ? (
        <StatePanel description={openExplanation} title={labels.unassigned} />
      ) : null}

      <section aria-labelledby="question-conversation-heading" className="stack">
        <h2 id="question-conversation-heading">{labels.conversation}</h2>
        {question.messages.length === 0 ? (
          <p className="muted" role="status">{labels.noMessages}</p>
        ) : (
          <ol className={styles.conversation}>
            {question.messages.map((message) => (
              <li className={styles.message} data-kind={message.authorKind} key={message.id}>
                <article>
                  <header className={styles.messageHeader}>
                    <strong>
                      {message.authorKind === "learner"
                        ? labels.learnerMessage
                        : labels.trainerMessage}: {message.authorName}
                    </strong>
                    <time className="muted" dateTime={message.createdAt}>
                      {formatDateTime(message.createdAt)}
                    </time>
                  </header>
                  <p>{message.body}</p>
                </article>
              </li>
            ))}
          </ol>
        )}
      </section>

      {question.transfers.length > 0 ? (
        <details className="panel panel__body">
          <summary>{labels.transferHistory}</summary>
          <ol className={styles.transferList}>
            {question.transfers.map((transfer) => (
              <li key={transfer.id}>
                <p>
                  {labels.transferredFromTo(
                    transfer.fromTrainerName,
                    transfer.toTrainerName,
                    formatDateTime(transfer.createdAt),
                  )}
                </p>
                <p className="muted">{transfer.reason}</p>
              </li>
            ))}
          </ol>
        </details>
      ) : null}

      {actions}
    </article>
  );
}

