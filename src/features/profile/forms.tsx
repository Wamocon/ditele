"use client";

import { useActionState } from "react";
import { LogOut } from "lucide-react";

import { Button, Field, Input, PasswordInput, Select } from "@/shared/ui";
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
import type { ProfileStrings } from "./strings";

/**
 * Declared here, not in `actions.ts`: a `"use server"` module may export only
 * async functions, and a non-function export silently becomes `undefined` on
 * the client.
 */
const INITIAL: ProfileFormState = { error: null, success: null, fieldErrors: {} };

/* ── Identity: photo lives beside this, name and time zone in it ─────────── */

export function AccountForm({
  locale,
  strings,
  timezones,
  defaults,
}: {
  locale: string;
  strings: ProfileStrings;
  timezones: string[];
  defaults: {
    displayName: string;
    profileLocale: string;
    timezone: string;
    version: number;
  };
}) {
  const [state, action] = useActionState(saveProfileAction, INITIAL);

  return (
    <form action={action} className="flex max-w-[68ch] flex-col gap-5">
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="expectedVersion" value={defaults.version} />
      {/* `update_own_profile` takes the locale as a required argument and this
          screen no longer offers a picker for it, so the stored value rides
          along unchanged. Language is a header control on every page. */}
      <input type="hidden" name="profileLocale" value={defaults.profileLocale} />

      <Field
        label={strings.displayName}
        hint={strings.displayNameHint}
        required
        {...(state.fieldErrors.displayName ? { error: state.fieldErrors.displayName } : {})}
      >
        <Input name="displayName" defaultValue={defaults.displayName} maxLength={160} />
      </Field>

      <Field label={strings.timezone} hint={strings.timezoneHint}>
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
        <SubmitButton>{strings.save}</SubmitButton>
      </div>
    </form>
  );
}

/* ── Notification preferences ───────────────────────────────────────────── */

export function PreferenceForm({
  locale,
  preference,
  familyLabel,
  strings,
}: {
  locale: string;
  preference: FamilyPreference;
  familyLabel: string;
  strings: ProfileStrings;
}) {
  const [state, action] = useActionState(saveNotificationPreferenceAction, INITIAL);

  return (
    <form
      action={action}
      className="flex flex-col gap-3 border-b border-(--color-border) py-4 last:border-0 md:flex-row md:items-center md:justify-between"
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
        <Checkbox name="inApp" label={strings.channelInApp} defaultChecked={preference.inApp.enabled} />
        {/* Email and push have no delivery channel configured yet (MASTER_PLAN
            §16 Q5), so they are shown disabled rather than silently ignored. */}
        <Checkbox label={strings.channelEmail} defaultChecked={preference.email.enabled} disabled />
        <Checkbox label={strings.channelPush} defaultChecked={preference.push.enabled} disabled />
        <SubmitButton variant="outline" size="sm">
          {strings.save}
        </SubmitButton>
      </div>
    </form>
  );
}

/* ── Password ───────────────────────────────────────────────────────────── */

export function PasswordForm({ locale, strings }: { locale: string; strings: ProfileStrings }) {
  const [state, action] = useActionState(changePasswordAction, INITIAL);

  return (
    <form action={action} className="flex max-w-[68ch] flex-col gap-5">
      <input type="hidden" name="locale" value={locale} />

      <Field
        label={strings.newPassword}
        hint={strings.passwordHint}
        required
        {...(state.fieldErrors.password ? { error: state.fieldErrors.password } : {})}
      >
        <PasswordInput
          name="password"
          autoComplete="new-password"
          showLabel={strings.showPassword}
          hideLabel={strings.hidePassword}
        />
      </Field>

      <Field label={strings.newPasswordRepeat} required>
        <PasswordInput
          name="passwordRepeat"
          autoComplete="new-password"
          showLabel={strings.showPassword}
          hideLabel={strings.hidePassword}
        />
      </Field>

      <FormStatus tone="error" message={state.error} />
      <FormStatus tone="success" message={state.success} />

      <div>
        <SubmitButton variant="outline">{strings.changePassword}</SubmitButton>
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
