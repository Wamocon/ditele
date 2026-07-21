"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { Button } from "./button";
import { cn } from "./cn";

/**
 * The one confirmation dialog.
 *
 * WS-0's tier-2 `Dialog` / `ConfirmDialog` never landed from Wave 0b, so WS-2
 * and WS-4 each built the documented native-`<dialog>` fallback
 * (02_WORKSTREAMS §5.5). Both were correct; neither was complete:
 *
 *   WS-2 (`features/learning`)  had the mobile bottom-sheet presentation that
 *                               MASTER_PLAN §8.1 requires, but no destructive
 *                               variant and no children slot in practice.
 *   WS-4 (`features/review`)    had the destructive variant and a children slot
 *                               for the transfer form, but was a centred box at
 *                               every width.
 *
 * This is the merge WS-7 owes them: the sheet behaviour from WS-2, the
 * destructive variant and children slot from WS-4. Both copies are deleted.
 *
 * Built on the native `<dialog>` element deliberately — `showModal()` gives
 * focus trapping, ESC-to-close and top-layer stacking from the platform, so
 * there is no focus-trap code here to get wrong.
 */
export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel: string;
  cancelLabel: string;
  /** Renders the confirm action in danger red. Use for irreversible actions. */
  destructive?: boolean;
  /** Disables both actions and spins the confirm button. */
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  /** Extra content between the description and the actions — a form, a warning. */
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
        // ESC. Preventing the default lets React own the open state instead of
        // the DOM closing underneath it.
        event.preventDefault();
        if (!busy) onCancel();
      }}
      onClick={(event) => {
        // Backdrop click: outside the content, the event target is the dialog.
        if (event.target === ref.current && !busy) onCancel();
      }}
      aria-labelledby="confirm-dialog-title"
      className={cn(
        "m-0 w-full max-w-[440px] bg-transparent p-0 backdrop:bg-(--color-overlay)",
        // Bottom sheet below md (MASTER_PLAN §7.2), centred dialog above it.
        "fixed bottom-0 left-0 top-auto translate-x-0 animate-slide-up",
        "md:bottom-auto md:left-1/2 md:top-1/2 md:w-[min(27.5rem,calc(100vw-2rem))]",
        "md:-translate-x-1/2 md:-translate-y-1/2 md:animate-scale-in"
      )}
    >
      <div className="flex flex-col gap-4 rounded-t-(--radius-xl) border border-(--color-border) bg-(--color-bg) p-5 text-(--color-fg) shadow-(--shadow-lg) md:rounded-(--radius-lg)">
        <div className="flex flex-col gap-1.5">
          <h2 id="confirm-dialog-title" className="text-[18px] font-semibold leading-6">
            {title}
          </h2>
          {description && (
            <p className="text-[15px] leading-6 text-(--color-fg-muted)">{description}</p>
          )}
        </div>

        {children}

        {/* Column-reverse on mobile so the confirm action sits nearest the thumb
            while still coming first in the tab order. */}
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
      </div>
    </dialog>
  );
}
