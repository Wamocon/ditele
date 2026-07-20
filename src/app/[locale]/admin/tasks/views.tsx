import Link from "next/link";

import type { Locale } from "@/shared/i18n/config";
import { localizedDynamicRoute } from "@/shared/i18n/routes";
import { Badge } from "@/shared/ui/badge";
import { StatePanel } from "@/shared/ui/state-panel";

import type { AdminTasksCopy } from "./copy";
import type { AdminTaskListItem } from "./model";
import styles from "./task-inventory.module.css";

function stateTone(state: AdminTaskListItem["state"]) {
  if (state === "active") return "success" as const;
  if (state === "archived" || state === "inactive") return "warning" as const;
  return "neutral" as const;
}

export function TaskInventoryView({
  items,
  labels,
  locale,
  page,
  total,
  totalPages,
}: {
  readonly items: readonly AdminTaskListItem[];
  readonly labels: AdminTasksCopy;
  readonly locale: Locale;
  readonly page: number;
  readonly total: number;
  readonly totalPages: number;
}) {
  const formatter = new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  });
  return (
    <section aria-labelledby="admin-task-inventory-title" className="stack">
      <header className={`page-heading ${styles.toolbar}`}>
        <div>
          <h1 id="admin-task-inventory-title">{labels.title}</h1>
          <p>{labels.description}</p>
        </div>
        <strong>{labels.count(total)}</strong>
      </header>

      {items.length === 0 ? (
        <StatePanel description={labels.emptyDescription} title={labels.emptyTitle} />
      ) : (
        <ol className={styles.list}>
          {items.map((task) => (
            <li key={task.id}>
              <article className={`panel ${styles.card}`}>
                <header className={styles.cardHeader}>
                  <div>
                    <p className="muted">{task.courseTitle}</p>
                    <h2>{task.title}</h2>
                  </div>
                  <div className="cluster">
                    {task.usedFallback ? (
                      <Badge tone="warning">{labels.localeFallback(task.resolvedLocale)}</Badge>
                    ) : null}
                    <Badge>{labels.kinds[task.kind]}</Badge>
                    <Badge tone={stateTone(task.state)}>{labels.states[task.state]}</Badge>
                  </div>
                </header>

                <dl className={styles.facts}>
                  <div><dt>{labels.stage}</dt><dd>{task.stageTitle}</dd></div>
                  <div>
                    <dt>{labels.version}</dt>
                    <dd>
                      {task.versionNumber === null
                        ? labels.unversioned
                        : `v${task.versionNumber}${task.versionState ? ` · ${labels.versionStates[task.versionState]}` : ""}`}
                    </dd>
                  </div>
                  <div>
                    <dt>{labels.updated}</dt>
                    <dd><time dateTime={task.updatedAt}>{formatter.format(new Date(task.updatedAt))}</time></dd>
                  </div>
                </dl>

                <div className={styles.signals}>
                  <span>{task.expectedMinutes ? labels.duration(task.expectedMinutes) : labels.durationMissing}</span>
                  <span>{labels.options(task.optionCount)}</span>
                  <span>{labels.hints(task.hintCount)}</span>
                  <span>{task.hasTarget ? labels.targetReady : labels.targetMissing}</span>
                  <span>{task.hasAssessment ? labels.assessmentReady : labels.assessmentMissing}</span>
                  <span>{labels.translations(task.completeLocales.length)}</span>
                </div>

                <Link
                  className={`button button--secondary ${styles.cardAction}`}
                  href={localizedDynamicRoute(locale, `/admin/courses/${task.courseId}`)}
                >
                  {labels.openCourse}
                </Link>
              </article>
            </li>
          ))}
        </ol>
      )}

      <nav aria-label={labels.page(page, totalPages)} className={styles.pagination}>
        {page > 1 ? (
          <Link
            className="button button--secondary"
            href={localizedDynamicRoute(locale, `/admin/tasks?page=${page - 1}`)}
          >
            {labels.previousPage}
          </Link>
        ) : (
          <span aria-disabled="true" className="button button--secondary">{labels.previousPage}</span>
        )}
        <span aria-current="page">{labels.page(page, totalPages)}</span>
        {page < totalPages ? (
          <Link
            className="button button--secondary"
            href={localizedDynamicRoute(locale, `/admin/tasks?page=${page + 1}`)}
          >
            {labels.nextPage}
          </Link>
        ) : (
          <span aria-disabled="true" className="button button--secondary">{labels.nextPage}</span>
        )}
      </nav>

      <StatePanel
        description={labels.readOnlyDescription}
        title={labels.readOnlyTitle}
      />
    </section>
  );
}
