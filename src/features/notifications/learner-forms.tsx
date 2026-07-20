"use client";

import { useActionState, useId } from "react";
import { useFormStatus } from "react-dom";

import { Button } from "@/shared/ui/button";

import type { LearnerNotificationClientCopy } from "./learner-copy";
import {
  learnerNotificationActionInitialState,
  learnerNotificationChannels,
  type LearnerNotificationActionState,
  type LearnerNotificationEventFamily,
  type LearnerNotificationPreference,
} from "./learner-model";
import styles from "./learner.module.css";

export type LearnerNotificationServerAction = (
  previousState: LearnerNotificationActionState,
  formData: FormData,
) => Promise<LearnerNotificationActionState>;

function ActionMessage({
  state,
}: {
  readonly state: LearnerNotificationActionState;
}) {
  if (!state.message) return null;
  return (
    <p
      className={state.status === "success" ? styles.success : styles.error}
      role={state.status === "success" ? "status" : "alert"}
    >
      {state.message}
    </p>
  );
}

function MarkReadButton({ labels }: { readonly labels: LearnerNotificationClientCopy }) {
  const { pending } = useFormStatus();
  return (
    <Button disabled={pending} type="submit" variant="secondary">
      {pending ? labels.markingRead : labels.markRead}
    </Button>
  );
}

export function MarkNotificationReadForm({
  action,
  expectedVersion,
  idempotencyKey,
  labels,
  notificationId,
}: {
  readonly action: LearnerNotificationServerAction;
  readonly expectedVersion: number;
  readonly idempotencyKey: string;
  readonly labels: LearnerNotificationClientCopy;
  readonly notificationId: string;
}) {
  const [state, formAction] = useActionState(
    action,
    learnerNotificationActionInitialState,
  );
  return (
    <form action={formAction} className={styles.compactForm}>
      <input name="notificationId" type="hidden" value={notificationId} />
      <input name="expectedVersion" type="hidden" value={expectedVersion} />
      <input name="idempotencyKey" type="hidden" value={idempotencyKey} />
      <MarkReadButton labels={labels} />
      <ActionMessage state={state} />
    </form>
  );
}

function MarkAllButton({ labels }: { readonly labels: LearnerNotificationClientCopy }) {
  const { pending } = useFormStatus();
  return (
    <Button disabled={pending} type="submit" variant="secondary">
      {pending ? labels.markingAllRead : labels.markAllRead}
    </Button>
  );
}

export function MarkAllNotificationsReadForm({
  action,
  before,
  idempotencyKey,
  labels,
}: {
  readonly action: LearnerNotificationServerAction;
  readonly before: string;
  readonly idempotencyKey: string;
  readonly labels: LearnerNotificationClientCopy;
}) {
  const [state, formAction] = useActionState(
    action,
    learnerNotificationActionInitialState,
  );
  return (
    <form action={formAction} className={styles.compactForm}>
      <input name="before" type="hidden" value={before} />
      <input name="idempotencyKey" type="hidden" value={idempotencyKey} />
      <MarkAllButton labels={labels} />
      <ActionMessage state={state} />
    </form>
  );
}

function SavePreferenceButton({
  labels,
}: {
  readonly labels: LearnerNotificationClientCopy;
}) {
  const { pending } = useFormStatus();
  return (
    <Button disabled={pending} type="submit" variant="secondary">
      {pending ? labels.savingPreferences : labels.savePreferences}
    </Button>
  );
}

export function NotificationPreferenceForm({
  action,
  eventFamily,
  idempotencyKey,
  labels,
  preferences,
}: {
  readonly action: LearnerNotificationServerAction;
  readonly eventFamily: LearnerNotificationEventFamily;
  readonly idempotencyKey: string;
  readonly labels: LearnerNotificationClientCopy;
  readonly preferences: readonly LearnerNotificationPreference[];
}) {
  const [state, formAction] = useActionState(
    action,
    learnerNotificationActionInitialState,
  );
  const legendId = useId();
  const preferenceMap = new Map(
    preferences.map((preference) => [preference.channel, preference]),
  );
  const inApp = preferenceMap.get("in_app");
  const email = preferenceMap.get("email");
  const push = preferenceMap.get("push");

  return (
    <form action={formAction} className={`panel stack ${styles.preferenceCard}`}>
      <fieldset aria-labelledby={legendId} className={styles.fieldset}>
        <legend id={legendId}>{labels.eventFamilies[eventFamily]}</legend>
        <input name="eventFamily" type="hidden" value={eventFamily} />
        <input name="idempotencyKey" type="hidden" value={idempotencyKey} />
        <input
          name="expectedInAppVersion"
          type="hidden"
          value={inApp?.rowVersion ?? 0}
        />
        <input
          name="expectedEmailVersion"
          type="hidden"
          value={email?.rowVersion ?? 0}
        />
        <input
          name="expectedPushVersion"
          type="hidden"
          value={push?.rowVersion ?? 0}
        />
        <div className={styles.channelGrid}>
          {learnerNotificationChannels.map((channel) => {
            const preference = preferenceMap.get(channel);
            const inputId = `${legendId}-${channel}`;
            return (
              <label className={styles.checkbox} htmlFor={inputId} key={channel}>
                <input
                  defaultChecked={preference?.enabled ?? false}
                  id={inputId}
                  name={
                    channel === "in_app"
                      ? "inAppEnabled"
                      : channel === "email"
                        ? "emailEnabled"
                        : "pushEnabled"
                  }
                  type="checkbox"
                />
                <span>{labels.channels[channel]}</span>
              </label>
            );
          })}
        </div>
      </fieldset>
      <div className={styles.preferenceFooter}>
        <SavePreferenceButton labels={labels} />
        <ActionMessage state={state} />
      </div>
    </form>
  );
}
