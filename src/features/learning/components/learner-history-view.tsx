import type { Route } from "next";
import Link from "next/link";

import { Badge } from "@/shared/ui/badge";
import { StatePanel } from "@/shared/ui/state-panel";

import type { LearnerHistoryCopy } from "../learner-history-copy";
import type {
  LearnerHistoryEventKind,
  LearnerHistoryPage,
  LearnerHistoryTarget,
} from "../model/learner-history";
import styles from "./learner-history.module.css";

const successKinds = new Set<LearnerHistoryEventKind>([
  "course_completed",
  "review_accepted",
  "question_answered",
  "certificate_available",
]);
const warningKinds = new Set<LearnerHistoryEventKind>([
  "course_rejected",
  "course_cancelled",
  "review_revision_required",
  "certificate_revoked",
  "certificate_expired",
]);
const taskKinds = new Set<LearnerHistoryEventKind>([
  "attempt_started",
  "task_submitted",
  "task_resubmitted",
  "review_accepted",
  "review_revision_required",
  "question_asked",
  "question_answered",
  "question_archived",
]);

type BadgeTone = "neutral" | "success" | "warning";

function tone(kind: LearnerHistoryEventKind): BadgeTone {
  if (successKinds.has(kind)) return "success";
  if (warningKinds.has(kind)) return "warning";
  return "neutral";
}

export interface LearnerHistoryViewProps {
  readonly history: LearnerHistoryPage;
  readonly labels: LearnerHistoryCopy;
  readonly formatDateTime: (value: string) => string;
  readonly targetHref: (target: LearnerHistoryTarget) => Route;
  readonly pageHref: (page: number, snapshotAt: string) => Route;
}

export function LearnerHistoryView({
  history,
  labels,
  formatDateTime,
  targetHref,
  pageHref,
}: LearnerHistoryViewProps) {
  return (
    <section aria-labelledby="learner-history-title" className="stack">
      <header className={styles.heading}>
        <div>
          <h1 id="learner-history-title">{labels.title}</h1>
          <p className="muted reading-column">{labels.description}</p>
        </div>
        <Badge>{labels.eventsOnPage(history.items.length)}</Badge>
      </header>

      <aside
        aria-labelledby="learner-history-privacy-title"
        className={`panel stack ${styles.privacyNotice}`}
      >
        <h2 id="learner-history-privacy-title">{labels.privacyTitle}</h2>
        <p className="muted reading-column">{labels.privacyDescription}</p>
      </aside>

      {history.items.length === 0 ? (
        <StatePanel
          description={labels.emptyDescription}
          title={labels.emptyTitle}
        />
      ) : (
        <ol className={styles.historyList}>
          {history.items.map((item) => (
            <li key={item.id}>
              <article className={`panel stack ${styles.eventCard}`}>
                <header className={styles.eventHeader}>
                  <h2>{labels.kinds[item.kind]}</h2>
                  <Badge tone={tone(item.kind)}>
                    <span className="sr-only">{labels.recordedAt}: </span>
                    <time dateTime={item.occurredAt}>
                      {formatDateTime(item.occurredAt)}
                    </time>
                  </Badge>
                </header>

                <dl className={styles.contextGrid}>
                  <div>
                    <dt>{labels.course}</dt>
                    <dd>{item.courseTitle ?? labels.unknownCourse}</dd>
                  </div>
                  {taskKinds.has(item.kind) ? (
                    <div>
                      <dt>{labels.task}</dt>
                      <dd>{item.taskTitle ?? labels.unknownTask}</dd>
                    </div>
                  ) : null}
                  {item.ordinal !== null ? (
                    <div>
                      <dt>{labels.ordinal}</dt>
                      <dd>{item.ordinal}</dd>
                    </div>
                  ) : null}
                </dl>

                {item.target ? (
                  <footer className={styles.eventFooter}>
                    <Link
                      className="button button--secondary"
                      href={targetHref(item.target)}
                    >
                      {labels.openRelated}
                    </Link>
                  </footer>
                ) : null}
              </article>
            </li>
          ))}
        </ol>
      )}

      {history.reachedPageLimit ? (
        <StatePanel
          description={labels.pageLimitDescription}
          title={labels.pageLimitTitle}
        />
      ) : null}

      <nav
        aria-label={labels.page(history.page)}
        className={styles.pagination}
      >
        {history.hasPreviousPage ? (
          <Link
            className="button button--secondary"
            href={pageHref(history.page - 1, history.snapshotAt)}
          >
            {labels.previousPage}
          </Link>
        ) : (
          <span aria-disabled="true" className="button button--secondary">
            {labels.previousPage}
          </span>
        )}
        <span aria-current="page">{labels.page(history.page)}</span>
        {history.hasNextPage ? (
          <Link
            className="button button--secondary"
            href={pageHref(history.page + 1, history.snapshotAt)}
          >
            {labels.nextPage}
          </Link>
        ) : (
          <span aria-disabled="true" className="button button--secondary">
            {labels.nextPage}
          </span>
        )}
      </nav>
    </section>
  );
}
