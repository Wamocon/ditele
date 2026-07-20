import Link from "next/link";
import type { Route } from "next";

import type { Locale } from "@/shared/i18n/config";
import { localizedDynamicRoute } from "@/shared/i18n/routes";
import { Badge } from "@/shared/ui/badge";
import { StatePanel } from "@/shared/ui/state-panel";

import {
  toLearnerNotificationClientCopy,
  type LearnerNotificationCopy,
} from "./learner-copy";
import {
  MarkAllNotificationsReadForm,
  MarkNotificationReadForm,
  NotificationPreferenceForm,
  type LearnerNotificationServerAction,
} from "./learner-forms";
import {
  learnerNotificationEventFamilies,
  type LearnerNotificationCenter,
  type LearnerNotificationRecord,
} from "./learner-model";
import styles from "./learner.module.css";

function targetHref(
  locale: Locale,
  notification: LearnerNotificationRecord,
): Route | null {
  if (!notification.target) return null;
  if (notification.target.type === "course") {
    return localizedDynamicRoute(
      locale,
      `/learn/courses/${notification.target.id}`,
    );
  }
  return localizedDynamicRoute(
    locale,
    `/learn/questions/${notification.target.id}`,
  );
}

function decisionLabel(
  labels: LearnerNotificationCopy,
  notification: LearnerNotificationRecord,
): string | null {
  if (notification.enrollmentState) {
    return labels.enrollmentStates[notification.enrollmentState] ?? null;
  }
  if (notification.reviewDecision) {
    return labels.reviewDecisions[notification.reviewDecision] ?? null;
  }
  if (notification.cohortState) {
    return labels.cohortStates[notification.cohortState];
  }
  return null;
}

export function LearnerNotificationCenterView({
  center,
  idempotencyKeys,
  labels,
  locale,
  markAllAction,
  markReadAction,
  preferenceAction,
}: {
  readonly center: LearnerNotificationCenter;
  readonly idempotencyKeys: Readonly<{
    markAll: string;
    markRead: Readonly<Record<string, string>>;
    preferences: Readonly<Record<string, string>>;
  }>;
  readonly labels: LearnerNotificationCopy;
  readonly locale: Locale;
  readonly markAllAction: LearnerNotificationServerAction;
  readonly markReadAction: LearnerNotificationServerAction;
  readonly preferenceAction: LearnerNotificationServerAction;
}) {
  const dateTime = new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: center.timezone,
  });
  const snapshotQuery = encodeURIComponent(center.snapshotAt);
  const clientLabels = toLearnerNotificationClientCopy(labels);
  return (
    <div className="stack">
      <header className="page-heading">
        <div>
          <h1>{labels.title}</h1>
          <p className="muted reading-column">{labels.description}</p>
        </div>
      </header>

      <section aria-labelledby="notification-inbox-title" className="stack">
        <header className={styles.inboxHeader}>
          <div className="stack">
            <h2 id="notification-inbox-title">{labels.inboxTitle}</h2>
            <div className="cluster">
              <Badge>{labels.count(center.total)}</Badge>
              <Badge tone={center.unreadCount > 0 ? "warning" : "success"}>
                {labels.unreadCount(center.unreadCount)}
              </Badge>
            </div>
          </div>
          {center.unreadCount > 0 ? (
            <MarkAllNotificationsReadForm
              action={markAllAction}
              before={center.snapshotAt}
              idempotencyKey={idempotencyKeys.markAll}
              labels={clientLabels}
            />
          ) : null}
        </header>

        {center.items.length === 0 ? (
          <StatePanel
            description={labels.emptyDescription}
            title={labels.emptyTitle}
          />
        ) : (
          <ol className={styles.notificationList}>
            {center.items.map((notification) => {
              const href = targetHref(locale, notification);
              const decision = decisionLabel(labels, notification);
              return (
                <li key={notification.id}>
                  <article className={`panel stack ${styles.notificationCard}`}>
                    <header className={styles.notificationHeader}>
                      <div className="stack">
                        <h3>{labels.kinds[notification.kind]}</h3>
                        <p>{labels.kindDescriptions[notification.kind]}</p>
                      </div>
                      <div className="cluster">
                        {decision ? <Badge>{decision}</Badge> : null}
                        <Badge tone={notification.readAt ? "neutral" : "warning"}>
                          {notification.readAt ? labels.read : labels.unread}
                        </Badge>
                      </div>
                    </header>
                    <time className="muted" dateTime={notification.createdAt}>
                      {dateTime.format(new Date(notification.createdAt))}
                    </time>
                    <footer className={styles.notificationFooter}>
                      {href ? (
                        <Link className="button" href={href}>
                          {labels.open}
                        </Link>
                      ) : <span />}
                      {!notification.readAt ? (
                        <MarkNotificationReadForm
                          action={markReadAction}
                          expectedVersion={notification.rowVersion}
                          idempotencyKey={
                            idempotencyKeys.markRead[notification.id] ?? ""
                          }
                          labels={clientLabels}
                          notificationId={notification.id}
                        />
                      ) : null}
                    </footer>
                  </article>
                </li>
              );
            })}
          </ol>
        )}

        <nav
          aria-label={labels.page(center.page, center.totalPages)}
          className={styles.pagination}
        >
          {center.page > 1 ? (
            <Link
              className="button button--secondary"
              href={localizedDynamicRoute(
                locale,
                `/learn/notifications?page=${center.page - 1}&snapshot=${snapshotQuery}`,
              )}
            >
              {labels.previousPage}
            </Link>
          ) : (
            <span aria-disabled="true" className="button button--secondary">
              {labels.previousPage}
            </span>
          )}
          <span aria-current="page">
            {labels.page(center.page, center.totalPages)}
          </span>
          {center.page < center.totalPages ? (
            <Link
              className="button button--secondary"
              href={localizedDynamicRoute(
                locale,
                `/learn/notifications?page=${center.page + 1}&snapshot=${snapshotQuery}`,
              )}
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

      <section aria-labelledby="notification-preferences-title" className="stack">
        <header className="page-heading">
          <div>
            <h2 id="notification-preferences-title">{labels.preferencesTitle}</h2>
            <p className="muted reading-column">{labels.preferencesDescription}</p>
          </div>
        </header>
        <StatePanel
          description={labels.providerNoticeDescription}
          title={labels.providerNoticeTitle}
        />
        <div className={styles.preferenceGrid}>
          {learnerNotificationEventFamilies.map((eventFamily) => (
            <NotificationPreferenceForm
              action={preferenceAction}
              eventFamily={eventFamily}
              idempotencyKey={
                idempotencyKeys.preferences[eventFamily] ?? ""
              }
              key={eventFamily}
              labels={clientLabels}
              preferences={center.preferences.filter(
                (preference) => preference.eventFamily === eventFamily,
              )}
            />
          ))}
        </div>
      </section>
    </div>
  );
}
