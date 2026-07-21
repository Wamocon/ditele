"use client";

import { useActionState } from "react";
import type { Route } from "next";
import Link from "next/link";

import { Field, Input } from "@/shared/ui";
import { signInAction } from "../_lib/actions";
import { initialAuthState } from "../_lib/form-state";
import { AuthHeading, FormAlert, PasswordField, SubmitButton, errorProp } from "./auth-parts";

export interface LoginFormLabels {
  title: string;
  subtitle: string;
  email: string;
  emailPlaceholder: string;
  password: string;
  submit: string;
  forgot: string;
  noAccount: string;
  registerLink: string;
  showPassword: string;
  hidePassword: string;
}

export function LoginForm({
  locale,
  labels,
  notice,
}: {
  locale: string;
  labels: LoginFormLabels;
  /** Server-side message, e.g. an expired email link from /auth/callback. */
  notice?: string;
}) {
  const [state, action] = useActionState(signInAction, initialAuthState);

  return (
    <>
      <AuthHeading title={labels.title} subtitle={labels.subtitle} />

      <form action={action} className="flex flex-col gap-4" noValidate>
        <input type="hidden" name="locale" value={locale} />

        {state.status === "error" && state.message ? (
          <FormAlert tone="error">{state.message}</FormAlert>
        ) : (
          notice && <FormAlert tone="error">{notice}</FormAlert>
        )}

        <Field label={labels.email} {...errorProp(state.fieldErrors.email)} required>
          <Input
            name="email"
            type="email"
            autoComplete="email"
            inputMode="email"
            placeholder={labels.emailPlaceholder}
            defaultValue={state.values.email}
          />
        </Field>

        <PasswordField
          name="password"
          label={labels.password}
          autoComplete="current-password"
          showLabel={labels.showPassword}
          hideLabel={labels.hidePassword}
          {...errorProp(state.fieldErrors.password)}
        />

        <div className="-mt-1 flex justify-end">
          <Link
            href={`/${locale}/reset-password` as Route}
            className="inline-flex min-h-11 items-center text-[13px] font-semibold text-(--color-brand) hover:underline"
          >
            {labels.forgot}
          </Link>
        </div>

        <SubmitButton>{labels.submit}</SubmitButton>
      </form>

      <p className="mt-6 text-center text-[13px] text-(--color-fg-muted)">
        {labels.noAccount}{" "}
        <Link
          href={`/${locale}/register` as Route}
          className="font-semibold text-(--color-brand) hover:underline"
        >
          {labels.registerLink}
        </Link>
      </p>
    </>
  );
}
