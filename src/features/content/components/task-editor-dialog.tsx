"use client";

import { useEffect, useRef } from "react";
import { X } from "lucide-react";

import { Button } from "@/shared/ui";
import type { AdminStrings } from "../i18n";
import type { StudioTask } from "../model";
import { TaskEditor } from "./task-editor";

/**
 * The task editor, in a **modal** — FEATURE_BUILD_PLAN §1.4, which asks for one
 * explicitly: "in a modal — explicitly not a page and not a dropdown, 'for
 * better user experience'".
 *
 * ⚠️ This wraps `TaskEditor`; it does not replace it. Every field §1.4 lists
 * already exists there — title and instructions per locale, the trainer-only
 * model answer, hints, the test question, its options and which are correct,
 * the category, the two videos and the target URL — over 500 lines of it, with
 * the save action and validation attached. What was wrong was the
 * *presentation*: the editor expanded inline inside the stage list, so opening
 * a task pushed every task below it down the page and a long form left the
 * author scrolling past tasks they were not editing.
 *
 * Rebuilding those fields as a second editor would have produced two forms that
 * write the same tables and drift apart on the first change to either.
 *
 * Native `<dialog>` with `showModal()`, the same primitive `ConfirmDialog` and
 * the Arena scenario editor use: focus trapping, ESC-to-close and top-layer
 * stacking come from the platform rather than from code here to get wrong.
 */
export function TaskEditorDialog({
  open,
  locale,
  courseId,
  versionId,
  task,
  scenarios,
  strings,
  readOnly,
  onClose,
}: {
  open: boolean;
  locale: string;
  courseId: string;
  versionId: string;
  task: StudioTask;
  scenarios: { id: string; code: string; title: string }[];
  strings: AdminStrings;
  readOnly: boolean;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      onCancel={(event) => {
        // ESC. React owns `open`, so stop the DOM closing underneath it.
        event.preventDefault();
        onClose();
      }}
      onClose={onClose}
      className="m-auto w-[min(60rem,94vw)] rounded-(--radius-lg) border border-(--color-border) bg-(--color-bg) p-0 text-(--color-fg) backdrop:bg-black/50"
    >
      <div className="flex max-h-[88vh] flex-col">
        <div className="flex items-center justify-between gap-3 border-b border-(--color-border) px-5 py-3">
          <h2 className="text-[18px] font-semibold leading-6">{strings.tasksTests}</h2>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onClose}
            aria-label={strings.shared.close}
            iconLeft={<X className="size-4" aria-hidden />}
          >
            {strings.shared.close}
          </Button>
        </div>

        {/* The editor scrolls, the header does not — a long task form otherwise
            scrolls its own save button out of reach. */}
        <div className="overflow-y-auto px-5 py-4">
          <TaskEditor
            locale={locale}
            courseId={courseId}
            versionId={versionId}
            task={task}
            scenarios={scenarios}
            strings={strings}
            readOnly={readOnly}
            onSaved={onClose}
          />
        </div>
      </div>
    </dialog>
  );
}
