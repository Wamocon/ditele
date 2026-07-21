"use client";

import { useActionState } from "react";
import { Send } from "lucide-react";
import { Field, Input, Select, Textarea } from "@/shared/ui";
import { FormStatus } from "@/features/questions/components/form-status";
import { SubmitButton } from "@/features/questions/components/submit-button";
import type { QuestionContext } from "@/shared/data/questions";
import { askQuestionAction, initialAskState } from "./actions";

export interface AskFormLabels {
  contextLabel: string;
  contextHint: string;
  contextPlaceholder: string;
  subjectLabel: string;
  subjectHint: string;
  subjectPlaceholder: string;
  bodyLabel: string;
  bodyHint: string;
  bodyPlaceholder: string;
  submit: string;
  unknownTask: string;
}

export function AskForm({
  locale,
  contexts,
  labels,
}: {
  locale: string;
  contexts: QuestionContext[];
  labels: AskFormLabels;
}) {
  const [state, action] = useActionState(askQuestionAction, initialAskState);

  return (
    <form action={action} className="flex max-w-[68ch] flex-col gap-5">
      <input type="hidden" name="locale" value={locale} />

      <Field
        label={labels.contextLabel}
        hint={labels.contextHint}
        required
        {...(state.fieldErrors.context ? { error: state.fieldErrors.context } : {})}
      >
        <Select name="context" defaultValue={state.values.context}>
          <option value="">{labels.contextPlaceholder}</option>
          {contexts.map((context) => (
            <option
              key={`${context.task_id}|${context.cohort_id}`}
              value={`${context.task_id}|${context.cohort_id}`}
            >
              {(context.task_title ?? labels.unknownTask) +
                (context.cohort_name ? ` — ${context.cohort_name}` : "")}
            </option>
          ))}
        </Select>
      </Field>

      <Field
        label={labels.subjectLabel}
        hint={labels.subjectHint}
        required
        {...(state.fieldErrors.subject ? { error: state.fieldErrors.subject } : {})}
      >
        <Input
          name="subject"
          maxLength={200}
          defaultValue={state.values.subject}
          placeholder={labels.subjectPlaceholder}
        />
      </Field>

      <Field
        label={labels.bodyLabel}
        hint={labels.bodyHint}
        required
        {...(state.fieldErrors.body ? { error: state.fieldErrors.body } : {})}
      >
        <Textarea
          name="body"
          rows={8}
          maxLength={4000}
          defaultValue={state.values.body}
          placeholder={labels.bodyPlaceholder}
        />
      </Field>

      <FormStatus tone="error" message={state.error} />

      <div>
        <SubmitButton iconLeft={<Send className="size-4" aria-hidden />}>{labels.submit}</SubmitButton>
      </div>
    </form>
  );
}
