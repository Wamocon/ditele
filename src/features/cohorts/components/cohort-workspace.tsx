import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Field, Input } from "@/shared/ui/field";
import { StatePanel } from "@/shared/ui/state-panel";

import type { Cohort } from "../model";
import styles from "./cohort-workspace.module.css";

export interface CohortWorkspaceLabels {
  readonly course: string;
  readonly progressionMode: string;
  readonly learners: string;
  readonly trainers: string;
  readonly members: string;
  readonly schedule: string;
  readonly noMembers: string;
  readonly noMembersDescription: string;
  readonly noSchedule: string;
  readonly noScheduleDescription: string;
  readonly taskId: string;
  readonly activateAt: string;
  readonly saveDate: string;
  readonly start: string;
  readonly complete: string;
  readonly states: Readonly<Record<Cohort["state"], string>>;
  readonly modes: Readonly<Record<Cohort["progressionMode"], string>>;
  readonly memberRoles: Readonly<Record<"learner" | "trainer", string>>;
}

export interface CohortWorkspaceProps {
  readonly cohort: Cohort;
  readonly displayName: string;
  readonly labels: CohortWorkspaceLabels;
  readonly formatDateTime: (isoDate: string) => string;
  readonly changeStateAction: (formData: FormData) => void | Promise<void>;
  readonly changeScheduleAction: (formData: FormData) => void | Promise<void>;
}

export function CohortWorkspace({
  cohort,
  displayName,
  labels,
  formatDateTime,
  changeStateAction,
  changeScheduleAction,
}: CohortWorkspaceProps) {
  const activeMembers = cohort.members.filter((member) => member.status === "active");
  const learners = activeMembers.filter((member) => member.role === "learner");
  const trainers = activeMembers.filter((member) => member.role === "trainer");

  return (
    <div className="stack">
      <header className={styles.header}>
        <div>
          <h1>{displayName}</h1>
          <p className="muted">{labels.course}: {cohort.courseId}</p>
        </div>
        <div className="cluster">
          <Badge tone={cohort.state === "active" ? "success" : cohort.state === "waiting" ? "warning" : "neutral"}>
            {labels.states[cohort.state]}
          </Badge>
          {cohort.state === "waiting" ? (
            <form action={changeStateAction}>
              <input name="cohortId" type="hidden" value={cohort.id} />
              <input name="expectedVersion" type="hidden" value={cohort.version} />
              <Button name="toState" type="submit" value="active">{labels.start}</Button>
            </form>
          ) : null}
          {cohort.state === "active" ? (
            <form action={changeStateAction}>
              <input name="cohortId" type="hidden" value={cohort.id} />
              <input name="expectedVersion" type="hidden" value={cohort.version} />
              <Button name="toState" type="submit" value="completed" variant="danger">{labels.complete}</Button>
            </form>
          ) : null}
        </div>
      </header>

      <dl className={styles.facts}>
        <div><dt>{labels.progressionMode}</dt><dd>{labels.modes[cohort.progressionMode]}</dd></div>
        <div><dt>{labels.learners}</dt><dd>{learners.length}</dd></div>
        <div><dt>{labels.trainers}</dt><dd>{trainers.length}</dd></div>
        <div><dt>{labels.schedule}</dt><dd>{cohort.taskActivations.length}</dd></div>
      </dl>

      <div className={styles.columns}>
        <section className="panel" aria-labelledby="cohort-members-title">
          <header className={`panel__header ${styles.sectionHeader}`}>
            <h2 id="cohort-members-title">{labels.members}</h2>
            <strong>{activeMembers.length}</strong>
          </header>
          <div className="panel__body">
            {activeMembers.length === 0 ? (
              <StatePanel title={labels.noMembers} description={labels.noMembersDescription} />
            ) : (
              <ul className={styles.memberList}>
                {activeMembers.map((member) => (
                  <li className={styles.memberRow} key={`${member.role}:${member.userId}`}>
                    <strong>{member.displayName}</strong>
                    <span className="muted">{labels.memberRoles[member.role]}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        <section className="panel" aria-labelledby="cohort-schedule-title">
          <header className="panel__header"><h2 id="cohort-schedule-title">{labels.schedule}</h2></header>
          <div className="panel__body">
            {cohort.taskActivations.length === 0 ? (
              <StatePanel title={labels.noSchedule} description={labels.noScheduleDescription} />
            ) : (
              <ul className={styles.scheduleList}>
                {cohort.taskActivations.map((activation) => (
                  <li key={activation.taskId}>
                    <form action={changeScheduleAction} className={styles.scheduleRow}>
                      <input name="cohortId" type="hidden" value={cohort.id} />
                      <input name="expectedVersion" type="hidden" value={cohort.version} />
                      <input name="taskId" type="hidden" value={activation.taskId} />
                      <div>
                        <strong>{labels.taskId}: {activation.taskId}</strong>
                        <div className="muted">{formatDateTime(activation.activateAt)}</div>
                      </div>
                      <div className="cluster">
                        <Field htmlFor={`activate-${activation.taskId}`} label={labels.activateAt}>
                          <Input
                            defaultValue={activation.activateAt.slice(0, 16)}
                            id={`activate-${activation.taskId}`}
                            name="activateAt"
                            required
                            type="datetime-local"
                          />
                        </Field>
                        <Button type="submit" variant="secondary">{labels.saveDate}</Button>
                      </div>
                    </form>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
