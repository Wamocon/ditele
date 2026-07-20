"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { Button } from "@/shared/ui/button";
import { Field, Input, Textarea } from "@/shared/ui/field";
import type { Locale } from "@/shared/i18n/config";

import type { CohortManagementCopy } from "../cohort-management-copy";
import type {
  CohortManagementPerspective,
  CohortScheduleItem,
} from "../cohort-management-model";
import {
  cohortCommandInitialState,
  localDateTimeValue,
  type CohortCommandActionState,
} from "../cohort-management-validation";
import styles from "./cohort-management.module.css";

export type CohortServerAction = (
  previousState: CohortCommandActionState,
  formData: FormData,
) => Promise<CohortCommandActionState>;

export type CohortTransitionFormLabels = Pick<
  CohortManagementCopy,
  | "startTitle"
  | "startDescription"
  | "start"
  | "starting"
  | "completeTitle"
  | "completeDescription"
  | "complete"
  | "completing"
  | "cancelTitle"
  | "cancelDescription"
  | "cancel"
  | "cancelling"
  | "reason"
  | "reasonPlaceholder"
>;

export type TaskScheduleFormLabels = Pick<
  CohortManagementCopy,
  | "availableFrom"
  | "dueAt"
  | "utcNote"
  | "reason"
  | "reasonPlaceholder"
  | "saveSchedule"
  | "savingSchedule"
>;

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

function ActionMessage({ state }: { readonly state: CohortCommandActionState }) {
  return state.message ? (
    <p className={styles.actionMessage} role="alert">
      {state.message}
    </p>
  ) : null;
}

export function CohortTransitionForm({
  action,
  cohortId,
  expectedVersion,
  idempotencyKey,
  labels,
  locale,
  perspective,
  targetState,
}: {
  readonly action: CohortServerAction;
  readonly cohortId: string;
  readonly expectedVersion: number;
  readonly idempotencyKey: string;
  readonly labels: CohortTransitionFormLabels;
  readonly locale: Locale;
  readonly perspective: CohortManagementPerspective;
  readonly targetState: "active" | "completed" | "cancelled";
}) {
  const [state, formAction] = useActionState(
    action,
    cohortCommandInitialState,
  );
  const copy =
    targetState === "active"
      ? {
          title: labels.startTitle,
          description: labels.startDescription,
          idle: labels.start,
          pending: labels.starting,
        }
      : targetState === "completed"
        ? {
            title: labels.completeTitle,
            description: labels.completeDescription,
            idle: labels.complete,
            pending: labels.completing,
          }
        : {
            title: labels.cancelTitle,
            description: labels.cancelDescription,
            idle: labels.cancel,
            pending: labels.cancelling,
          };
  const reasonId = `cohort-${cohortId}-${targetState}-reason`;

  return (
    <form action={formAction} className={`panel ${styles.commandForm}`}>
      <div>
        <h3>{copy.title}</h3>
        <p className="muted">{copy.description}</p>
      </div>
      <input name="cohortId" type="hidden" value={cohortId} />
      <input name="expectedVersion" type="hidden" value={expectedVersion} />
      <input name="targetState" type="hidden" value={targetState} />
      <input name="idempotencyKey" type="hidden" value={idempotencyKey} />
      <input name="locale" type="hidden" value={locale} />
      <input name="perspective" type="hidden" value={perspective} />
      <Field
        error={state.fieldErrors?.reason}
        htmlFor={reasonId}
        label={labels.reason}
      >
        <Textarea
          aria-describedby={state.fieldErrors?.reason ? `${reasonId}-error` : undefined}
          aria-invalid={state.fieldErrors?.reason ? "true" : undefined}
          id={reasonId}
          maxLength={1_000}
          minLength={3}
          name="reason"
          placeholder={labels.reasonPlaceholder}
          required
        />
      </Field>
      <ActionMessage state={state} />
      <div>
        <PendingButton
          idle={copy.idle}
          pending={copy.pending}
          variant={targetState === "cancelled" ? "danger" : "primary"}
        />
      </div>
    </form>
  );
}

export function TaskScheduleForm({
  action,
  cohortId,
  idempotencyKey,
  labels,
  locale,
  perspective,
  schedule,
}: {
  readonly action: CohortServerAction;
  readonly cohortId: string;
  readonly idempotencyKey: string;
  readonly labels: TaskScheduleFormLabels;
  readonly locale: Locale;
  readonly perspective: CohortManagementPerspective;
  readonly schedule: CohortScheduleItem;
}) {
  const [state, formAction] = useActionState(
    action,
    cohortCommandInitialState,
  );
  const availableId = `schedule-${schedule.taskId}-available`;
  const dueId = `schedule-${schedule.taskId}-due`;
  const reasonId = `schedule-${schedule.taskId}-reason`;

  return (
    <form action={formAction} className={styles.scheduleForm}>
      <input name="cohortId" type="hidden" value={cohortId} />
      <input name="taskId" type="hidden" value={schedule.taskId} />
      <input name="expectedVersion" type="hidden" value={schedule.rowVersion} />
      <input name="idempotencyKey" type="hidden" value={idempotencyKey} />
      <input name="locale" type="hidden" value={locale} />
      <input name="perspective" type="hidden" value={perspective} />
      <div className={styles.dateFields}>
        <Field
          error={state.fieldErrors?.availableFrom}
          htmlFor={availableId}
          label={labels.availableFrom}
        >
          <Input
            aria-describedby={
              state.fieldErrors?.availableFrom
                ? `${availableId}-error`
                : undefined
            }
            aria-invalid={state.fieldErrors?.availableFrom ? "true" : undefined}
            defaultValue={localDateTimeValue(schedule.availableFrom)}
            id={availableId}
            name="availableFrom"
            step={60}
            type="datetime-local"
          />
        </Field>
        <Field
          error={state.fieldErrors?.dueAt}
          htmlFor={dueId}
          label={labels.dueAt}
        >
          <Input
            aria-describedby={state.fieldErrors?.dueAt ? `${dueId}-error` : undefined}
            aria-invalid={state.fieldErrors?.dueAt ? "true" : undefined}
            defaultValue={localDateTimeValue(schedule.dueAt)}
            id={dueId}
            name="dueAt"
            step={60}
            type="datetime-local"
          />
        </Field>
      </div>
      <p className={styles.utcNote}>{labels.utcNote}</p>
      <Field
        error={state.fieldErrors?.reason}
        htmlFor={reasonId}
        label={labels.reason}
      >
        <Input
          aria-describedby={state.fieldErrors?.reason ? `${reasonId}-error` : undefined}
          aria-invalid={state.fieldErrors?.reason ? "true" : undefined}
          id={reasonId}
          maxLength={1_000}
          minLength={3}
          name="reason"
          placeholder={labels.reasonPlaceholder}
          required
        />
      </Field>
      <ActionMessage state={state} />
      <div>
        <PendingButton idle={labels.saveSchedule} pending={labels.savingSchedule} />
      </div>
    </form>
  );
}
