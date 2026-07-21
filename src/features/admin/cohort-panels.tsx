"use client";

import { useActionState } from "react";
import { Button, Input, Textarea } from "@/shared/ui";
import { idleState, transitionCohortAction, updateCohortScheduleAction } from "./actions";
import { ActionMessage, InlineConfirm, SubmitButton } from "./form-ui";
import type { AdminDict } from "./i18n";

export interface TransitionOption {
  target: string;
  label: string;
}

/**
 * A cohort transition is irreversible and the RPC demands a reason, so the
 * reason field doubles as the confirmation step — the ConfirmDialog fallback.
 * `transitionCohortState` re-checks the allowed set server-side as well.
 */
export function LifecyclePanel({
  cohortId,
  options,
  t,
}: {
  cohortId: string;
  options: TransitionOption[];
  t: AdminDict;
}) {
  const [state, formAction] = useActionState(transitionCohortAction, idleState);

  if (options.length === 0) {
    return (
      <p className="text-[13px] leading-5 text-[--color-fg-muted]">
        {t.groupDetail.noTransitions}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <ActionMessage state={state} />
      <p className="text-[13px] leading-5 text-[--color-fg-muted]">
        {t.groupDetail.lifecycleHint}
      </p>
      <div className="flex flex-col gap-3">
        {options.map((option) => (
          <InlineConfirm
            key={option.target}
            trigger={
              <Button type="button" variant={option.target === "cancelled" ? "danger" : "primary"}>
                {option.label}
              </Button>
            }
            title={option.label}
            description={t.groupDetail.lifecycleHint}
            tone={option.target === "cancelled" ? "danger" : "neutral"}
          >
            <form action={formAction} className="flex flex-col gap-3">
              <input type="hidden" name="cohortId" value={cohortId} />
              <input type="hidden" name="targetState" value={option.target} />
              <label className="flex flex-col gap-1.5">
                <span className="text-[13px] font-semibold leading-4">
                  {t.groupDetail.transitionReason}
                </span>
                <Textarea name="reason" rows={2} required />
              </label>
              <div>
                <SubmitButton
                  size="sm"
                  variant={option.target === "cancelled" ? "danger" : "primary"}
                >
                  {option.label}
                </SubmitButton>
              </div>
            </form>
          </InlineConfirm>
        ))}
      </div>
    </div>
  );
}

/** `cohorts` UPDATE is granted even though INSERT is not (I-011). */
export function SchedulePanel({
  cohortId,
  name,
  capacity,
  startsAt,
  endsAt,
  t,
}: {
  cohortId: string;
  name: string;
  capacity: number | null;
  /** Already converted to a `datetime-local` value by the server component. */
  startsAt: string;
  endsAt: string;
  t: AdminDict;
}) {
  const [state, formAction] = useActionState(updateCohortScheduleAction, idleState);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <ActionMessage state={state} />
      <input type="hidden" name="cohortId" value={cohortId} />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-semibold leading-4">{t.groupDetail.name}</span>
          <Input name="name" defaultValue={name} required />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-semibold leading-4">{t.groupDetail.capacity}</span>
          <Input name="capacity" type="number" min={0} defaultValue={capacity ?? ""} />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-semibold leading-4">{t.groupDetail.startsAt}</span>
          <Input name="startsAt" type="datetime-local" defaultValue={startsAt} />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-semibold leading-4">{t.groupDetail.endsAt}</span>
          <Input name="endsAt" type="datetime-local" defaultValue={endsAt} />
        </label>
      </div>

      <div>
        <SubmitButton>{t.profile.save}</SubmitButton>
      </div>
    </form>
  );
}
