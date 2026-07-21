"use client";

import { useActionState } from "react";
import type { Route } from "next";
import Link from "next/link";

import { Field, Input } from "@/shared/ui";
import { registerAction } from "../_lib/actions";
import { initialAuthState } from "../_lib/form-state";
import { AuthHeading, FormAlert, PasswordField, SubmitButton, errorProp } from "./auth-parts";

export interface RegisterFormLabels {
  title: string;
  subtitle: string;
  name: string;
  namePlaceholder: string;
  email: string;
  emailPlaceholder: string;
  password: string;
  passwordHint: string;
  confirm: string;
  submit: string;
  hasAccount: string;
  loginLink: string;
  showPassword: string;
  hidePassword: string;
  terms: string;
  checkInboxTitle: string;
  checkInboxBody: string;
}

export function RegisterForm({ locale, labels }: { locale: string; labels: RegisterFormLabels }) {
  const [state, action] = useActionState(registerAction, initialAuthState);

  // Reached only if the deployment stops auto-confirming sign-ups.
  if (state.status === "success") {
    return (
      <>
        <AuthHeading title={labels.checkInboxTitle} subtitle={labels.checkInboxBody} />
        <Link
          href={`/${locale}/login` as Route}
          className="font-semibold text-[--color-brand] hover:underline"
        >
          {labels.loginLink}
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

        <Field label={labels.name} {...errorProp(state.fieldErrors.name)} required>
          <Input
            name="name"
            type="text"
            autoComplete="name"
            placeholder={labels.namePlaceholder}
            defaultValue={state.values.name}
          />
        </Field>

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

        <p className="text-[13px] leading-5 text-[--color-fg-muted]">{labels.terms}</p>
      </form>

      <p className="mt-6 text-center text-[13px] text-[--color-fg-muted]">
        {labels.hasAccount}{" "}
        <Link
          href={`/${locale}/login` as Route}
          className="font-semibold text-[--color-brand] hover:underline"
        >
          {labels.loginLink}
        </Link>
      </p>
    </>
  );
}
