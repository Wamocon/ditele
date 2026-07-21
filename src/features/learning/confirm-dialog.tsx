"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { Button } from "@/shared/ui";

/**
 * A confirmation dialog built on the native `<dialog>` element.
 *
 * WS-0's `ConfirmDialog` is a Wave 0b component and had not landed when the task
 * workspace needed one; 02_WORKSTREAMS §5.5 says to use the documented native
 * fallback rather than wait. `showModal()` gives focus trapping, ESC-to-close
 * and the top layer for free — no library, no focus-trap code to get wrong.
 *
 * Below `md` it presents as a bottom sheet, per MASTER_PLAN §7.2.
 */
export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel: string;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  children?: ReactNode;
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel,
  loading = false,
  onConfirm,
  onCancel,
  children,
}: ConfirmDialogProps) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onCancel={(event) => {
        event.preventDefault();
        if (!loading) onCancel();
      }}
      onClick={(event) => {
        // Backdrop click: the target is the dialog itself only outside its content.
        if (event.target === ref.current && !loading) onCancel();
      }}
      aria-labelledby="confirm-title"
      className={[
        "m-0 w-full max-w-[440px] bg-transparent p-0 backdrop:bg-(--color-overlay)",
        "fixed bottom-0 left-0 top-auto translate-x-0 animate-slide-up",
        "md:bottom-auto md:left-1/2 md:top-1/2 md:-translate-x-1/2 md:-translate-y-1/2 md:animate-scale-in",
      ].join(" ")}
    >
      <div className="flex flex-col gap-4 rounded-t-(--radius-xl) border border-(--color-border) bg-(--color-bg) p-5 shadow-(--shadow-lg) md:rounded-(--radius-lg)">
        <div className="flex flex-col gap-1.5">
          <h2 id="confirm-title" className="text-[22px] font-semibold leading-7">
            {title}
          </h2>
          <p className="text-[15px] leading-6 text-(--color-fg-muted)">{description}</p>
        </div>

        {children}

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="ghost" onClick={onCancel} disabled={loading}>
            {cancelLabel}
          </Button>
          <Button onClick={onConfirm} loading={loading}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </dialog>
  );
}
