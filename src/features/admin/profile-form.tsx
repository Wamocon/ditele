"use client";

import { useActionState } from "react";
import { Input, Select } from "@/shared/ui";
import { updateOwnProfileAction } from "./actions";
import { idleState } from "./action-state";
import { ActionMessage, SubmitButton } from "./form-ui";
import type { AdminDict } from "./i18n";

/**
 * `profiles` refuses a direct UPDATE even for an admin — `update_own_profile` is
 * a SECURITY DEFINER RPC and the only write path, own row only. It takes
 * `p_expected_version`, so the row's `row_version` rides along in a hidden field
 * and a concurrent edit is rejected by the database rather than silently
 * overwriting.
 */
export function ProfileForm({
  displayName,
  locale,
  timezone,
  expectedVersion,
  locales,
  t,
}: {
  displayName: string;
  locale: string;
  timezone: string;
  expectedVersion: number;
  locales: readonly string[];
  t: AdminDict;
}) {
  const [state, formAction] = useActionState(updateOwnProfileAction, idleState);

  return (
    <form action={formAction} className="flex max-w-xl flex-col gap-4">
      <ActionMessage state={state} />
      <input type="hidden" name="expectedVersion" value={expectedVersion} />

      <label className="flex flex-col gap-1.5">
        <span className="text-[13px] font-semibold leading-4">{t.profile.displayName}</span>
        <Input name="displayName" defaultValue={displayName} required />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-[13px] font-semibold leading-4">{t.profile.locale}</span>
        <Select name="locale" defaultValue={locale}>
          {locales.map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </Select>
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-[13px] font-semibold leading-4">{t.profile.timezone}</span>
        <Input name="timezone" defaultValue={timezone} required />
      </label>

      <div>
        <SubmitButton>{t.profile.save}</SubmitButton>
      </div>
    </form>
  );
}
