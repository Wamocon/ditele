import type { Route } from "next";
import Link from "next/link";

import { Badge } from "@/shared/ui/badge";
import { StatePanel } from "@/shared/ui/state-panel";

import type { TrainerHistoryCopy } from "../trainer-history-copy";
import type { TrainerReviewHistoryItem } from "../trainer-history-model";
import styles from "./trainer-history.module.css";

export interface TrainerReviewHistoryViewProps {
  readonly items: readonly TrainerReviewHistoryItem[];
  readonly labels: TrainerHistoryCopy;
  readonly limit: number;
  readonly formatDateTime: (value: string) => string;
  readonly submissionHref: (submissionId: string) => Route;
}

export function TrainerReviewHistoryView({
  items,
  labels,
  limit,
  formatDateTime,
  submissionHref,
}: TrainerReviewHistoryViewProps) {
  return (
    <section className="stack" aria-labelledby="trainer-history-title">
      <header className={styles.heading}>
        <div>
          <h1 id="trainer-history-title">{labels.title}</h1>
          <p className="muted reading-column">{labels.description}</p>
          <p className="muted">{labels.newestLimit(limit)}</p>
        </div>
        <Badge>{labels.reviewCount(items.length)}</Badge>
      </header>

      {items.length === 0 ? (
        <StatePanel
          description={labels.emptyDescription}
          title={labels.emptyTitle}
        />
      ) : (
        <ol className={styles.historyList}>
          {items.map((item) => (
            <li key={item.id}>
              <article className={styles.historyCard}>
                <header className={styles.cardHeader}>
                  <div>
                    <h2>
                      <span className="sr-only">{labels.task}:</span>{" "}
                      {item.taskTitle ?? labels.unknownTask}
                    </h2>
                    <p className="muted">
                      <span className="sr-only">{labels.learner}:</span>{" "}
                      {item.learnerName ?? labels.unknownLearner}
                    </p>
                  </div>
                  <Badge
                    tone={
                      item.decision === "accepted" ? "success" : "warning"
                    }
                  >
                    {labels.decisions[item.decision]}
                  </Badge>
                </header>

                <dl className={styles.contextGrid}>
                  <div>
                    <dt>{labels.group}</dt>
                    <dd>{item.cohortName}</dd>
                  </div>
                  <div>
                    <dt>{labels.course}</dt>
                    <dd>{item.courseTitle}</dd>
                  </div>
                  <div>
                    <dt>{labels.decidedAt}</dt>
                    <dd>
                      <time dateTime={item.decidedAt}>
                        {formatDateTime(item.decidedAt)}
                      </time>
                    </dd>
                  </div>
                </dl>

                <section aria-label={labels.comment}>
                  <h3>{labels.comment}</h3>
                  <blockquote className={styles.comment}>
                    {item.comment}
                  </blockquote>
                </section>

                <div className={styles.cardAction}>
                  <Link
                    className="button button--secondary"
                    href={submissionHref(item.submissionId)}
                  >
                    {labels.openSubmission}
                  </Link>
                </div>
              </article>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
