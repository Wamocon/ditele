"use client";

import { useActionState, useMemo } from "react";
import { useFormStatus } from "react-dom";

import type { Locale } from "@/shared/i18n/config";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Field, Textarea } from "@/shared/ui/field";
import { StatePanel } from "@/shared/ui/state-panel";

import { adminContentCopy } from "../../../copy";
import {
  contentLifecycleInitialState,
  type ContentLifecycleActionState,
} from "../../../lifecycle-validation";
import type {
  AdminVersionSummary,
  ContentArchiveImpactResult,
} from "../../../model";
import styles from "../../../content-studio.module.css";

type LifecycleAction = (
  previousState: ContentLifecycleActionState,
  formData: FormData,
) => Promise<ContentLifecycleActionState>;

type LifecycleNotice =
  | "stale"
  | "submitted"
  | "review_approved"
  | "changes_requested"
  | "published"
  | "archived";

type CommandKeys = {
  readonly submit: string;
  readonly review: string;
  readonly publish: string;
  readonly archive: string;
};

function PendingButton({
  idle,
  pending,
  variant = "primary",
}: {
  readonly idle: string;
  readonly pending: string;
  readonly variant?: "primary" | "danger";
}) {
  const status = useFormStatus();
  return (
    <Button disabled={status.pending} type="submit" variant={variant}>
      {status.pending ? pending : idle}
    </Button>
  );
}

function ActionMessage({ state }: { readonly state: ContentLifecycleActionState }) {
  return state.message ? <p className={styles.lifecycleError} role="alert">{state.message}</p> : null;
}

function CommandFields({
  courseId,
  expectedVersion,
  idempotencyKey,
  locale,
  versionId,
}: {
  readonly courseId: string;
  readonly expectedVersion: number;
  readonly idempotencyKey: string;
  readonly locale: Locale;
  readonly versionId: string;
}) {
  return (
    <>
      <input name="locale" type="hidden" value={locale} />
      <input name="courseId" type="hidden" value={courseId} />
      <input name="contentVersionId" type="hidden" value={versionId} />
      <input name="expectedVersion" type="hidden" value={expectedVersion} />
      <input name="idempotencyKey" type="hidden" value={idempotencyKey} />
    </>
  );
}

export function ContentLifecyclePanel({
  actions,
  canManage,
  canPublish,
  courseId,
  impact,
  keys,
  locale,
  notice,
  version,
}: {
  readonly actions: {
    readonly archive: LifecycleAction;
    readonly publish: LifecycleAction;
    readonly review: LifecycleAction;
    readonly submit: LifecycleAction;
  };
  readonly canManage: boolean;
  readonly canPublish: boolean;
  readonly courseId: string;
  readonly impact: ContentArchiveImpactResult | null;
  readonly keys: CommandKeys;
  readonly locale: Locale;
  readonly notice: LifecycleNotice | null;
  readonly version: AdminVersionSummary;
}) {
  const labels = adminContentCopy[locale].lifecycle;
  const [submitState, submitAction, submitPending] = useActionState(
    actions.submit,
    contentLifecycleInitialState,
  );
  const [reviewState, reviewAction, reviewPending] = useActionState(
    actions.review,
    contentLifecycleInitialState,
  );
  const [publishState, publishAction, publishPending] = useActionState(
    actions.publish,
    contentLifecycleInitialState,
  );
  const [archiveState, archiveAction, archivePending] = useActionState(
    actions.archive,
    contentLifecycleInitialState,
  );
  const dateFormatter = useMemo(
    () => new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }),
    [locale],
  );
  const latestReview = version.latestReview;
  const hasCurrentApproval = latestReview?.decision === "approved" && latestReview.current;
  const common = {
    courseId,
    expectedVersion: version.rowVersion,
    locale,
    versionId: version.id,
  };

  return (
    <div className="stack">
      {notice ? (
        <StatePanel
          description={labels.notices[notice].description}
          title={labels.notices[notice].title}
          tone={notice === "stale" ? "danger" : "neutral"}
        />
      ) : null}

      <section className="panel" aria-labelledby="content-lifecycle-title">
        <header className="panel__header">
          <div>
            <h2 id="content-lifecycle-title">{labels.title}</h2>
            <p className="muted">{labels.description}</p>
          </div>
        </header>
        <div className={`panel__body stack ${styles.lifecyclePanel}`}>
          {version.state === "draft" && canManage ? (
            <form action={submitAction} aria-busy={submitPending} className="stack">
              <CommandFields {...common} idempotencyKey={keys.submit} />
              <div>
                <h3>{labels.submitTitle}</h3>
                <p className="muted">{labels.submitDescription}</p>
              </div>
              <ActionMessage state={submitState} />
              <div><PendingButton idle={labels.submit} pending={labels.submitting} /></div>
            </form>
          ) : null}

          {version.state === "in_review" && canPublish ? (
            <div className="stack">
              {latestReview ? (
                <section className={styles.latestReview} aria-labelledby="latest-content-review-title">
                  <div className="cluster">
                    <h3 id="latest-content-review-title">{labels.latestReviewTitle}</h3>
                    <Badge tone={latestReview.decision === "approved" ? "success" : "warning"}>
                      {labels.decisions[latestReview.decision]}
                    </Badge>
                  </div>
                  <p>{latestReview.comment}</p>
                  <p className="muted">
                    {dateFormatter.format(new Date(latestReview.createdAt))} · {latestReview.current ? labels.currentApproval : labels.previousReview}
                  </p>
                </section>
              ) : null}

              <form action={reviewAction} aria-busy={reviewPending} className="form-grid">
                <CommandFields {...common} idempotencyKey={keys.review} />
                <div>
                  <h3>{labels.reviewTitle}</h3>
                  <p className="muted">{labels.reviewDescription}</p>
                </div>
                <Field
                  error={reviewState.fieldErrors?.decision}
                  htmlFor="content-review-decision"
                  label={labels.decisionLabel}
                >
                  <select
                    aria-describedby={reviewState.fieldErrors?.decision ? "content-review-decision-error" : undefined}
                    aria-invalid={reviewState.fieldErrors?.decision ? "true" : undefined}
                    className="select"
                    defaultValue=""
                    id="content-review-decision"
                    name="decision"
                    required
                  >
                    <option disabled value="">{labels.decisionPlaceholder}</option>
                    <option value="approved">{labels.decisions.approved}</option>
                    <option value="changes_requested">{labels.decisions.changes_requested}</option>
                  </select>
                </Field>
                <Field
                  error={reviewState.fieldErrors?.comment}
                  htmlFor="content-review-comment"
                  label={labels.commentLabel}
                >
                  <Textarea
                    aria-describedby={reviewState.fieldErrors?.comment ? "content-review-comment-error" : undefined}
                    aria-invalid={reviewState.fieldErrors?.comment ? "true" : undefined}
                    id="content-review-comment"
                    maxLength={4_000}
                    name="comment"
                    placeholder={labels.commentPlaceholder}
                    required
                  />
                </Field>
                <ActionMessage state={reviewState} />
                <div><PendingButton idle={labels.saveReview} pending={labels.savingReview} /></div>
              </form>

              {hasCurrentApproval ? (
                <form action={publishAction} aria-busy={publishPending} className={`stack ${styles.publishPanel}`}>
                  <CommandFields {...common} idempotencyKey={keys.publish} />
                  <div>
                    <h3>{labels.publishTitle}</h3>
                    <p className="muted">{labels.publishDescription}</p>
                  </div>
                  <ActionMessage state={publishState} />
                  <div><PendingButton idle={labels.publish} pending={labels.publishing} /></div>
                </form>
              ) : (
                <StatePanel
                  description={labels.awaitingApprovalDescription}
                  title={labels.awaitingApprovalTitle}
                />
              )}
            </div>
          ) : null}

          {version.state === "published" && canPublish && impact?.status === "ready" ? (
            <form action={archiveAction} aria-busy={archivePending} className="form-grid">
              <CommandFields {...common} idempotencyKey={keys.archive} />
              <input name="impactFingerprint" type="hidden" value={impact.impact.fingerprint} />
              <div>
                <h3>{labels.archiveTitle}</h3>
                <p className={styles.archiveWarning}>{labels.archiveWarning}</p>
              </div>
              <section aria-labelledby="archive-impact-title" className={styles.impactPanel}>
                <h4 id="archive-impact-title">{labels.impactTitle}</h4>
                <dl className={styles.impactMetrics}>
                  <div><dt>{labels.impactTasks}</dt><dd>{impact.impact.task_count}</dd></div>
                  <div><dt>{labels.impactSchedules}</dt><dd>{impact.impact.task_schedule_count}</dd></div>
                  <div><dt>{labels.impactAttempts}</dt><dd>{impact.impact.attempt_count}</dd></div>
                  <div><dt>{labels.impactOpenAttempts}</dt><dd>{impact.impact.open_attempt_count}</dd></div>
                  <div><dt>{labels.impactSubmissions}</dt><dd>{impact.impact.submission_count}</dd></div>
                </dl>
                <p className="muted">{labels.impactFingerprint}</p>
                <code className={styles.fingerprint}>{impact.impact.fingerprint}</code>
              </section>
              <Field
                error={archiveState.fieldErrors?.reason}
                htmlFor="content-archive-reason"
                label={labels.archiveReasonLabel}
              >
                <Textarea
                  aria-describedby={archiveState.fieldErrors?.reason ? "content-archive-reason-error" : undefined}
                  aria-invalid={archiveState.fieldErrors?.reason ? "true" : undefined}
                  id="content-archive-reason"
                  maxLength={2_000}
                  name="reason"
                  placeholder={labels.archiveReasonPlaceholder}
                  required
                />
              </Field>
              <div className="field" data-invalid={archiveState.fieldErrors?.confirmImpact ? "true" : undefined}>
                <label className={styles.confirmation} htmlFor="content-archive-confirmation">
                  <input
                    aria-describedby={archiveState.fieldErrors?.confirmImpact ? "content-archive-confirmation-error" : undefined}
                    aria-invalid={archiveState.fieldErrors?.confirmImpact ? "true" : undefined}
                    id="content-archive-confirmation"
                    name="confirmImpact"
                    required
                    type="checkbox"
                    value="confirmed"
                  />
                  <span>{labels.confirmImpact}</span>
                </label>
                {archiveState.fieldErrors?.confirmImpact ? (
                  <p className="field__error" id="content-archive-confirmation-error" role="alert">
                    {archiveState.fieldErrors.confirmImpact}
                  </p>
                ) : null}
              </div>
              <ActionMessage state={archiveState} />
              <div><PendingButton idle={labels.archive} pending={labels.archiving} variant="danger" /></div>
            </form>
          ) : null}

          {version.state === "published" && canPublish && impact?.status !== "ready" ? (
            <StatePanel
              description={labels.impactUnavailableDescription}
              title={labels.impactUnavailableTitle}
              tone={impact?.status === "forbidden" ? "danger" : "neutral"}
            />
          ) : null}

          {version.state === "archived" ? (
            <StatePanel description={labels.archivedDescription} title={labels.archivedTitle} />
          ) : null}

          {(
            (version.state === "draft" && !canManage)
            || (version.state === "in_review" && !canPublish)
            || (version.state === "published" && !canPublish)
          ) ? (
            <StatePanel description={labels.permissionDescription} title={labels.permissionTitle} />
          ) : null}
        </div>
      </section>
    </div>
  );
}

export type { LifecycleNotice };
