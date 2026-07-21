"use client";

import { useId, type ReactElement, cloneElement } from "react";
import { cn } from "./cn";

export interface FieldProps {
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  className?: string;
  /** A single form control. Field wires aria-describedby and aria-invalid onto it. */
  // `| undefined` on each is required by the repo's exactOptionalPropertyTypes.
  children: ReactElement<{
    id?: string | undefined;
    "aria-describedby"?: string | undefined;
    "aria-invalid"?: boolean | undefined;
    invalid?: boolean | undefined;
    required?: boolean | undefined;
  }>;
}

/**
 * Wraps one control with its label, hint and error, and wires the ARIA
 * relationships. Screen readers announce the hint and the error with the field.
 */
export function Field({ label, hint, error, required, className, children }: FieldProps) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={id} className="text-[13px] font-semibold leading-4 text-(--color-fg)">
        {label}
        {required && (
          <span className="ml-0.5 text-(--color-brand)" aria-hidden>
            *
          </span>
        )}
      </label>

      {cloneElement(children, {
        id,
        "aria-describedby": describedBy,
        "aria-invalid": Boolean(error) || undefined,
        invalid: Boolean(error),
        required,
      })}

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
