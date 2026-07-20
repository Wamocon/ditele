import type { Route } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

import { Badge } from "@/shared/ui/badge";
import { StatePanel } from "@/shared/ui/state-panel";
import type { Locale } from "@/shared/i18n/config";
import { localizedDynamicRoute, localizedRoute } from "@/shared/i18n/routes";

import type { AdminContentCopy } from "./copy";
import type {
  AdminCourseDetail,
  AdminCourseListItem,
  ContentVersionProjection,
  ContentVersionState,
  PreviewRole,
  RecordState,
} from "./model";
import styles from "./content-studio.module.css";

function courseTone(state: RecordState): "neutral" | "success" | "warning" {
  if (state === "active") return "success";
  if (state === "draft") return "warning";
  return "neutral";
}

function versionTone(state: ContentVersionState): "neutral" | "success" | "warning" {
  if (state === "published") return "success";
  if (state === "in_review") return "warning";
  return "neutral";
}

function formattedDate(locale: Locale, value: string): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function LocaleFallbackBadge({
  labels,
  resolvedLocale,
  usedFallback,
}: {
  readonly labels: AdminContentCopy;
  readonly resolvedLocale: Locale;
  readonly usedFallback: boolean;
}) {
  return usedFallback ? <Badge tone="warning">{labels.localeFallback(resolvedLocale)}</Badge> : null;
}

function NoticePanel({
  description,
  id,
  title,
}: {
  readonly description: string;
  readonly id: string;
  readonly title: string;
}) {
  return (
    <section className="state-panel" aria-labelledby={id}>
      <h2 id={id}>{title}</h2>
      <p className="muted">{description}</p>
    </section>
  );
}

export function ContentPermissionDenied({ labels }: { readonly labels: AdminContentCopy }) {
  return <StatePanel description={labels.forbiddenDescription} title={labels.forbiddenTitle} tone="danger" />;
}

export function CourseListView({
  courses,
  labels,
  locale,
  page,
  total,
  totalPages,
}: {
  readonly courses: readonly AdminCourseListItem[];
  readonly labels: AdminContentCopy;
  readonly locale: Locale;
  readonly page: number;
  readonly total: number;
  readonly totalPages: number;
}) {
  return (
    <section className="stack" aria-labelledby="content-studio-title">
      <header className={styles.heading}>
        <div>
          <h1 id="content-studio-title">{labels.title}</h1>
          <p className="muted">{labels.description}</p>
        </div>
        <Badge>{labels.courseCount(total)}</Badge>
      </header>

      <NoticePanel
        description={labels.mutationUnavailableDescription}
        id="course-list-mutations-unavailable"
        title={labels.mutationUnavailableTitle}
      />

      {courses.length === 0 ? (
        <StatePanel description={labels.emptyDescription} title={labels.emptyTitle} />
      ) : (
        <ul className={styles.courseList}>
          {courses.map((course) => (
            <li className={styles.courseCard} key={course.id}>
              <header className={styles.courseHeader}>
                <div>
                  <h2>{course.title}</h2>
                  <p className="muted">{course.slug}</p>
                </div>
                <div className="cluster">
                  <Badge tone={courseTone(course.state)}>{labels.courseStates[course.state]}</Badge>
                  <LocaleFallbackBadge labels={labels} resolvedLocale={course.resolvedLocale} usedFallback={course.usedFallback} />
                </div>
              </header>
              <p>{course.summary || labels.noSummary}</p>
              <dl className={styles.metrics}>
                <div>
                  <dt>{labels.contentVersions}</dt>
                  <dd className="cluster">
                    {labels.versions(course.versionCount)}
                    {course.latestVersion ? <Badge tone={versionTone(course.latestVersion.state)}>{labels.versionStates[course.latestVersion.state]}</Badge> : null}
                  </dd>
                </div>
                <div><dt>{labels.contentTree}</dt><dd>{labels.stages(course.stageCount)} · {labels.tasks(course.taskCount)}</dd></div>
                <div><dt>{labels.estimatedDuration}</dt><dd>{course.estimatedMinutes ? labels.minutes(course.estimatedMinutes) : "—"}</dd></div>
              </dl>
              <div className="cluster" aria-label={labels.translations}>
                {(["en", "de", "ru"] as const).map((itemLocale) => (
                  <Badge key={itemLocale} tone={course.completeLocales.includes(itemLocale) ? "success" : "warning"}>
                    {itemLocale.toUpperCase()} · {course.completeLocales.includes(itemLocale) ? labels.complete : labels.incomplete}
                  </Badge>
                ))}
              </div>
              <p className="muted">{labels.updated}: {formattedDate(locale, course.updatedAt)}</p>
              <div className={styles.cardAction}>
                <Link className="button button--secondary" href={localizedDynamicRoute(locale, `/admin/courses/${course.id}`)}>
                  {labels.openCourse}
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}
      {totalPages > 1 ? (
        <nav className="cluster" aria-label={labels.page(page, totalPages)}>
          {page > 1 ? (
            <Link className="button button--secondary" href={localizedDynamicRoute(locale, `/admin/courses?page=${page - 1}`)}>{labels.previousPage}</Link>
          ) : <span aria-disabled="true" className="button button--secondary">{labels.previousPage}</span>}
          <span aria-current="page">{labels.page(page, totalPages)}</span>
          {page < totalPages ? (
            <Link className="button button--secondary" href={localizedDynamicRoute(locale, `/admin/courses?page=${page + 1}`)}>{labels.nextPage}</Link>
          ) : <span aria-disabled="true" className="button button--secondary">{labels.nextPage}</span>}
        </nav>
      ) : null}
    </section>
  );
}

export function CourseDetailView({
  course,
  labels,
  locale,
}: {
  readonly course: AdminCourseDetail;
  readonly labels: AdminContentCopy;
  readonly locale: Locale;
}) {
  return (
    <section className="stack" aria-labelledby="course-detail-title">
      <Link href={localizedRoute(locale, "/admin/courses")}>← {labels.backToCourses}</Link>
      <header className={styles.heading}>
        <div>
          <div className="cluster">
            <Badge tone={courseTone(course.state)}>{labels.courseStates[course.state]}</Badge>
            <LocaleFallbackBadge labels={labels} resolvedLocale={course.resolvedLocale} usedFallback={course.usedFallback} />
          </div>
          <h1 id="course-detail-title">{course.title}</h1>
          <p>{course.summary || labels.noSummary}</p>
        </div>
      </header>

      <div className="workspace-grid">
        <div className="stack">
          <section className="panel" aria-labelledby="course-metadata-title">
            <header className="panel__header"><h2 id="course-metadata-title">{labels.courseDetails}</h2></header>
            <div className="panel__body stack">
              <p>{course.description || labels.noSummary}</p>
              <dl className={styles.metadata}>
                <div><dt>{labels.estimatedDuration}</dt><dd>{course.estimatedMinutes ? labels.minutes(course.estimatedMinutes) : "—"}</dd></div>
                <div><dt>{labels.contentTree}</dt><dd>{labels.stages(course.stageCount)} · {labels.tasks(course.taskCount)}</dd></div>
                <div><dt>{labels.updated}</dt><dd>{formattedDate(locale, course.updatedAt)}</dd></div>
              </dl>
            </div>
          </section>

          <section className="panel" aria-labelledby="course-locales-title">
            <header className="panel__header"><h2 id="course-locales-title">{labels.translations}</h2></header>
            <div className={`panel__body ${styles.localeGrid}`}>
              {course.localizations.map((localization) => (
                <article className={styles.localeCard} key={localization.locale} lang={localization.locale}>
                  <header className={styles.localeHeader}>
                    <strong>{labels.localeNames[localization.locale]}</strong>
                    <Badge tone={localization.complete ? "success" : "warning"}>
                      {localization.complete ? labels.complete : labels.incomplete}
                    </Badge>
                  </header>
                  <h3>{localization.title || "—"}</h3>
                  <p>{localization.summary || labels.noSummary}</p>
                </article>
              ))}
            </div>
          </section>

          <section className="panel" aria-labelledby="course-versions-title">
            <header className="panel__header"><h2 id="course-versions-title">{labels.contentVersions}</h2></header>
            <div className="panel__body">
              {course.versions.length === 0 ? (
                <StatePanel description={labels.noVersionsDescription} title={labels.noVersionsTitle} />
              ) : (
                <ol className={styles.versionList}>
                  {course.versions.map((version) => (
                    <li className={styles.versionCard} key={version.id}>
                      <header className={styles.versionHeader}>
                        <div>
                          <h3>{labels.versionTitle(version.versionNumber)}</h3>
                          <p>{version.changeSummary || labels.noChangeSummary}</p>
                        </div>
                        <Badge tone={versionTone(version.state)}>{labels.versionStates[version.state]}</Badge>
                      </header>
                      <p className="muted">{labels.updated}: {formattedDate(locale, version.updatedAt)}</p>
                      <Link className="button button--secondary" href={localizedDynamicRoute(locale, `/admin/courses/${course.id}/versions/${version.id}`)}>
                        {labels.openVersion}
                      </Link>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </section>
        </div>

        <aside className="workspace-rail stack">
          <NoticePanel description={labels.mutationUnavailableDescription} id="course-detail-mutations-unavailable" title={labels.mutationUnavailableTitle} />
          <dl className={`panel panel__body ${styles.metadata}`}>
            <div><dt>{labels.rowVersion}</dt><dd>{course.rowVersion}</dd></div>
            <div><dt>{labels.versions(course.versions.length)}</dt><dd>{course.versions.length}</dd></div>
            <div><dt>{labels.media}</dt><dd>{course.mediaCount}</dd></div>
          </dl>
        </aside>
      </div>
    </section>
  );
}

function PreviewRoleLinks({
  courseId,
  labels,
  locale,
  selectedRole,
  versionId,
}: {
  readonly courseId: string;
  readonly labels: AdminContentCopy;
  readonly locale: Locale;
  readonly selectedRole?: PreviewRole;
  readonly versionId: string;
}) {
  return (
    <nav className="cluster" aria-label={labels.previewAs}>
      {(["learner", "trainer", "admin"] as const).map((role) => (
        <Link
          aria-current={selectedRole === role ? "page" : undefined}
          className="button button--secondary"
          href={localizedDynamicRoute(locale, `/admin/courses/${courseId}/versions/${versionId}/preview?role=${role}`)}
          key={role}
        >
          {labels.previewRole[role]}
        </Link>
      ))}
    </nav>
  );
}

export function ContentVersionDetailView({
  labels,
  lifecyclePanel,
  locale,
  projection,
}: {
  readonly labels: AdminContentCopy;
  readonly lifecyclePanel?: ReactNode;
  readonly locale: Locale;
  readonly projection: ContentVersionProjection;
}) {
  return (
    <section className="stack" aria-labelledby="version-detail-title">
      <Link href={localizedDynamicRoute(locale, `/admin/courses/${projection.courseId}`)}>← {labels.courseDetails}</Link>
      <header className={styles.heading}>
        <div>
          <div className="cluster">
            <Badge tone={versionTone(projection.version.state)}>{labels.versionStates[projection.version.state]}</Badge>
            <LocaleFallbackBadge labels={labels} resolvedLocale={projection.resolvedLocale} usedFallback={projection.usedFallback} />
          </div>
          <h1 id="version-detail-title">{projection.courseTitle} · {labels.versionTitle(projection.version.versionNumber)}</h1>
          <p>{projection.version.changeSummary || labels.noChangeSummary}</p>
        </div>
      </header>

      <div className="workspace-grid">
        <div className="stack">
          {lifecyclePanel}
          <section className="panel" aria-labelledby="version-content-title">
            <header className="panel__header"><h2 id="version-content-title">{labels.contentTree}</h2></header>
            <div className="panel__body">
              {projection.stages.length === 0 ? (
                <StatePanel description={labels.noStagesDescription} title={labels.noStagesTitle} />
              ) : (
                <ol className={styles.stageList}>
                  {projection.stages.map((stage) => (
                    <li className={styles.stageCard} key={stage.id}>
                      <header>
                        <p className="muted">{labels.stages(stage.position + 1)}</p>
                        <h3>{stage.title}</h3>
                        <p>{stage.description}</p>
                      </header>
                      {stage.tasks.length === 0 ? (
                        <p>{labels.noTasks}</p>
                      ) : (
                        <ol className={styles.taskList}>
                          {stage.tasks.map((task) => (
                            <li className={styles.taskCard} key={task.id}>
                              <header className={styles.taskHeader}>
                                <div className={styles.taskTitle}><span className={styles.taskNumber}>{task.position + 1}</span><strong>{task.title}</strong></div>
                                <Badge>{labels.taskKinds[task.kind]}</Badge>
                              </header>
                              <p>{task.instructions}</p>
                              <p className="muted">{labels.assessmentOptions(task.assessmentOptions.length)}</p>
                            </li>
                          ))}
                        </ol>
                      )}
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </section>
        </div>

        <aside className="workspace-rail stack">
          <section className="panel" aria-labelledby="version-metadata-title">
            <header className="panel__header"><h2 id="version-metadata-title">{labels.versionDetails}</h2></header>
            <dl className={`panel__body ${styles.metadata}`}>
              <div><dt>{labels.rowVersion}</dt><dd>{projection.version.rowVersion}</dd></div>
              <div><dt>{labels.publishedAt}</dt><dd>{projection.version.publishedAt ? formattedDate(locale, projection.version.publishedAt) : labels.notPublished}</dd></div>
              <div><dt>{labels.reviews}</dt><dd>{projection.version.reviewCount}</dd></div>
            </dl>
          </section>
          <section className="panel" aria-labelledby="version-readiness-title">
            <header className="panel__header"><h2 id="version-readiness-title">{labels.validation}</h2></header>
            <div className="panel__body stack">
              <strong>{projection.issues.length === 0 ? labels.validationPassed : labels.validationFailed(projection.issues.length)}</strong>
              {projection.issues.length > 0 ? (
                <ul className={styles.issueList}>
                  {projection.issues.map((item) => <li key={`${item.code}:${item.path}`}>{labels.readinessIssues[item.code]}<code>{item.path}</code></li>)}
                </ul>
              ) : null}
            </div>
          </section>
          <section className="panel" aria-labelledby="version-preview-title">
            <header className="panel__header"><h2 id="version-preview-title">{labels.preview}</h2></header>
            <div className="panel__body stack">
              <PreviewRoleLinks courseId={projection.courseId} labels={labels} locale={locale} versionId={projection.version.id} />
              <p className="muted">{labels.previewNotice}</p>
            </div>
          </section>
          <NoticePanel description={labels.mutationUnavailableDescription} id="version-detail-mutations-unavailable" title={labels.mutationUnavailableTitle} />
        </aside>
      </div>
    </section>
  );
}

export function ContentVersionPreviewView({
  labels,
  locale,
  projection,
}: {
  readonly labels: AdminContentCopy;
  readonly locale: Locale;
  readonly projection: ContentVersionProjection;
}) {
  const versionHref = localizedDynamicRoute(locale, `/admin/courses/${projection.courseId}/versions/${projection.version.id}`);
  return (
    <section className="stack" aria-labelledby="content-preview-title">
      <div className={styles.previewToolbar}>
        <Link href={versionHref}>← {labels.previewBack}</Link>
        <PreviewRoleLinks
          courseId={projection.courseId}
          labels={labels}
          locale={locale}
          selectedRole={projection.role}
          versionId={projection.version.id}
        />
      </div>
      <div className="cluster">
        <Badge>{labels.previewRole[projection.role]}</Badge>
        <Badge tone={versionTone(projection.version.state)}>{labels.versionStates[projection.version.state]}</Badge>
        <LocaleFallbackBadge labels={labels} resolvedLocale={projection.resolvedLocale} usedFallback={projection.usedFallback} />
      </div>
      <StatePanel
        description={`${labels.previewImmutableNotice} ${labels.previewNotice}`}
        title={labels.previewProjectionTitle}
      />
      <article className={styles.previewSurface}>
        <header>
          <p className="muted">{labels.versionTitle(projection.version.versionNumber)}</p>
          <h1 id="content-preview-title">{projection.courseTitle}</h1>
          <p>{projection.courseDescription}</p>
        </header>
        {projection.stages.length === 0 ? (
          <StatePanel description={labels.noStagesDescription} title={labels.noStagesTitle} />
        ) : (
          <ol className={styles.stageList}>
            {projection.stages.map((stage) => (
              <li className={styles.stageCard} key={stage.id}>
                <header>
                  <p className="muted">{labels.stages(stage.position + 1)}</p>
                  <h2>{stage.title}</h2>
                  <p>{stage.description}</p>
                </header>
                {stage.tasks.length === 0 ? <p>{labels.noTasks}</p> : (
                  <ol className={styles.taskList}>
                    {stage.tasks.map((task) => (
                      <li className={styles.taskCard} key={task.id}>
                        <header className={styles.taskHeader}>
                          <div className={styles.taskTitle}><span className={styles.taskNumber}>{task.position + 1}</span><h3>{task.title}</h3></div>
                          <Badge>{labels.taskKinds[task.kind]}</Badge>
                        </header>
                        <p>{task.instructions}</p>
                        {task.assessmentQuestion ? <p><strong>{labels.assessmentQuestion}:</strong> {task.assessmentQuestion}</p> : null}
                        <div className="cluster">
                          {task.expectedMinutes ? <span>{labels.estimatedDuration}: {labels.minutes(task.expectedMinutes)}</span> : null}
                          <span>{task.hasHint ? labels.previewHintAvailable : labels.previewHintUnavailable}</span>
                        </div>
                        {task.assessmentOptions.length > 0 ? (
                          <div className="stack">
                            <strong>{labels.assessmentOptions(task.assessmentOptions.length)}</strong>
                            <ul className={styles.optionList}>{task.assessmentOptions.map((option, index) => <li key={`${task.id}:${index}`}>{option}</li>)}</ul>
                          </div>
                        ) : null}
                        {task.targetUrl ? (
                          <a className="button button--secondary" href={task.targetUrl} rel="noreferrer" target="_blank">{labels.previewTarget}</a>
                        ) : <p className="muted">{labels.previewNoTarget}</p>}
                      </li>
                    ))}
                  </ol>
                )}
              </li>
            ))}
          </ol>
        )}
      </article>
    </section>
  );
}

export function previewHref(
  locale: Locale,
  courseId: string,
  versionId: string,
  role: PreviewRole,
): Route {
  return localizedDynamicRoute(locale, `/admin/courses/${courseId}/versions/${versionId}/preview?role=${role}`);
}
