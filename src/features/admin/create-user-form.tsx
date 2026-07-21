"use client";

import type { Route } from "next";
import Link from "next/link";
import { useActionState } from "react";
import { Input, Select } from "@/shared/ui";
import { createUserAction } from "./actions";
import { initialCreateUserState } from "./action-state";
import { ActionMessage, SubmitButton } from "./form-ui";
import type { AdminDict } from "./i18n";
import { roleLabel } from "./i18n";

/**
 * ⚠️ The privileged Supabase key never reaches this file. The form posts to a
 * Server Action, and the Auth Admin call happens there, on the server.
 *
 * The literal env-var name is deliberately NOT written anywhere in this module:
 * SEC-3 greps the client bundle for that token, and a comment mentioning it
 * would look identical to a real leak.
 */
export function CreateUserForm({
  roles,
  locale,
  t,
}: {
  roles: { id: string; code: string }[];
  locale: string;
  t: AdminDict;
}) {
  const [state, formAction] = useActionState(createUserAction, initialCreateUserState);

  return (
    <form action={formAction} className="flex max-w-xl flex-col gap-4">
      <ActionMessage state={state} />

      {state.status === "success" && state.userId && (
        <Link
          href={`/${locale}/admin/users/${state.userId}` as Route}
          className="text-[15px] font-semibold text-(--color-brand) underline underline-offset-4"
        >
          {t.userDetail.title}
        </Link>
      )}

      <label className="flex flex-col gap-1.5">
        <span className="text-[13px] font-semibold leading-4">
          {t.userNew.email}
          <span className="ml-0.5 text-(--color-brand)" aria-hidden>
            *
          </span>
        </span>
        <Input name="email" type="email" autoComplete="off" required />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-[13px] font-semibold leading-4">
          {t.userNew.displayName}
          <span className="ml-0.5 text-(--color-brand)" aria-hidden>
            *
          </span>
        </span>
        <Input name="displayName" autoComplete="off" required />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-[13px] font-semibold leading-4">
          {t.userNew.password}
          <span className="ml-0.5 text-(--color-brand)" aria-hidden>
            *
          </span>
        </span>
        <Input name="password" type="password" autoComplete="new-password" required minLength={12} />
        <span className="text-[13px] leading-5 text-(--color-fg-muted)">
          {t.userNew.passwordHint}
        </span>
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-[13px] font-semibold leading-4">
          {t.userNew.role}
          <span className="ml-0.5 text-(--color-brand)" aria-hidden>
            *
          </span>
        </span>
        <Select name="roleId" required defaultValue="">
          <option value="" disabled>
            {t.userNew.role}
          </option>
          {roles.map((r) => (
            <option key={r.id} value={r.id}>
              {roleLabel(t, r.code)}
            </option>
          ))}
        </Select>
      </label>

      <div>
        <SubmitButton size="lg">{t.userNew.submit}</SubmitButton>
      </div>
    </form>
  );
}
