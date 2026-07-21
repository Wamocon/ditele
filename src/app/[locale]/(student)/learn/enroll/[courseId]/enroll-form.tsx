"use client";

import { useActionState } from "react";
import { GraduationCap } from "lucide-react";
import { Field, Textarea } from "@/shared/ui";
import { FormStatus } from "@/features/questions/components/form-status";
import { SubmitButton } from "@/features/questions/components/submit-button";
import { requestEnrollmentAction, type EnrollFormState } from "./actions";

/** Declared here because a `"use server"` module may export only functions. */
const INITIAL: EnrollFormState = { error: null, success: null };

export function EnrollForm({
  locale,
  courseId,
  labels,
}: {
  locale: string;
  courseId: string;
  labels: { noteLabel: string; noteHint: string; notePlaceholder: string; submit: string };
}) {
  const [state, action] = useActionState(requestEnrollmentAction, INITIAL);

  return (
    <form action={action} className="flex max-w-[68ch] flex-col gap-5">
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="courseId" value={courseId} />

      <Field label={labels.noteLabel} hint={labels.noteHint}>
        <Textarea name="note" rows={4} maxLength={1000} placeholder={labels.notePlaceholder} />
      </Field>

      <FormStatus tone="error" message={state.error} />
      <FormStatus tone="success" message={state.success} />

      <div>
        <SubmitButton iconLeft={<GraduationCap className="size-4" aria-hidden />}>
          {labels.submit}
        </SubmitButton>
      </div>
    </form>
  );
}
