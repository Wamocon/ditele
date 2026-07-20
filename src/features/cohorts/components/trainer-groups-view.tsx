import Link from "next/link";

import type { Locale } from "@/shared/i18n/config";
import { localizedDynamicRoute } from "@/shared/i18n/routes";
import { Badge } from "@/shared/ui/badge";
import { StatePanel } from "@/shared/ui/state-panel";

import type { TrainerGroupListItem } from "../trainer-read-model";
import type { TrainerGroupsCopy } from "../trainer-read-copy";
import styles from "./trainer-read.module.css";

export interface TrainerGroupsViewProps {
  readonly groups: readonly TrainerGroupListItem[];
  readonly labels: TrainerGroupsCopy;
  readonly formatDateTime: (value: string) => string;
  readonly locale: Locale;
}

function cohortTone(
  state: TrainerGroupListItem["state"],
): "neutral" | "success" | "warning" | "danger" {
  if (state === "active") return "success";
  if (state === "waiting") return "warning";
  if (state === "cancelled") return "danger";
  return "neutral";
}

export function TrainerGroupsView({
  groups,
  labels,
  locale,
  formatDateTime,
}: TrainerGroupsViewProps) {
  return (
    <section className="stack" aria-labelledby="trainer-groups-title">
      <header className={styles.heading}>
        <div>
          <h1 id="trainer-groups-title">{labels.title}</h1>
          <p className="muted reading-column">{labels.description}</p>
        </div>
        <Badge>{labels.groupCount(groups.length)}</Badge>
      </header>

      {groups.length === 0 ? (
        <StatePanel
          description={labels.emptyDescription}
          title={labels.emptyTitle}
        />
      ) : (
        <ul className={styles.groupGrid}>
          {groups.map((group) => (
            <li key={group.id}>
              <article className={styles.groupCard}>
                <header className={styles.cardHeader}>
                  <div>
                    <h2>{group.name}</h2>
                    <p className="muted">
                      <span className="sr-only">{labels.course}:</span>{" "}
                      {group.courseTitle}
                    </p>
                  </div>
                  <div className="cluster">
                    <Badge tone={cohortTone(group.state)}>
                      <span className="sr-only">{labels.lifecycle}:</span>{" "}
                      {labels.states[group.state]}
                    </Badge>
                    {group.courseTitleUsesFallback ? (
                      <Badge tone="warning">
                        {labels.localizedFallback(group.courseTitleLocale)}
                      </Badge>
                    ) : null}
                  </div>
                </header>

                <dl className={styles.groupFacts}>
                  <div>
                    <dt>{labels.progressionMode}</dt>
                    <dd>{labels.modes[group.progressionMode]}</dd>
                  </div>
                  <div>
                    <dt>{labels.learners}</dt>
                    <dd>{group.learnerCount}</dd>
                  </div>
                  <div>
                    <dt>{labels.trainers}</dt>
                    <dd>{group.trainerCount}</dd>
                  </div>
                </dl>

                <dl className={styles.scheduleFacts}>
                  <div>
                    <dt>{labels.starts}</dt>
                    <dd>
                      {group.startsAt ? (
                        <time dateTime={group.startsAt}>
                          {formatDateTime(group.startsAt)}
                        </time>
                      ) : (
                        labels.notScheduled
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt>{labels.ends}</dt>
                    <dd>
                      {group.endsAt ? (
                        <time dateTime={group.endsAt}>
                          {formatDateTime(group.endsAt)}
                        </time>
                      ) : (
                        labels.openEnded
                      )}
                    </dd>
                  </div>
                </dl>
                <div>
                  <Link
                    className="button button--secondary"
                    href={localizedDynamicRoute(
                      locale,
                      `/trainer/groups/${group.id}`,
                    )}
                  >
                    {labels.openGroup}
                  </Link>
                </div>
              </article>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
