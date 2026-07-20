import { Badge } from "@/shared/ui/badge";
import { StatePanel } from "@/shared/ui/state-panel";

import type {
  TrainerLearnerProgressItem,
  TrainerProgressEnrollmentStatus,
} from "../trainer-read-model";
import type { TrainerProgressCopy } from "../trainer-read-copy";
import styles from "./trainer-read.module.css";

export interface TrainerProgressViewProps {
  readonly items: readonly TrainerLearnerProgressItem[];
  readonly labels: TrainerProgressCopy;
  readonly formatDateTime: (value: string) => string;
}

function enrollmentTone(
  state: TrainerProgressEnrollmentStatus,
): "neutral" | "success" | "warning" | "danger" {
  if (state === "assigned" || state === "completed") return "success";
  if (state === "requested" || state === "approved" || state === "recorded") {
    return "warning";
  }
  if (state === "rejected" || state === "cancelled") return "danger";
  return "neutral";
}

function LearnerName({
  item,
  labels,
}: {
  readonly item: TrainerLearnerProgressItem;
  readonly labels: TrainerProgressCopy;
}) {
  return <strong>{item.learnerName ?? labels.unknownLearner}</strong>;
}

function ActivityTime({
  item,
  labels,
  formatDateTime,
}: {
  readonly item: TrainerLearnerProgressItem;
  readonly labels: TrainerProgressCopy;
  readonly formatDateTime: (value: string) => string;
}) {
  return item.lastActivityAt ? (
    <time dateTime={item.lastActivityAt}>
      {formatDateTime(item.lastActivityAt)}
    </time>
  ) : (
    <span className="muted">{labels.noActivity}</span>
  );
}

function AttemptSummary({
  item,
  labels,
}: {
  readonly item: TrainerLearnerProgressItem;
  readonly labels: TrainerProgressCopy;
}) {
  return (
    <dl className={styles.attemptSummary}>
      <div>
        <dt>{labels.attempts}</dt>
        <dd>{item.totalAttemptCount}</dd>
      </div>
      <div>
        <dt>{labels.active}</dt>
        <dd>{item.activeAttemptCount}</dd>
      </div>
      <div>
        <dt>{labels.accepted}</dt>
        <dd>{item.acceptedAttemptCount}</dd>
      </div>
    </dl>
  );
}

export function TrainerProgressView({
  items,
  labels,
  formatDateTime,
}: TrainerProgressViewProps) {
  return (
    <section className="stack" aria-labelledby="trainer-progress-title">
      <header className={styles.heading}>
        <div>
          <h1 id="trainer-progress-title">{labels.title}</h1>
          <p className="muted reading-column">{labels.description}</p>
        </div>
        <Badge>{labels.learnerCount(items.length)}</Badge>
      </header>

      <aside className={styles.scopeNotice} aria-label={labels.enrollment}>
        <p>{labels.enrollmentScopeNote}</p>
      </aside>

      {items.length === 0 ? (
        <StatePanel
          description={labels.emptyDescription}
          title={labels.emptyTitle}
        />
      ) : (
        <div className="panel">
          <div className={styles.desktopTableWrap}>
            <table className={styles.progressTable}>
              <caption className="sr-only">{labels.title}</caption>
              <thead>
                <tr>
                  <th scope="col">{labels.learner}</th>
                  <th scope="col">{labels.cohort}</th>
                  <th scope="col">{labels.enrollment}</th>
                  <th scope="col">{labels.attempts}</th>
                  <th scope="col">{labels.lastActivity}</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={`${item.cohortId}:${item.learnerId}`}>
                    <td>
                      <LearnerName item={item} labels={labels} />
                      <div className="muted">
                        {labels.assigned}: {formatDateTime(item.assignedAt)}
                      </div>
                    </td>
                    <td>
                      <strong>{item.cohortName}</strong>
                      <div className="muted">
                        <span className="sr-only">{labels.course}:</span>{" "}
                        {item.courseTitle}
                      </div>
                    </td>
                    <td>
                      <Badge tone={enrollmentTone(item.enrollmentStatus)}>
                        {labels.enrollmentStates[item.enrollmentStatus]}
                      </Badge>
                    </td>
                    <td>
                      <AttemptSummary item={item} labels={labels} />
                    </td>
                    <td>
                      <ActivityTime
                        formatDateTime={formatDateTime}
                        item={item}
                        labels={labels}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <ul className={styles.mobileProgressList}>
            {items.map((item) => (
              <li key={`${item.cohortId}:${item.learnerId}`}>
                <article className={styles.progressCard}>
                  <header className={styles.cardHeader}>
                    <div>
                      <LearnerName item={item} labels={labels} />
                      <p className="muted">{item.cohortName}</p>
                    </div>
                    <Badge tone={enrollmentTone(item.enrollmentStatus)}>
                      {labels.enrollmentStates[item.enrollmentStatus]}
                    </Badge>
                  </header>
                  <p>
                    <span className="sr-only">{labels.course}:</span>{" "}
                    {item.courseTitle}
                  </p>
                  <AttemptSummary item={item} labels={labels} />
                  <dl className={styles.mobileMetadata}>
                    <div>
                      <dt>{labels.lastActivity}</dt>
                      <dd>
                        <ActivityTime
                          formatDateTime={formatDateTime}
                          item={item}
                          labels={labels}
                        />
                      </dd>
                    </div>
                    <div>
                      <dt>{labels.assigned}</dt>
                      <dd>
                        <time dateTime={item.assignedAt}>
                          {formatDateTime(item.assignedAt)}
                        </time>
                      </dd>
                    </div>
                  </dl>
                </article>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
