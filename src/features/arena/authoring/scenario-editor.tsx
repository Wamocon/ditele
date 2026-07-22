"use client";

import { useActionState, useEffect, useId, useRef, useState } from "react";
import { Plus, Trash2 } from "lucide-react";

import { Button, Field, Input, Select, Textarea } from "@/shared/ui";
import { idleState } from "@/features/admin/action-state";
import type { HuntScenario, HuntScenarioDefect } from "@/features/arena/model";
import { saveScenarioAction } from "@/app/[locale]/(admin)/admin/arena/actions";

/**
 * Authoring a hunt scenario, in a **modal** — §1.7, which asks for a modal
 * explicitly, "as with course tasks", and explicitly not a page.
 *
 * Built on the native `<dialog>` with `showModal()`, the same primitive
 * `ConfirmDialog` uses and for the same reason: focus trapping, ESC-to-close
 * and top-layer stacking come from the platform, so there is no focus-trap code
 * here to get wrong. It is not `ConfirmDialog` itself because that component's
 * footer calls `onConfirm` rather than submitting, and this form posts to a
 * Server Action — the submit button has to live inside the `<form>`.
 *
 * ⚠️ The defect list in this component IS the answer key. It is safe here and
 * only here: the page that renders it is admin-only at the route guard, the row
 * read is admin-only at RLS, and none of it is ever passed to `HtmlSandbox`.
 */

export interface ScenarioEditorLabels {
  new: string;
  edit: string;
  formCode: string;
  formCodeHint: string;
  formTitle: string;
  formTitleHint: string;
  formDescription: string;
  formHtml: string;
  formHtmlHint: string;
  formStartMedia: string;
  formEndMedia: string;
  formState: string;
  formSave: string;
  formCancel: string;
  defectsHeading: string;
  defectsDescription: string;
  defectAdd: string;
  defectRemove: string;
  defectCode: string;
  defectTitle: string;
  defectLocation: string;
  defectExpected: string;
  defectReproduction: string;
  defectSeverity: string;
  defectsNone: string;
}

interface DefectDraft {
  key: string;
  code: string;
  title: string;
  locationHint: string;
  expectedBehaviour: string;
  reproduction: string;
  severity: string;
}

const SEVERITIES = ["low", "medium", "high", "critical"] as const;

let nextKey = 0;
const blankDefect = (): DefectDraft => ({
  key: `new-${(nextKey += 1)}`,
  code: "",
  title: "",
  locationHint: "",
  expectedBehaviour: "",
  reproduction: "",
  severity: "medium",
});

export function ScenarioEditor({
  locale,
  scenario,
  defects,
  labels,
  stateLabels,
  trigger,
}: {
  locale: string;
  /** Null when creating. */
  scenario: HuntScenario | null;
  defects: HuntScenarioDefect[];
  labels: ScenarioEditorLabels;
  /** DB state → language, from the one `statusLabel` mapping. */
  stateLabels: { value: string; label: string }[];
  trigger: string;
}) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<DefectDraft[]>(() =>
    defects.map((defect) => ({
      key: defect.id,
      code: defect.code,
      title: defect.title,
      locationHint: defect.locationHint,
      expectedBehaviour: defect.expectedBehaviour,
      reproduction: defect.reproduction,
      severity: defect.severity,
    }))
  );
  const [state, action, pending] = useActionState(saveScenarioAction, idleState);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const formId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  /**
   * Close on success, so the list behind refreshes and the author sees the
   * result rather than a form they have to dismiss.
   *
   * Two wrong ways to do this, both tried:
   *
   *  1. `useEffect(() => { if (state.status === "success") setOpen(false) })` —
   *     a `setState` inside an effect, which React 19's lint rule rejects.
   *  2. Deriving `shouldShow = open && state.status !== "success"` — lint-clean
   *     and **broken**: `useActionState` keeps the last result, so after one
   *     successful save `status` stays "success" and the modal could never be
   *     opened again. It looked correct and would have failed the second time
   *     an author edited anything.
   *
   * So: compare against the result already handled, and close the dialog with a
   * DOM call rather than through React state. `close()` fires the dialog's
   * `close` event, and `onClose` — an event handler, not an effect — is what
   * puts React's `open` back in step.
   */
  const handledResult = useRef(state);
  useEffect(() => {
    if (state === handledResult.current) return;
    handledResult.current = state;
    if (state.status === "success") dialogRef.current?.close();
  }, [state]);

  return (
    <>
      <Button type="button" variant="secondary" size="sm" onClick={() => setOpen(true)}>
        {trigger}
      </Button>

      <dialog
        ref={dialogRef}
        onCancel={(event) => {
          // ESC. Let React own the open state rather than the DOM closing
          // underneath it.
          event.preventDefault();
          setOpen(false);
        }}
        // Fires whenever the dialog closes, including the `close()` call in the
        // success effect above. This is the single place React's `open` is
        // brought back in step, so the two can never disagree.
        onClose={() => setOpen(false)}
        className="m-auto w-[min(56rem,92vw)] rounded-(--radius-lg) border border-(--color-border) bg-(--color-bg) p-0 text-(--color-fg) backdrop:bg-black/50"
      >
        <form
          id={formId}
          action={action}
          className="flex max-h-[85vh] flex-col gap-4 overflow-y-auto p-5"
        >
          <input type="hidden" name="locale" value={locale} />
          <h2 className="text-[20px] font-semibold leading-7">
            {scenario ? labels.edit : labels.new}
          </h2>

          {state.status === "error" && state.message && (
            <p role="alert" className="text-[13px] text-(--color-danger)">
              {state.message}
            </p>
          )}

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <Field label={labels.formCode} hint={labels.formCodeHint} required>
              <Input
                name="code"
                defaultValue={scenario?.code ?? ""}
                // The code is the handle a task points at through
                // `tasks.external_id`. Changing it on an existing scenario
                // would silently orphan every task aimed at it, so it is fixed
                // once created.
                readOnly={Boolean(scenario)}
                required
              />
            </Field>
            <Field label={labels.formState}>
              <Select name="state" defaultValue={scenario?.state ?? "draft"}>
                {stateLabels.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <Field label={labels.formTitle} hint={labels.formTitleHint} required>
            <Input name="title" defaultValue={scenario?.title ?? ""} required />
          </Field>

          <Field label={labels.formDescription}>
            <Textarea name="description" rows={2} defaultValue={scenario?.description ?? ""} />
          </Field>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <Field label={labels.formStartMedia}>
              <Input name="startMediaUrl" defaultValue={scenario?.startMediaUrl ?? ""} />
            </Field>
            <Field label={labels.formEndMedia}>
              <Input name="endMediaUrl" defaultValue={scenario?.endMediaUrl ?? ""} />
            </Field>
          </div>

          <Field label={labels.formHtml} hint={labels.formHtmlHint}>
            <Textarea
              name="html"
              rows={12}
              spellCheck={false}
              className="font-mono text-[13px]"
              defaultValue={scenario?.html ?? ""}
            />
          </Field>

          <fieldset className="flex flex-col gap-3 rounded-(--radius-md) border border-(--color-border) p-3">
            <legend className="px-1 text-[13px] font-semibold">{labels.defectsHeading}</legend>
            <p className="text-[13px] text-(--color-fg-muted)">{labels.defectsDescription}</p>

            {rows.length === 0 && (
              <p className="text-[13px] text-(--color-fg-muted)">{labels.defectsNone}</p>
            )}

            {rows.map((row, index) => (
              <div
                key={row.key}
                className="flex flex-col gap-2 border-t border-(--color-border) pt-3"
              >
                <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
                  <Field label={labels.defectCode}>
                    <Input
                      name="defectCode"
                      defaultValue={row.code}
                      placeholder="TOTAL_IGNORES_DISCOUNT"
                    />
                  </Field>
                  <Field label={labels.defectTitle} className="md:col-span-2">
                    <Input name="defectTitle" defaultValue={row.title} />
                  </Field>
                </div>
                <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
                  <Field label={labels.defectLocation}>
                    <Input name="defectLocation" defaultValue={row.locationHint} />
                  </Field>
                  <Field label={labels.defectSeverity}>
                    <Select name="defectSeverity" defaultValue={row.severity}>
                      {SEVERITIES.map((value) => (
                        <option key={value} value={value}>
                          {value}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <div className="flex items-end">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      iconLeft={<Trash2 className="size-4" aria-hidden />}
                      onClick={() => setRows(rows.filter((_, i) => i !== index))}
                    >
                      {labels.defectRemove}
                    </Button>
                  </div>
                </div>
                <Field label={labels.defectExpected}>
                  <Textarea name="defectExpected" rows={2} defaultValue={row.expectedBehaviour} />
                </Field>
                <Field label={labels.defectReproduction}>
                  <Textarea name="defectReproduction" rows={2} defaultValue={row.reproduction} />
                </Field>
              </div>
            ))}

            <div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                iconLeft={<Plus className="size-4" aria-hidden />}
                onClick={() => setRows([...rows, blankDefect()])}
              >
                {labels.defectAdd}
              </Button>
            </div>
          </fieldset>

          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-(--color-border) pt-3">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              {labels.formCancel}
            </Button>
            <Button type="submit" disabled={pending}>
              {labels.formSave}
            </Button>
          </div>
        </form>
      </dialog>
    </>
  );
}
