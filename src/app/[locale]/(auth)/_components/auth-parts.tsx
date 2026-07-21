"use client";

import { useId, useState } from "react";
import { AlertCircle, CheckCircle2, Eye, EyeOff } from "lucide-react";
import { useFormStatus } from "react-dom";

import { Button, Input, cn } from "@/shared/ui";

/**
 * WS-1's auth form building blocks. Shared by all four auth screens so the
 * login, register and reset forms cannot drift apart.
 */

/**
 * `exactOptionalPropertyTypes` is on, so `error={maybeUndefined}` does not
 * compile. Spread this instead: `{...errorProp(state.fieldErrors.email)}`.
 */
export const errorProp = (message: string | undefined): { error?: string } =>
  message ? { error: message } : {};

/* ── Heading ─────────────────────────────────────────────────────────────── */

export function AuthHeading({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="mb-6 flex flex-col gap-1.5">
      <h1 className="text-[22px] font-semibold leading-7">{title}</h1>
      <p className="text-[13px] leading-5 text-(--color-fg-muted)">{subtitle}</p>
    </div>
  );
}

/* ── Form-level alert ────────────────────────────────────────────────────── */

export function FormAlert({ tone, children }: { tone: "error" | "success"; children: string }) {
  const error = tone === "error";
  const Icon = error ? AlertCircle : CheckCircle2;
  return (
    <p
      role={error ? "alert" : "status"}
      className={cn(
        "flex items-start gap-2 rounded-(--radius-md) border px-3 py-2.5 text-[13px] leading-5",
        error
          ? "border-(--color-danger) bg-(--color-danger-soft) text-(--color-danger)"
          : "border-(--color-success) bg-(--color-success-soft) text-(--color-success)"
      )}
    >
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
      <span className="text-(--color-fg)">{children}</span>
    </p>
  );
}

/* ── Password field with a show/hide toggle ──────────────────────────────── */

export interface PasswordFieldProps {
  name: string;
  label: string;
  hint?: string;
  error?: string;
  autoComplete: string;
  showLabel: string;
  hideLabel: string;
}

/**
 * Not built on `Field`: that component clones its single child to attach the
 * label's `id`, and a password box with a toggle needs a wrapper element around
 * the input. The ARIA wiring is therefore done explicitly here.
 */
export function PasswordField({
  name,
  label,
  hint,
  error,
  autoComplete,
  showLabel,
  hideLabel,
}: PasswordFieldProps) {
  const id = useId();
  const [visible, setVisible] = useState(false);
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-[13px] font-semibold leading-4 text-(--color-fg)">
        {label}
        <span className="ml-0.5 text-(--color-brand)" aria-hidden>
          *
        </span>
      </label>

      <div className="relative">
        <Input
          id={id}
          name={name}
          type={visible ? "text" : "password"}
          autoComplete={autoComplete}
          required
          invalid={Boolean(error)}
          aria-describedby={describedBy}
          className="pr-12"
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? hideLabel : showLabel}
          aria-pressed={visible}
          className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-(--radius-md) text-(--color-fg-muted) hover:text-(--color-fg)"
        >
          {visible ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
        </button>
      </div>

      {hint && !error && (
        <p id={hintId} className="text-[13px] leading-5 text-(--color-fg-muted)">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="text-[13px] leading-5 text-(--color-danger)">
          {error}
        </p>
      )}
    </div>
  );
}

/* ── Submit button ───────────────────────────────────────────────────────── */

export function SubmitButton({ children }: { children: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" fullWidth loading={pending}>
      {children}
    </Button>
  );
}
