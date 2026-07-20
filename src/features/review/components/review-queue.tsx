import { Badge } from "@/shared/ui/badge";
import { StatePanel } from "@/shared/ui/state-panel";

import type { ReviewQueueItem } from "../model";
import styles from "./review.module.css";

export interface ReviewQueueLabels {
  readonly title: string;
  readonly itemCount: (count: number) => string;
  readonly learner: string;
  readonly task: string;
  readonly group: string;
  readonly submittedAt: string;
  readonly status: string;
  readonly open: string;
  readonly emptyTitle: string;
  readonly emptyDescription: string;
  readonly states: Readonly<Record<ReviewQueueItem["state"], string>>;
  readonly ownership: Readonly<Record<"assigned" | "transferred", string>>;
}

export interface ReviewQueueProps {
  readonly items: readonly ReviewQueueItem[];
  readonly labels: ReviewQueueLabels;
  readonly formatDateTime: (isoDate: string) => string;
  readonly reviewHref: (submissionId: string) => string;
}

function Status({ item, labels }: { item: ReviewQueueItem; labels: ReviewQueueLabels }) {
  const transferred = item.transfer?.status === "accepted";
  return (
    <div className="cluster">
      <Badge tone={item.state === "resubmitted" ? "warning" : "neutral"}>
        {labels.states[item.state]}
      </Badge>
      <span className="muted">
        {labels.ownership[transferred ? "transferred" : "assigned"]}
      </span>
    </div>
  );
}

export function ReviewQueue({ items, labels, formatDateTime, reviewHref }: ReviewQueueProps) {
  if (items.length === 0) {
    return <StatePanel title={labels.emptyTitle} description={labels.emptyDescription} />;
  }

  return (
    <section className="panel" aria-labelledby="review-queue-title">
      <header className={`panel__header ${styles.queueHeader}`}>
        <h2 id="review-queue-title">{labels.title}</h2>
        <strong>{labels.itemCount(items.length)}</strong>
      </header>
      <div className="panel__body">
        <table className={styles.queueTable}>
          <thead>
            <tr>
              <th scope="col">{labels.learner}</th>
              <th scope="col">{labels.task}</th>
              <th scope="col">{labels.group}</th>
              <th scope="col">{labels.submittedAt}</th>
              <th scope="col">{labels.status}</th>
              <th scope="col"><span className="sr-only">{labels.open}</span></th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id}>
                <td><strong>{item.learnerName}</strong></td>
                <td>{item.taskTitle}</td>
                <td>{item.groupName}</td>
                <td>{formatDateTime(item.submittedAt)}</td>
                <td><Status item={item} labels={labels} /></td>
                <td><a className="button button--secondary" href={reviewHref(item.id)}>{labels.open}</a></td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className={styles.mobileQueue}>
          {items.map((item) => (
            <article className="panel stack" key={item.id}>
              <div className={styles.queueHeader}>
                <strong>{item.learnerName}</strong>
                <Status item={item} labels={labels} />
              </div>
              <div>
                <div>{item.taskTitle}</div>
                <div className="muted">{item.groupName} · {formatDateTime(item.submittedAt)}</div>
              </div>
              <a className="button button--secondary" href={reviewHref(item.id)}>{labels.open}</a>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
