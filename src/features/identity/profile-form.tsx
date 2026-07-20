"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { locales } from "@/shared/i18n/config";
import { Button } from "@/shared/ui/button";
import { Field, Input } from "@/shared/ui/field";

import type { LearnerProfileCopy } from "./profile-copy";
import {
  profileActionInitialState,
  type LearnerProfile,
  type ProfileActionState,
} from "./profile-model";
import styles from "./profile-form.module.css";

export type ProfileServerAction = (
  previousState: ProfileActionState,
  formData: FormData,
) => Promise<ProfileActionState>;

const suggestedTimezones = [
  "UTC",
  "Europe/Berlin",
  "Europe/London",
  "Europe/Kyiv",
  "Europe/Moscow",
  "Asia/Dubai",
  "Asia/Kolkata",
  "Asia/Singapore",
  "America/New_York",
  "America/Los_Angeles",
] as const;

function SaveButton({ labels }: { readonly labels: LearnerProfileCopy }) {
  const { pending } = useFormStatus();
  return (
    <Button disabled={pending} type="submit">
      {pending ? labels.saving : labels.save}
    </Button>
  );
}

export function LearnerProfileForm({
  action,
  idempotencyKey,
  labels,
  profile,
}: {
  readonly action: ProfileServerAction;
  readonly idempotencyKey: string;
  readonly labels: LearnerProfileCopy;
  readonly profile: LearnerProfile;
}) {
  const [state, formAction] = useActionState(
    action,
    profileActionInitialState,
  );
  return (
    <section
      aria-labelledby="learner-profile-form-title"
      className={`panel stack ${styles.panel}`}
    >
      <div className="stack">
        <h2 id="learner-profile-form-title">{labels.formTitle}</h2>
        <p className="muted">
          {labels.updated}: {" "}
          <time dateTime={profile.updatedAt}>
            {new Intl.DateTimeFormat(profile.locale, {
              dateStyle: "medium",
              timeStyle: "short",
              timeZone: profile.timezone,
            }).format(new Date(profile.updatedAt))}
          </time>
        </p>
      </div>

      <form action={formAction} className={`form-grid ${styles.form}`}>
        <input
          name="expectedVersion"
          type="hidden"
          value={profile.rowVersion}
        />
        <input name="idempotencyKey" type="hidden" value={idempotencyKey} />

        <Field
          description={labels.displayNameDescription}
          error={state.fieldErrors?.displayName}
          htmlFor="profile-display-name"
          label={labels.displayName}
        >
          <Input
            aria-describedby={
              state.fieldErrors?.displayName
                ? "profile-display-name-error"
                : undefined
            }
            aria-invalid={state.fieldErrors?.displayName ? "true" : undefined}
            autoComplete="name"
            defaultValue={profile.displayName}
            id="profile-display-name"
            maxLength={160}
            name="displayName"
            required
          />
        </Field>

        <Field
          description={labels.localeDescription}
          error={state.fieldErrors?.locale}
          htmlFor="profile-locale"
          label={labels.locale}
        >
          <select
            aria-describedby={
              state.fieldErrors?.locale ? "profile-locale-error" : undefined
            }
            aria-invalid={state.fieldErrors?.locale ? "true" : undefined}
            className="select"
            defaultValue={profile.locale}
            id="profile-locale"
            name="locale"
            required
          >
            {locales.map((locale) => (
              <option key={locale} value={locale}>
                {labels.localeOptions[locale]}
              </option>
            ))}
          </select>
        </Field>

        <Field
          description={labels.timezoneDescription}
          error={state.fieldErrors?.timezone}
          htmlFor="profile-timezone"
          label={labels.timezone}
        >
          <Input
            aria-describedby={
              state.fieldErrors?.timezone
                ? "profile-timezone-error"
                : undefined
            }
            aria-invalid={state.fieldErrors?.timezone ? "true" : undefined}
            autoComplete="off"
            defaultValue={profile.timezone}
            id="profile-timezone"
            list="profile-timezone-suggestions"
            maxLength={100}
            name="timezone"
            required
          />
          <datalist id="profile-timezone-suggestions">
            {suggestedTimezones.map((timezone) => (
              <option key={timezone} value={timezone} />
            ))}
          </datalist>
        </Field>

        {state.message ? (
          <p
            className={
              state.status === "conflict" ? styles.conflict : styles.error
            }
            role="alert"
          >
            {state.message}
          </p>
        ) : null}
        <div>
          <SaveButton labels={labels} />
        </div>
      </form>
    </section>
  );
}
