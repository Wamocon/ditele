"use client";

import { useActionState } from "react";
import { Select } from "@/shared/ui";
import { updateSupportIssueStateAction } from "./actions";
import { idleState, ISSUE_STATES } from "./action-state";
import { ActionMessage, SubmitButton } from "./form-ui";
import type { AdminDict } from "./i18n";

/**
 * Triage for one support issue. `support_issues` is UPDATE-able by an admin even
 * though nothing can INSERT one, so this works — there is just nothing to
 * exercise it on yet (0 rows; the learner-facing report form is P1, F56).
 */
export function IssuePanel({
  issueId,
  currentState,
  t,
}: {
  issueId: string;
  currentState: string;
  t: AdminDict;
}) {
  const [state, formAction] = useActionState(updateSupportIssueStateAction, idleState);

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <ActionMessage state={state} />
      <input type="hidden" name="issueId" value={issueId} />
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <label className="flex min-w-[12rem] flex-col gap-1.5">
          <span className="text-[13px] font-semibold leading-4">{t.issues.setState}</span>
          <Select name="state" defaultValue={currentState}>
            {ISSUE_STATES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
        </label>
        <SubmitButton size="sm">{t.common.apply}</SubmitButton>
      </div>
    </form>
  );
}
