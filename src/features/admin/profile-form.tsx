"use client";

import { useActionState } from "react";
import { Input } from "@/shared/ui";
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
 *
 * Only the display name is editable here.
 *
 * Language moved out: it is a header control now, so a second picker inside a
 * form you must remember to submit meant two sources of truth for one setting,
 * and the winner was whichever you happened to touch last.
 *
 * Time zone is shown on the page but not editable. The RPC signature requires
 * both values, so they ride along as hidden fields, unchanged.
 */
export function ProfileForm({
  displayName,
  locale,
  timezone,
  expectedVersion,
  t,
}: {
  displayName: string;
  locale: string;
  timezone: string;
  expectedVersion: number;
  t: AdminDict;
}) {
  const [state, formAction] = useActionState(updateOwnProfileAction, idleState);

  return (
    <form action={formAction} className="flex max-w-xl flex-col gap-4">
      <ActionMessage state={state} />
      <input type="hidden" name="expectedVersion" value={expectedVersion} />
      {/* Required by update_own_profile; neither is editable on this screen. */}
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="timezone" value={timezone} />

      <label className="flex flex-col gap-1.5">
        <span className="text-[13px] font-semibold leading-4">{t.profile.displayName}</span>
        <Input name="displayName" defaultValue={displayName} required />
      </label>

      <div>
        <SubmitButton>{t.profile.save}</SubmitButton>
      </div>
    </form>
  );
}
