"use client";

import { useActionState } from "react";
import { Button, Input, Select } from "@/shared/ui";
import {
  idleState,
  resetUserPasswordAction,
  setUserActiveAction,
  setUserRoleAction,
} from "./actions";
import { ActionMessage, InlineConfirm, SubmitButton } from "./form-ui";
import type { AdminDict } from "./i18n";
import { roleLabel } from "./i18n";

/** The three write actions on a user account. Each is its own form and its own
 *  action state, so a failure in one never blanks the others. */

export function RolePanel({
  userId,
  currentRoleId,
  roles,
  t,
}: {
  userId: string;
  currentRoleId: string | null;
  roles: { id: string; code: string }[];
  t: AdminDict;
}) {
  const [state, formAction] = useActionState(setUserRoleAction, idleState);

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <ActionMessage state={state} />
      <input type="hidden" name="userId" value={userId} />
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <label className="flex min-w-[14rem] flex-1 flex-col gap-1.5">
          <span className="text-[13px] font-semibold leading-4">{t.userDetail.roleChange}</span>
          <Select name="roleId" defaultValue={currentRoleId ?? ""}>
            {roles.map((r) => (
              <option key={r.id} value={r.id}>
                {roleLabel(t, r.code)}
              </option>
            ))}
          </Select>
        </label>
        <SubmitButton>{t.common.apply}</SubmitButton>
      </div>
    </form>
  );
}

export function AccessPanel({
  userId,
  isDeactivated,
  isSelf,
  t,
}: {
  userId: string;
  isDeactivated: boolean;
  isSelf: boolean;
  t: AdminDict;
}) {
  const [state, formAction] = useActionState(setUserActiveAction, idleState);

  // An admin locking themselves out is unrecoverable without a second admin.
  if (isSelf && !isDeactivated) {
    return (
      <p className="text-[13px] leading-5 text-[--color-fg-muted]">{t.userDetail.selfProtected}</p>
    );
  }

  if (isDeactivated) {
    return (
      <form action={formAction} className="flex flex-col gap-3">
        <ActionMessage state={state} />
        <input type="hidden" name="userId" value={userId} />
        <input type="hidden" name="active" value="true" />
        <div>
          <SubmitButton>{t.userDetail.activate}</SubmitButton>
        </div>
      </form>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <ActionMessage state={state} />
      <InlineConfirm
        trigger={
          <Button type="button" variant="danger">
            {t.userDetail.deactivate}
          </Button>
        }
        title={t.userDetail.deactivate}
        description={t.userDetail.deactivateWarning}
      >
        <form action={formAction}>
          <input type="hidden" name="userId" value={userId} />
          <input type="hidden" name="active" value="false" />
          <SubmitButton variant="danger" size="sm">
            {t.userDetail.deactivate}
          </SubmitButton>
        </form>
      </InlineConfirm>
    </div>
  );
}

export function PasswordPanel({ userId, t }: { userId: string; t: AdminDict }) {
  const [state, formAction] = useActionState(resetUserPasswordAction, idleState);

  return (
    <div className="flex flex-col gap-3">
      <ActionMessage state={state} />
      <InlineConfirm
        trigger={<Button type="button" variant="outline">{t.userDetail.setPassword}</Button>}
        title={t.userDetail.passwordSection}
        description={t.userNew.passwordHint}
        tone="neutral"
      >
        <form action={formAction} className="flex flex-col gap-3">
          <input type="hidden" name="userId" value={userId} />
          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] font-semibold leading-4">{t.userDetail.newPassword}</span>
            <Input
              name="password"
              type="password"
              autoComplete="new-password"
              required
              minLength={12}
            />
          </label>
          <div>
            <SubmitButton size="sm">{t.userDetail.setPassword}</SubmitButton>
          </div>
        </form>
      </InlineConfirm>
    </div>
  );
}
