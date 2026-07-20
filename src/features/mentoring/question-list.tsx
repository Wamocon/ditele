import type { Route } from "next";
import Link from "next/link";

import { Badge } from "@/shared/ui/badge";
import { StatePanel } from "@/shared/ui/state-panel";

import type { QuestionWorkflowCopy } from "./question-workflow-copy";
import type { QuestionSummary } from "./question-workflow-model";
import styles from "./question-workflow.module.css";

type QuestionListProps = {
  detailHref: (questionId: string) => Route;
  emptyDescription: string;
  emptyTitle: string;
  formatDateTime: (value: string) => string;
  items: readonly QuestionSummary[];
  labels: QuestionWorkflowCopy["common"];
  openLabel: string;
};

function stateTone(
  state: QuestionSummary["state"],
): "neutral" | "success" | "warning" {
  if (state === "answered") return "success";
  if (state === "open" || state === "transferred") return "warning";
  return "neutral";
}

export function QuestionList({
  detailHref,
  emptyDescription,
  emptyTitle,
  formatDateTime,
  items,
  labels,
  openLabel,
}: QuestionListProps) {
  if (items.length === 0) {
    return <StatePanel description={emptyDescription} title={emptyTitle} />;
  }

  return (
    <ol className={styles.list}>
      {items.map((question) => (
        <li className={styles.listItem} key={question.id}>
          <article aria-labelledby={`question-summary-${question.id}`}>
            <div className={styles.listHeader}>
              <Badge tone={stateTone(question.state)}>
                {labels.states[question.state]}
              </Badge>
              <time className="muted" dateTime={question.updatedAt}>
                {labels.updated}: {formatDateTime(question.updatedAt)}
              </time>
            </div>
            <h2 className={styles.listTitle} id={`question-summary-${question.id}`}>
              <Link href={detailHref(question.id)}>
                {question.subject}
                <span className="sr-only"> — {openLabel}</span>
              </Link>
            </h2>
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
                <dt>{labels.assignedTrainer}</dt>
                <dd>{question.assignedTrainerName ?? labels.unassigned}</dd>
              </div>
            </dl>
          </article>
        </li>
      ))}
    </ol>
  );
}

