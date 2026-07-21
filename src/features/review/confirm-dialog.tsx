"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { Button, Card, cn } from "@/shared/ui";

/**
 * WS-0's `Dialog` / `ConfirmDialog` are Wave 0b and had not landed, so this is
 * the documented fallback (02_WORKSTREAMS §5.5): a native `<dialog>`, which
 * gives focus trapping, ESC-to-close and the top layer for free.
 * WS-7 replaces it if a shared Dialog arrives.
 */
export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel: string;
  cancelLabel: string;
  destructive?: boolean;
  busy?: boolean;
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
  destructive = false,
  busy = false,
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
        if (!busy) onCancel();
      }}
      onClick={(event) => {
        // Backdrop click: the dialog element itself is the backdrop.
        if (event.target === ref.current && !busy) onCancel();
      }}
      className="m-auto w-[min(30rem,calc(100vw-2rem))] bg-transparent p-0 text-(--color-fg) backdrop:bg-(--color-overlay)"
      aria-labelledby="confirm-title"
    >
      <Card className={cn("flex flex-col gap-4", open && "animate-scale-in")}>
        <div className="flex flex-col gap-1.5">
          <h2 id="confirm-title" className="text-[18px] font-semibold leading-6">
            {title}
          </h2>
          {description && (
            <p className="text-[13px] leading-5 text-(--color-fg-muted)">{description}</p>
          )}
        </div>

        {children}

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="ghost" onClick={onCancel} disabled={busy}>
            {cancelLabel}
          </Button>
          <Button
            type="button"
            variant={destructive ? "danger" : "primary"}
            onClick={onConfirm}
            loading={busy}
          >
            {confirmLabel}
          </Button>
        </div>
      </Card>
    </dialog>
  );
}
