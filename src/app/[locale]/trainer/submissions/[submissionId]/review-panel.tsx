"use client";

import { useActionState, useMemo } from "react";

import { ReviewWorkbench } from "@/features/review/components/review-workbench";
import type { ReviewSubmission } from "@/features/review/model";
import type { Locale } from "@/shared/i18n/config";
import { StatePanel } from "@/shared/ui/state-panel";

import {
  decideSubmissionAction,
  transferSubmissionAction,
  type ReviewActionState,
} from "./actions";
import { reviewDetailCopy } from "./copy";
import styles from "./review-panel.module.css";

const INITIAL_ACTION_STATE: ReviewActionState = { status: "idle", message: "" };
export function ReviewPanel({
  availableTrainers,
  locale,
  submission,
  transferIdempotencyKey,
}: {
  readonly availableTrainers: readonly { readonly id: string; readonly name: string }[];
  readonly locale: Locale;
  readonly submission: ReviewSubmission;
  readonly transferIdempotencyKey: string;
}) {
  const decisionServerAction = useMemo(
    () => decideSubmissionAction.bind(null, locale),
    [locale],
  );
  const transferServerAction = useMemo(
    () => transferSubmissionAction.bind(null, locale),
    [locale],
  );
  const [decisionState, decisionAction, decisionPending] = useActionState(
    decisionServerAction,
    INITIAL_ACTION_STATE,
  );
  const [transferState, transferAction, transferPending] = useActionState(
    transferServerAction,
    INITIAL_ACTION_STATE,
  );
  const dateFormatter = useMemo(
    () => new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }),
    [locale],
  );
  const minuteFormatter = useMemo(
    () => new Intl.NumberFormat(locale, { style: "unit", unit: "minute", unitDisplay: "long" }),
    [locale],
  );
  const labels = reviewDetailCopy[locale];
  const pending = decisionPending || transferPending;
  const actionStates = [decisionState, transferState].filter(
    (actionState, index, values) =>
      actionState.status !== "idle" &&
      values.findIndex((candidate) => candidate.message === actionState.message) === index,
  );

  return (
    <div aria-busy={pending} className={`stack ${styles.reviewPanel}`}>
      {pending ? <p aria-live="polite" className="muted">{labels.saving}</p> : null}
      {actionStates.map((actionState) => (
        <div className="panel panel__body" key={actionState.message} role="alert">
          <p>{actionState.message}</p>
        </div>
      ))}
      <ReviewWorkbench
        availableTrainers={availableTrainers}
        decisionAction={decisionAction}
        formatDateTime={(value) => dateFormatter.format(new Date(value))}
        formatDuration={(seconds) => minuteFormatter.format(Math.max(1, Math.round(seconds / 60)))}
        labels={labels.workbench}
        submission={submission}
        transferAction={transferAction}
        transferIdempotencyKey={transferIdempotencyKey}
      />
      {availableTrainers.length === 0 ? (
        <StatePanel
          description={labels.noTransferTargetsDescription}
          title={labels.noTransferTargetsTitle}
        />
      ) : null}
    </div>
  );
}
