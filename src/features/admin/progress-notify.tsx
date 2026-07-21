"use client";

import { useActionState } from "react";
import { Button, Textarea } from "@/shared/ui";
import { idleState } from "./action-state";
import { ActionMessage, SubmitButton } from "./form-ui";
import { fill, type AdminDict } from "./i18n";

/**
 * WS-12 — "Trainer benachrichtigen", per board row. `05_…` §G10.
 *
 * The note is **required**, not optional. A bare "this learner needs attention"
 * ping hands the trainer the same problem the admin just had — they still have
 * to work out what is wrong. Making the note mandatory means every flag arrives
 * with the reason attached, which is the difference between an alert and an
 * interruption. The database enforces it too (`22023` on a blank note), so a
 * caller that skips this form cannot get around it.
 *
 * Rendered inline rather than in a modal: `ConfirmDialog` exists, but this
 * lives inside a table row that becomes a card below `md`, and an inline
 * disclosure needs no focus trap and works at 375px unchanged. Same reasoning
 * (and the same primitives) as WS-6's `InlineConfirm`.
 */
export function ProgressNotify({
  enrollmentId,
  learnerName,
  locale,
  dict,
  action,
}: {
  enrollmentId: string;
  learnerName: string;
  locale: string;
  dict: AdminDict;
  action: (previous: { status: "idle" | "success" | "error"; message: string }, formData: FormData) => Promise<{
    status: "idle" | "success" | "error";
    message: string;
  }>;
}) {
  const [state, formAction] = useActionState(action, idleState);
  const p = dict.progress;

  return (
    <details className="group">
      <summary
        className={[
          // 44px touch target, relaxing to the table's rhythm only from lg up —
          // the same pattern the shared Button uses for `size="sm"`.
          "inline-flex h-11 min-h-11 cursor-pointer list-none items-center rounded-(--radius-sm) px-3",
          "text-[13px] font-semibold whitespace-nowrap text-(--color-brand)",
          "hover:bg-(--color-brand-soft)",
          "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--color-brand)",
          "lg:h-9 lg:min-h-9",
        ].join(" ")}
      >
        {p.notify}
      </summary>

      <form
        action={formAction}
        className="mt-2 flex w-full min-w-0 max-w-md flex-col gap-3 rounded-(--radius-md) border border-(--color-border-strong) bg-(--color-surface) p-3"
      >
        <p className="text-[15px] font-semibold leading-5">
          {fill(p.notifyTitle, { name: learnerName || dict.common.unknownUser })}
        </p>

        <ActionMessage state={state} />

        <input type="hidden" name="enrollmentId" value={enrollmentId} />
        <input type="hidden" name="locale" value={locale} />

        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-semibold leading-4">{p.notifyNoteLabel}</span>
          <Textarea name="note" rows={3} required maxLength={1000} />
          <span className="text-[13px] leading-5 text-(--color-fg-muted)">{p.notifyNoteHint}</span>
        </label>

        <div className="flex flex-wrap gap-2">
          <SubmitButton size="sm">{p.notifySubmit}</SubmitButton>
          <Button type="reset" variant="ghost" size="sm">
            {p.notifyCancel}
          </Button>
        </div>
      </form>
    </details>
  );
}
