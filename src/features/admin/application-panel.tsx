"use client";

import { useActionState } from "react";
import { Button, Select, Textarea } from "@/shared/ui";
import { assignEnrollmentAction, decideEnrollmentAction, idleState } from "./actions";
import { ActionMessage, InlineConfirm, SubmitButton } from "./form-ui";
import type { AdminDict } from "./i18n";

export interface CohortOption {
  id: string;
  name: string;
  courseId: string;
}

/**
 * The decision controls for one enrolment request.
 *
 * ⚠️ Every button here is gated on the row's current state. ISSUES I-007: calling
 * `decide_enrollment` on an already-decided row does not error, it HANGS and
 * exhausts the PostgREST pool — which breaks every other chat's dev server for
 * ~30s. The server re-checks too (`decideEnrollment` in admin.ts); this is the
 * cosmetic half of a two-layer guard.
 */
export function ApplicationPanel({
  enrollmentId,
  state,
  courseId,
  cohorts,
  t,
}: {
  enrollmentId: string;
  state: string;
  courseId: string;
  cohorts: CohortOption[];
  t: AdminDict["applications"];
}) {
  if (state === "requested") {
    return <DecideControls enrollmentId={enrollmentId} t={t} />;
  }
  if (state === "approved") {
    return (
      <AssignControls
        enrollmentId={enrollmentId}
        cohorts={cohorts.filter((c) => c.courseId === courseId)}
        t={t}
      />
    );
  }
  return <p className="text-[13px] leading-5 text-[--color-fg-muted]">{t.decidedNotice}</p>;
}

function DecideControls({
  enrollmentId,
  t,
}: {
  enrollmentId: string;
  t: AdminDict["applications"];
}) {
  const [state, formAction] = useActionState(decideEnrollmentAction, idleState);

  return (
    <div className="flex flex-col gap-3">
      <ActionMessage state={state} />

      <div className="flex flex-wrap items-start gap-2">
        <form action={formAction}>
          <input type="hidden" name="enrollmentId" value={enrollmentId} />
          <input type="hidden" name="decision" value="approved" />
          <SubmitButton size="sm">{t.approve}</SubmitButton>
        </form>

        <InlineConfirm
          trigger={
            <Button type="button" variant="outline" size="sm">
              {t.reject}
            </Button>
          }
          title={t.reject}
          description={t.rejectReasonHint}
        >
          <form action={formAction} className="flex flex-col gap-3">
            <input type="hidden" name="enrollmentId" value={enrollmentId} />
            <input type="hidden" name="decision" value="rejected" />
            <label className="flex flex-col gap-1.5">
              <span className="text-[13px] font-semibold leading-4">{t.rejectReasonLabel}</span>
              <Textarea name="reason" rows={3} required />
            </label>
            <div>
              <SubmitButton variant="danger" size="sm">
                {t.reject}
              </SubmitButton>
            </div>
          </form>
        </InlineConfirm>
      </div>
    </div>
  );
}

function AssignControls({
  enrollmentId,
  cohorts,
  t,
}: {
  enrollmentId: string;
  cohorts: CohortOption[];
  t: AdminDict["applications"];
}) {
  const [state, formAction] = useActionState(assignEnrollmentAction, idleState);

  if (cohorts.length === 0) {
    return <p className="text-[13px] leading-5 text-[--color-fg-muted]">{t.noCohortForCourse}</p>;
  }

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <ActionMessage state={state} />
      <input type="hidden" name="enrollmentId" value={enrollmentId} />
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <label className="flex min-w-[14rem] flex-1 flex-col gap-1.5">
          <span className="text-[13px] font-semibold leading-4">{t.chooseCohort}</span>
          <Select name="cohortId" required defaultValue="">
            <option value="" disabled>
              {t.chooseCohort}
            </option>
            {cohorts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </label>
        <SubmitButton size="md">{t.assign}</SubmitButton>
      </div>
    </form>
  );
}
