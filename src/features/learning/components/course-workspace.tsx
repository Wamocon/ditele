import type { Route } from "next";
import Link from "next/link";

import { Badge } from "@/shared/ui/badge";
import { StatePanel } from "@/shared/ui/state-panel";

import type {
  CourseActivity,
  CourseActivityLockReason,
  CourseActivityState,
  LearnerCourseWorkspace,
} from "../model/course-workspace";

export interface CourseWorkspaceLabels {
  backToDashboard: string;
  cohort: string;
  progress: string;
  completed(value: number, total: number): string;
  progression: Record<LearnerCourseWorkspace["progressionMode"], string>;
  states: Record<CourseActivityState, string>;
  lockedBecause: string;
  lockReasons: {
    schedule: string;
    entitlement: string;
    configuration: string;
    required_task: string;
    history: string;
    requiredSkill(currentPercent: number, minimumPercent: number): string;
  };
  availableFrom: string;
  dueAt: string;
  expectedTimeLabel: string;
  expectedTime(value: number): string;
  openTask: string;
  historyTitle: string;
  historyDescription: string;
  emptyTitle: string;
  emptyDescription: string;
}

function lockReasonLabel(
  reason: CourseActivityLockReason,
  labels: CourseWorkspaceLabels,
): string {
  if (reason.code !== "required_skill") return labels.lockReasons[reason.code];
  return labels.lockReasons.requiredSkill(
    reason.current_basis_points / 100,
    reason.minimum_basis_points / 100,
  );
}

function activityTone(
  state: CourseActivityState,
): "neutral" | "success" | "warning" {
  if (state === "accepted") return "success";
  if (state === "revision_required") return "warning";
  return "neutral";
}

function canOpenActivity(
  accessMode: LearnerCourseWorkspace["accessMode"],
  activity: CourseActivity,
): boolean {
  if (accessMode !== "active") return false;

  return (
    activity.state === "available"
    || activity.state === "in_progress"
    || activity.state === "submitted"
    || activity.state === "revision_required"
  );
}

export function CourseWorkspace({
  course,
  dashboardHref,
  formatDateTime,
  labels,
  taskHref,
}: {
  course: LearnerCourseWorkspace;
  dashboardHref: Route;
  formatDateTime(value: string): string;
  labels: CourseWorkspaceLabels;
  taskHref(taskId: string): Route;
}) {
  return (
    <div className="stack">
      <Link href={dashboardHref}>{labels.backToDashboard}</Link>
      <header className="page-heading">
        <div>
          <h1>{course.title}</h1>
          {course.summary ? <p className="muted">{course.summary}</p> : null}
        </div>
        <Badge>{labels.progression[course.progressionMode]}</Badge>
      </header>

      {course.accessMode === "history" ? (
        <aside aria-labelledby="course-history-notice" className="panel stack" role="note">
          <h2 id="course-history-notice">{labels.historyTitle}</h2>
          <p>{labels.historyDescription}</p>
        </aside>
      ) : null}

      <section aria-labelledby="course-progress" className="panel">
        <div className="panel__body stack">
          <h2 id="course-progress">{labels.progress}</h2>
          <p>
            {labels.cohort}: <strong>{course.cohortName}</strong>
          </p>
          <progress
            aria-label={labels.progress}
            max={Math.max(1, course.totalActivities)}
            value={course.completedActivities}
          />
          <p className="muted">
            {labels.completed(course.completedActivities, course.totalActivities)}
          </p>
        </div>
      </section>

      {course.stages.length === 0 ? (
        <StatePanel
          description={labels.emptyDescription}
          title={labels.emptyTitle}
        />
      ) : (
        course.stages.map((stage) => (
          <section aria-labelledby={`stage-${stage.id}`} className="stack" key={stage.id}>
            <header>
              <h2 id={`stage-${stage.id}`}>{stage.title}</h2>
              {stage.description ? <p className="muted">{stage.description}</p> : null}
            </header>
            {stage.activities.length === 0 ? (
              <StatePanel
                description={labels.emptyDescription}
                title={labels.emptyTitle}
              />
            ) : (
              <ol className="stack">
                {stage.activities.map((activity) => (
                  <li className="course-row" key={activity.id}>
                    <div className="stack">
                      <div className="cluster">
                        <h3>{activity.title}</h3>
                        <Badge tone={activityTone(activity.state)}>
                          {labels.states[activity.state]}
                        </Badge>
                      </div>
                      {activity.description ? <p>{activity.description}</p> : null}
                      {activity.state === "locked" ? (
                        <div>
                          <p className="muted">{labels.lockedBecause}</p>
                          <ul>
                            {activity.lockReasons.map((reason, index) => (
                              <li key={`${reason.code}-${index}`}>
                                {lockReasonLabel(reason, labels)}
                              </li>
                            ))}
                          </ul>
                        </div>
                      ) : null}
                      <dl className="cluster">
                        {activity.expectedMinutes ? (
                          <div>
                            <dt>{labels.expectedTimeLabel}</dt>
                            <dd>{labels.expectedTime(activity.expectedMinutes)}</dd>
                          </div>
                        ) : null}
                        {activity.availableFrom ? (
                          <div>
                            <dt>{labels.availableFrom}</dt>
                            <dd>{formatDateTime(activity.availableFrom)}</dd>
                          </div>
                        ) : null}
                        {activity.dueAt ? (
                          <div>
                            <dt>{labels.dueAt}</dt>
                            <dd>{formatDateTime(activity.dueAt)}</dd>
                          </div>
                        ) : null}
                      </dl>
                    </div>
                    {canOpenActivity(course.accessMode, activity) ? (
                      <Link className="button button--secondary" href={taskHref(activity.id)}>
                        {labels.openTask}
                      </Link>
                    ) : null}
                  </li>
                ))}
              </ol>
            )}
          </section>
        ))
      )}
    </div>
  );
}
