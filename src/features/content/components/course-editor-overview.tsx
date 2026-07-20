import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { StatePanel } from "@/shared/ui/state-panel";

import type {
  ContentLocale,
  ContentValidationIssue,
  CourseContentVersion,
} from "../model";
import styles from "./content-editor.module.css";

export interface CourseEditorLabels {
  readonly title: string;
  readonly version: (version: number) => string;
  readonly locales: string;
  readonly complete: string;
  readonly incomplete: string;
  readonly stages: string;
  readonly tasks: (count: number) => string;
  readonly checklist: string;
  readonly checklistPassed: string;
  readonly checklistFailed: (count: number) => string;
  readonly submitForReview: string;
  readonly publish: string;
  readonly preview: string;
  readonly states: Readonly<Record<CourseContentVersion["state"], string>>;
  readonly localeNames: Readonly<Record<ContentLocale, string>>;
}

export interface CourseEditorOverviewProps {
  readonly content: CourseContentVersion;
  readonly issues: readonly ContentValidationIssue[];
  readonly labels: CourseEditorLabels;
  readonly previewHref: string;
  readonly submitForReviewAction: (formData: FormData) => void | Promise<void>;
  readonly publishAction: (formData: FormData) => void | Promise<void>;
}

function localeComplete(
  content: CourseContentVersion,
  locale: ContentLocale,
  issues: readonly ContentValidationIssue[],
): boolean {
  return content.metadata.name[locale].trim().length > 0
    && content.metadata.description[locale].trim().length > 0
    && !issues.some((issue) => issue.locale === locale);
}

export function CourseEditorOverview({
  content,
  issues,
  labels,
  previewHref,
  submitForReviewAction,
  publishAction,
}: CourseEditorOverviewProps) {
  const taskCount = content.stages.reduce((count, stage) => count + stage.tasks.length, 0);
  return (
    <div className="stack">
      <header className={styles.header}>
        <div>
          <h1>{labels.title}</h1>
          <p className="muted">{labels.version(content.versionNumber)}</p>
        </div>
        <div className="cluster">
          <Badge tone={content.state === "published" ? "success" : content.state === "in_review" ? "warning" : "neutral"}>
            {labels.states[content.state]}
          </Badge>
          <a className="button button--secondary" href={previewHref}>{labels.preview}</a>
        </div>
      </header>

      <div className={styles.layout}>
        <div className="stack">
          <section className="panel" aria-labelledby="content-locales-title">
            <header className="panel__header"><h2 id="content-locales-title">{labels.locales}</h2></header>
            <div className={`panel__body ${styles.localeGrid}`}>
              {(["en", "de", "ru"] as const).map((locale) => {
                const complete = localeComplete(content, locale, issues);
                return (
                  <article className={styles.localeCard} key={locale}>
                    <div className={styles.localeRow}>
                      <strong>{labels.localeNames[locale]}</strong>
                      <Badge tone={complete ? "success" : "warning"}>
                        {complete ? labels.complete : labels.incomplete}
                      </Badge>
                    </div>
                    <p>{content.metadata.name[locale]}</p>
                    <p className="muted">{content.metadata.description[locale]}</p>
                  </article>
                );
              })}
            </div>
          </section>

          <section className="panel" aria-labelledby="content-stages-title">
            <header className={`panel__header ${styles.stageHeader}`}>
              <h2 id="content-stages-title">{labels.stages}</h2>
              <strong>{labels.tasks(taskCount)}</strong>
            </header>
            <div className="panel__body stack">
              {content.stages.map((stage) => (
                <article className={styles.stage} key={stage.id}>
                  <div className={styles.stageHeader}>
                    <strong>{stage.position}. {stage.title.en || stage.title.de || stage.title.ru}</strong>
                    <span className="muted">{labels.tasks(stage.tasks.length)}</span>
                  </div>
                  <ol>
                    {stage.tasks.map((task) => (
                      <li key={task.id}>{task.title.en || task.title.de || task.title.ru}</li>
                    ))}
                  </ol>
                </article>
              ))}
            </div>
          </section>
        </div>

        <aside className="panel">
          <header className="panel__header"><h2>{labels.checklist}</h2></header>
          <div className="panel__body">
            {issues.length === 0 ? (
              <StatePanel title={labels.checklistPassed} description={labels.checklistPassed} />
            ) : (
              <div className="stack">
                <strong>{labels.checklistFailed(issues.length)}</strong>
                <ul className={styles.checklist}>
                  {issues.map((issue) => (
                    <li className={styles.checkRow} key={`${issue.code}:${issue.path}`}>
                      <span>{issue.message}</span>
                      <code>{issue.path}</code>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
          <footer className="panel__footer cluster">
            {content.state === "draft" ? (
              <form action={submitForReviewAction}>
                <input name="contentVersionId" type="hidden" value={content.id} />
                <input name="expectedRevision" type="hidden" value={content.revision} />
                <Button disabled={issues.length > 0} type="submit">{labels.submitForReview}</Button>
              </form>
            ) : null}
            {content.state === "in_review" ? (
              <form action={publishAction}>
                <input name="contentVersionId" type="hidden" value={content.id} />
                <input name="expectedRevision" type="hidden" value={content.revision} />
                <Button disabled={issues.length > 0} type="submit">{labels.publish}</Button>
              </form>
            ) : null}
          </footer>
        </aside>
      </div>
    </div>
  );
}
