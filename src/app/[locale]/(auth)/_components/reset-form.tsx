"use client";

import { useActionState } from "react";
import type { Route } from "next";
import Link from "next/link";

import { Field, Input } from "@/shared/ui";
import { requestPasswordResetAction } from "../_lib/actions";
import { initialAuthState } from "../_lib/form-state";
import { AuthHeading, FormAlert, SubmitButton, errorProp } from "./auth-parts";

export interface ResetFormLabels {
  title: string;
  subtitle: string;
  email: string;
  emailPlaceholder: string;
  submit: string;
  sentTitle: string;
  sentBody: string;
  remembered: string;
  backToLogin: string;
}

export function ResetForm({ locale, labels }: { locale: string; labels: ResetFormLabels }) {
  const [state, action] = useActionState(requestPasswordResetAction, initialAuthState);

  if (state.status === "success") {
    return (
      <>
        <AuthHeading title={labels.sentTitle} subtitle={labels.sentBody} />
        <Link
          href={`/${locale}/login` as Route}
          className="font-semibold text-[--color-brand] hover:underline"
        >
          {labels.backToLogin}
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

        <SubmitButton>{labels.submit}</SubmitButton>
      </form>

      <p className="mt-6 text-center text-[13px] text-[--color-fg-muted]">
        {labels.remembered}{" "}
        <Link
          href={`/${locale}/login` as Route}
          className="font-semibold text-[--color-brand] hover:underline"
        >
          {labels.backToLogin}
        </Link>
      </p>
    </>
  );
}
