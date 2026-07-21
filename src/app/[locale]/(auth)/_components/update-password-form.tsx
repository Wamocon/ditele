"use client";

import { useActionState } from "react";
import type { Route } from "next";
import Link from "next/link";

import { Button } from "@/shared/ui";
import { updatePasswordAction } from "../_lib/actions";
import { initialAuthState } from "../_lib/form-state";
import { AuthHeading, FormAlert, PasswordField, SubmitButton, errorProp } from "./auth-parts";

export interface UpdatePasswordFormLabels {
  title: string;
  subtitle: string;
  password: string;
  passwordHint: string;
  confirm: string;
  submit: string;
  successTitle: string;
  successBody: string;
  toLogin: string;
  showPassword: string;
  hidePassword: string;
}

export function UpdatePasswordForm({
  locale,
  labels,
}: {
  locale: string;
  labels: UpdatePasswordFormLabels;
}) {
  const [state, action] = useActionState(updatePasswordAction, initialAuthState);

  if (state.status === "success") {
    return (
      <>
        <AuthHeading title={labels.successTitle} subtitle={labels.successBody} />
        <Link href={`/${locale}/login` as Route}>
          <Button size="lg" fullWidth>
            {labels.toLogin}
          </Button>
        </Link>
      </>
    );
  }

  return (
    <>
      <AuthHeading title={labels.title} subtitle={labels.subtitle} />

      <form action={action} className="flex flex-col gap-4" noValidate>
        <input type="hidden" name="locale" value={locale} />

        {state.status === "error" && state.message && (
          <FormAlert tone="error">{state.message}</FormAlert>
        )}

        <PasswordField
          name="password"
          label={labels.password}
          hint={labels.passwordHint}
          autoComplete="new-password"
          showLabel={labels.showPassword}
          hideLabel={labels.hidePassword}
          {...errorProp(state.fieldErrors.password)}
        />

        <PasswordField
          name="confirm"
          label={labels.confirm}
          autoComplete="new-password"
          showLabel={labels.showPassword}
          hideLabel={labels.hidePassword}
          {...errorProp(state.fieldErrors.confirm)}
        />

        <SubmitButton>{labels.submit}</SubmitButton>
      </form>
    </>
  );
}
