import { randomUUID } from "node:crypto";

import Link from "next/link";

import { localizedDynamicRoute } from "@/shared/i18n/routes";
import type { Locale } from "@/shared/i18n/config";
import { Badge } from "@/shared/ui/badge";
import { StatePanel } from "@/shared/ui/state-panel";

import type {
  CohortManagementCopy,
  CohortManagementNotice,
} from "../cohort-management-copy";
import type {
  CohortManagementDetail,
  CohortManagementPerspective,
  CohortScheduleItem,
} from "../cohort-management-model";
import {
  CohortTransitionForm,
  TaskScheduleForm,
  type CohortServerAction,
  type CohortTransitionFormLabels,
  type TaskScheduleFormLabels,
} from "./cohort-command-forms";
import styles from "./cohort-management.module.css";

function lifecycleTone(
  state: CohortManagementDetail["state"],
): "neutral" | "success" | "warning" | "danger" {
  if (state === "active") return "success";
  if (state === "waiting") return "warning";
  if (state === "cancelled") return "danger";
  return "neutral";
}

function DateValue({
  formatter,
  labels,
  value,
}: {
  readonly formatter: Intl.DateTimeFormat;
  readonly labels: CohortManagementCopy;
  readonly value: string | null;
}) {
  return value ? (
    <time dateTime={value}>{formatter.format(new Date(value))} UTC</time>
  ) : (
    <>{labels.notSet}</>
  );
}

function ScheduleFacts({
  formatter,
  labels,
  schedule,
}: {
  readonly formatter: Intl.DateTimeFormat;
  readonly labels: CohortManagementCopy;
  readonly schedule: CohortScheduleItem;
}) {
  return (
    <dl className={styles.scheduleFacts}>
      <div>
        <dt>{labels.availableFrom}</dt>
        <dd>
          <DateValue
            formatter={formatter}
            labels={labels}
            value={schedule.availableFrom}
          />
        </dd>
      </div>
      <div>
        <dt>{labels.dueAt}</dt>
        <dd>
          <DateValue
            formatter={formatter}
            labels={labels}
            value={schedule.dueAt}
          />
        </dd>
      </div>
      <div>
        <dt>{labels.lastChange}</dt>
        <dd>
          {schedule.updatedAt ? (
            <DateValue
              formatter={formatter}
              labels={labels}
              value={schedule.updatedAt}
            />
          ) : (
            labels.scheduleMissing
          )}
        </dd>
      </div>
    </dl>
  );
}

export function CohortManagementView({
  detail,
  labels,
  locale,
  notice,
  perspective,
  scheduleAction,
  transitionAction,
}: {
  readonly detail: CohortManagementDetail;
  readonly labels: CohortManagementCopy;
  readonly locale: Locale;
  readonly notice: CohortManagementNotice | null;
  readonly perspective: CohortManagementPerspective;
  readonly scheduleAction: CohortServerAction;
  readonly transitionAction: CohortServerAction;
}) {
  const formatter = new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  });
  const backHref = localizedDynamicRoute(locale, `/${perspective}/groups`);
  const terminal = detail.state === "completed" || detail.state === "cancelled";
  const hasLifecycleCommand =
    detail.canStart || detail.canComplete || detail.canCancel;
  const transitionFormLabels = {
    startTitle: labels.startTitle,
    startDescription: labels.startDescription,
    start: labels.start,
    starting: labels.starting,
    completeTitle: labels.completeTitle,
    completeDescription: labels.completeDescription,
    complete: labels.complete,
    completing: labels.completing,
    cancelTitle: labels.cancelTitle,
    cancelDescription: labels.cancelDescription,
    cancel: labels.cancel,
    cancelling: labels.cancelling,
    reason: labels.reason,
    reasonPlaceholder: labels.reasonPlaceholder,
  } satisfies CohortTransitionFormLabels;
  const scheduleFormLabels = {
    availableFrom: labels.availableFrom,
    dueAt: labels.dueAt,
    utcNote: labels.utcNote,
    reason: labels.reason,
    reasonPlaceholder: labels.reasonPlaceholder,
    saveSchedule: labels.saveSchedule,
    savingSchedule: labels.savingSchedule,
  } satisfies TaskScheduleFormLabels;

  return (
    <section aria-labelledby="cohort-management-title" className={styles.workspace}>
      <Link className={styles.backLink} href={backHref}>
        ← {labels.back}
      </Link>

      {notice ? (
        <p
          className={`${styles.notice} ${notice === "stale" ? styles.noticeWarning : styles.noticeSuccess}`}
          role="status"
        >
          {labels.notices[notice]}
        </p>
      ) : null}

      <header className={styles.pageHeader}>
        <div>
          <div className={styles.headerBadges}>
            <Badge tone={lifecycleTone(detail.state)}>
              {labels.states[detail.state]}
            </Badge>
            <Badge>{labels.modes[detail.progressionMode]}</Badge>
            {detail.courseTitleUsesFallback ? (
              <Badge tone="warning">
                {labels.fallback(detail.courseTitleLocale)}
              </Badge>
            ) : null}
          </div>
          <h1 id="cohort-management-title">{detail.name}</h1>
          <p className="muted reading-column">{labels.pageDescription}</p>
        </div>
      </header>

      <dl className={`panel ${styles.overviewFacts}`}>
        <div>
          <dt>{labels.course}</dt>
          <dd>{detail.courseTitle}</dd>
        </div>
        <div>
          <dt>{labels.contentVersion}</dt>
          <dd>
            {detail.publishedVersionNumber
              ? labels.versionValue(detail.publishedVersionNumber)
              : labels.pinUnavailable}
            {detail.pinnedVersionState === "archived" ? (
              <span className={styles.archivedPin}> · {labels.archivedPin}</span>
            ) : null}
          </dd>
        </div>
        <div>
          <dt>{labels.learners}</dt>
          <dd>{detail.learnerCount}</dd>
        </div>
        <div>
          <dt>{labels.trainers}</dt>
          <dd>{detail.trainerCount}</dd>
        </div>
        <div>
          <dt>{labels.capacity}</dt>
          <dd>{detail.capacity ?? labels.unlimited}</dd>
        </div>
        <div>
          <dt>{labels.starts}</dt>
          <dd>
            <DateValue formatter={formatter} labels={labels} value={detail.startsAt} />
          </dd>
        </div>
        <div>
          <dt>{labels.ends}</dt>
          <dd>
            <DateValue formatter={formatter} labels={labels} value={detail.endsAt} />
          </dd>
        </div>
        <div>
          <dt>{labels.completedAt}</dt>
          <dd>
            <DateValue
              formatter={formatter}
              labels={labels}
              value={detail.completedAt}
            />
          </dd>
        </div>
        <div>
          <dt>{labels.updated}</dt>
          <dd>
            <DateValue formatter={formatter} labels={labels} value={detail.updatedAt} />
          </dd>
        </div>
      </dl>

      <section aria-labelledby="cohort-lifecycle-title" className={styles.section}>
        <header className={styles.sectionHeader}>
          <div>
            <h2 id="cohort-lifecycle-title">{labels.lifecycleTitle}</h2>
            <p className="muted reading-column">{labels.lifecycleDescription}</p>
          </div>
        </header>

        {hasLifecycleCommand ? (
          <div className={styles.commandGrid}>
            {detail.canStart ? (
              <CohortTransitionForm
                action={transitionAction}
                cohortId={detail.id}
                expectedVersion={detail.rowVersion}
                idempotencyKey={`cohort-start:${detail.id}:${detail.rowVersion}:${randomUUID()}`}
                labels={transitionFormLabels}
                locale={locale}
                perspective={perspective}
                targetState="active"
              />
            ) : null}
            {detail.canComplete ? (
              <CohortTransitionForm
                action={transitionAction}
                cohortId={detail.id}
                expectedVersion={detail.rowVersion}
                idempotencyKey={`cohort-complete:${detail.id}:${detail.rowVersion}:${randomUUID()}`}
                labels={transitionFormLabels}
                locale={locale}
                perspective={perspective}
                targetState="completed"
              />
            ) : null}
            {detail.canCancel ? (
              <CohortTransitionForm
                action={transitionAction}
                cohortId={detail.id}
                expectedVersion={detail.rowVersion}
                idempotencyKey={`cohort-cancel:${detail.id}:${detail.rowVersion}:${randomUUID()}`}
                labels={transitionFormLabels}
                locale={locale}
                perspective={perspective}
                targetState="cancelled"
              />
            ) : null}
          </div>
        ) : (
          <p className={`panel ${styles.readOnlyNotice}`} role="status">
            {terminal ? labels.terminalLifecycle : labels.noLifecycleCommand}
          </p>
        )}
      </section>

      <section aria-labelledby="cohort-schedules-title" className={styles.section}>
        <header className={styles.sectionHeader}>
          <div>
            <h2 id="cohort-schedules-title">{labels.schedulesTitle}</h2>
            <p className="muted reading-column">{labels.schedulesDescription}</p>
          </div>
          {detail.publishedVersionNumber ? (
            <Badge>{labels.versionValue(detail.publishedVersionNumber)}</Badge>
          ) : null}
        </header>

        {detail.schedules.length === 0 ? (
          <StatePanel
            description={labels.noSchedulesDescription}
            title={labels.noSchedulesTitle}
          />
        ) : (
          <ol className={styles.scheduleList}>
            {detail.schedules.map((schedule) => (
              <li key={schedule.taskId}>
                <article className={`panel ${styles.scheduleCard}`}>
                  <header className={styles.scheduleHeader}>
                    <div>
                      <p className={styles.stageLabel}>
                        {labels.stage}: {schedule.stageTitle}
                      </p>
                      <h3>{schedule.taskTitle}</h3>
                    </div>
                    <div className={styles.headerBadges}>
                      <Badge>{labels.taskKinds[schedule.taskKind]}</Badge>
                      <Badge tone={schedule.id ? "neutral" : "warning"}>
                        {schedule.id
                          ? labels.scheduleVersion(schedule.rowVersion)
                          : labels.scheduleMissing}
                      </Badge>
                      {schedule.taskTitleUsesFallback ? (
                        <Badge tone="warning">
                          {labels.fallback(schedule.taskTitleLocale)}
                        </Badge>
                      ) : null}
                      {schedule.stageTitleUsesFallback ? (
                        <Badge tone="warning">
                          {labels.fallback(schedule.stageTitleLocale)}
                        </Badge>
                      ) : null}
                    </div>
                  </header>
                  <ScheduleFacts
                    formatter={formatter}
                    labels={labels}
                    schedule={schedule}
                  />
                  {schedule.changeReason ? (
                    <p className={styles.changeReason}>
                      <strong>{labels.reason}:</strong> {schedule.changeReason}
                    </p>
                  ) : null}
                  {detail.canManageSchedules ? (
                    <TaskScheduleForm
                      action={scheduleAction}
                      cohortId={detail.id}
                      idempotencyKey={`schedule:${detail.id}:${schedule.taskId}:${schedule.rowVersion}:${randomUUID()}`}
                      labels={scheduleFormLabels}
                      locale={locale}
                      perspective={perspective}
                      schedule={schedule}
                    />
                  ) : (
                    <p className={styles.scheduleReadOnly} role="status">
                      {labels.scheduleReadOnly}
                    </p>
                  )}
                </article>
              </li>
            ))}
          </ol>
        )}
      </section>
    </section>
  );
}
