"use client";

import { useActionState } from "react";
import { LogOut } from "lucide-react";
import { Button, Field, Input, Select } from "@/shared/ui";
import { Checkbox } from "@/features/questions/components/checkbox";
import { FormStatus } from "@/features/questions/components/form-status";
import { SubmitButton } from "@/features/questions/components/submit-button";
import type { FamilyPreference } from "@/shared/data/notifications";
import {
  changePasswordAction,
  saveNotificationPreferenceAction,
  saveProfileAction,
  signOutAction,
  type ProfileFormState,
} from "./actions";

/**
 * Declared here, not in `actions.ts`: a `"use server"` module may export only
 * async functions, and a non-function export silently becomes `undefined` on
 * the client.
 */
const INITIAL: ProfileFormState = { error: null, success: null, fieldErrors: {} };

/* ── Account ────────────────────────────────────────────────────────────── */

export interface AccountLabels {
  displayName: string;
  email: string;
  emailHint: string;
  language: string;
  languageHint: string;
  timezone: string;
  timezoneHint: string;
  save: string;
  languages: { de: string; en: string; ru: string };
}

export function AccountForm({
  locale,
  labels,
  defaults,
  timezones,
}: {
  locale: string;
  labels: AccountLabels;
  defaults: { displayName: string; email: string; profileLocale: string; timezone: string; version: number };
  timezones: string[];
}) {
  const [state, action] = useActionState(saveProfileAction, INITIAL);

  return (
    <form action={action} className="flex max-w-[68ch] flex-col gap-5">
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="expectedVersion" value={defaults.version} />

      <Field
        label={labels.displayName}
        required
        {...(state.fieldErrors.displayName ? { error: state.fieldErrors.displayName } : {})}
      >
        <Input name="displayName" defaultValue={defaults.displayName} maxLength={160} />
      </Field>

      <Field label={labels.email} hint={labels.emailHint}>
        <Input name="email" type="email" defaultValue={defaults.email} disabled readOnly />
      </Field>

      <Field label={labels.language} hint={labels.languageHint}>
        <Select name="profileLocale" defaultValue={defaults.profileLocale}>
          <option value="de">{labels.languages.de}</option>
          <option value="en">{labels.languages.en}</option>
          <option value="ru">{labels.languages.ru}</option>
        </Select>
      </Field>

      <Field label={labels.timezone} hint={labels.timezoneHint}>
        <Select name="timezone" defaultValue={defaults.timezone}>
          {timezones.map((zone) => (
            <option key={zone} value={zone}>
              {zone}
            </option>
          ))}
        </Select>
      </Field>

      <FormStatus tone="error" message={state.error} />
      <FormStatus tone="success" message={state.success} />

      <div>
        <SubmitButton>{labels.save}</SubmitButton>
      </div>
    </form>
  );
}

/* ── Notification preferences ───────────────────────────────────────────── */

export interface PreferenceLabels {
  inApp: string;
  email: string;
  push: string;
  save: string;
}

export function PreferenceForm({
  locale,
  preference,
  familyLabel,
  labels,
}: {
  locale: string;
  preference: FamilyPreference;
  familyLabel: string;
  labels: PreferenceLabels;
}) {
  const [state, action] = useActionState(saveNotificationPreferenceAction, INITIAL);

  return (
    <form
      action={action}
      className="flex flex-col gap-3 border-b border-[--color-border] py-4 last:border-0 md:flex-row md:items-center md:justify-between"
    >
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="family" value={preference.family} />
      <input type="hidden" name="inAppVersion" value={preference.inApp.version} />
      <input type="hidden" name="emailVersion" value={preference.email.version} />
      <input type="hidden" name="pushVersion" value={preference.push.version} />
      {/* A disabled checkbox submits nothing, which would silently rewrite the
          stored value to false. The current values ride along as hidden fields
          so an untouched channel keeps whatever the database already holds. */}
      <input type="hidden" name="email" value={preference.email.enabled ? "on" : "off"} />
      <input type="hidden" name="push" value={preference.push.enabled ? "on" : "off"} />

      <div className="flex flex-col gap-1">
        <p className="text-[15px] font-semibold leading-6">{familyLabel}</p>
        <FormStatus tone="error" message={state.error} />
        <FormStatus tone="success" message={state.success} />
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <Checkbox name="inApp" label={labels.inApp} defaultChecked={preference.inApp.enabled} />
        {/* Email and push have no delivery channel configured yet (MASTER_PLAN
            §16 Q5), so they are shown disabled rather than silently ignored. */}
        <Checkbox label={labels.email} defaultChecked={preference.email.enabled} disabled />
        <Checkbox label={labels.push} defaultChecked={preference.push.enabled} disabled />
        <SubmitButton variant="outline" size="sm">
          {labels.save}
        </SubmitButton>
      </div>
    </form>
  );
}

/* ── Password ───────────────────────────────────────────────────────────── */

export interface PasswordLabels {
  newPassword: string;
  newPasswordRepeat: string;
  hint: string;
  submit: string;
}

export function PasswordForm({ locale, labels }: { locale: string; labels: PasswordLabels }) {
  const [state, action] = useActionState(changePasswordAction, INITIAL);

  return (
    <form action={action} className="flex max-w-[68ch] flex-col gap-5">
      <input type="hidden" name="locale" value={locale} />

      <Field
        label={labels.newPassword}
        hint={labels.hint}
        required
        {...(state.fieldErrors.password ? { error: state.fieldErrors.password } : {})}
      >
        <Input name="password" type="password" autoComplete="new-password" />
      </Field>

      <Field label={labels.newPasswordRepeat} required>
        <Input name="passwordRepeat" type="password" autoComplete="new-password" />
      </Field>

      <FormStatus tone="error" message={state.error} />
      <FormStatus tone="success" message={state.success} />

      <div>
        <SubmitButton variant="outline">{labels.submit}</SubmitButton>
      </div>
    </form>
  );
}

/* ── Session ────────────────────────────────────────────────────────────── */

export function SignOutForm({ locale, label }: { locale: string; label: string }) {
  return (
    <form action={signOutAction}>
      <input type="hidden" name="locale" value={locale} />
      <Button type="submit" variant="outline" iconLeft={<LogOut className="size-4" aria-hidden />}>
        {label}
      </Button>
    </form>
  );
}
