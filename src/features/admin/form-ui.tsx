"use client";

import { useState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { Button, type ButtonProps } from "@/shared/ui";
import type { ActionState } from "./action-state";

/**
 * Local form primitives for WS-6.
 *
 * `Toast`, `Dialog`, `ConfirmDialog` and `Pagination` are WS-0 tier-2/3 and had
 * not landed when this workstream ran, so these are the documented fallbacks
 * (02_WORKSTREAMS §5.5): an inline confirm and an `aria-live` message instead of
 * a dialog and a toast. WS-7 may swap them for the shared components.
 */

/** Disables itself while the enclosing form is submitting — blocks double-submit. */
export function SubmitButton({
  children,
  ...props
}: Omit<ButtonProps, "type" | "loading">): ReactNode {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" loading={pending} {...props}>
      {children}
    </Button>
  );
}

/** Success and failure both land here, announced politely, never colour alone. */
export function ActionMessage({ state }: { state: ActionState }) {
  if (state.status === "idle" || state.message.length === 0) return null;
  const isError = state.status === "error";
  return (
    <p
      role={isError ? "alert" : "status"}
      aria-live="polite"
      className={[
        "flex items-start gap-2 rounded-(--radius-md) px-3 py-2 text-[13px] leading-5",
        isError
          ? "bg-(--color-danger-soft) text-(--color-danger)"
          : "bg-(--color-success-soft) text-(--color-success)",
      ].join(" ")}
    >
      <span aria-hidden className="mt-1.5 size-1.5 shrink-0 rounded-full bg-current" />
      {state.message}
    </p>
  );
}

/**
 * The ConfirmDialog fallback: the trigger swaps itself for an inline panel that
 * holds the consequence, the required reason, and the real submit button.
 * Keyboard-reachable, no focus trap to get wrong, and it works at 375px.
 */
export function InlineConfirm({
  trigger,
  title,
  description,
  children,
  cancelLabel = "Abbrechen",
  tone = "danger",
}: {
  trigger: ReactNode;
  title: string;
  description?: string;
  children: ReactNode;
  cancelLabel?: string;
  tone?: "danger" | "neutral";
}) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <span onClick={() => setOpen(true)} onKeyDown={(e) => e.key === "Enter" && setOpen(true)}>
        {trigger}
      </span>
    );
  }

  return (
    <div
      className={[
        "flex flex-col gap-3 rounded-(--radius-md) border p-3",
        tone === "danger"
          ? "border-(--color-danger) bg-(--color-danger-soft)"
          : "border-(--color-border-strong) bg-(--color-surface)",
      ].join(" ")}
    >
      <div className="flex flex-col gap-1">
        <p className="text-[15px] font-semibold leading-5">{title}</p>
        {description && (
          <p className="text-[13px] leading-5 text-(--color-fg-muted)">{description}</p>
        )}
      </div>
      {children}
      <div>
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
          {cancelLabel}
        </Button>
      </div>
    </div>
  );
}

/** A details/summary disclosure for the per-row action panels in a table. */
export function RowDisclosure({ label, children }: { label: string; children: ReactNode }) {
  return (
    <details className="group">
      <summary className="inline-flex h-9 min-h-9 cursor-pointer list-none items-center rounded-(--radius-sm) px-3 text-[13px] font-semibold text-(--color-brand) hover:bg-(--color-brand-soft) focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--color-brand)">
        {label}
      </summary>
      <div className="mt-2">{children}</div>
    </details>
  );
}
