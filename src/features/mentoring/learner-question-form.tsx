"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { Button } from "@/shared/ui/button";
import { Field, Input, Textarea } from "@/shared/ui/field";
import { StatePanel } from "@/shared/ui/state-panel";

import type { LearnerQuestionActionCopy } from "./question-workflow-copy";
import type { QuestionContext } from "./question-workflow-model";
import {
  questionActionInitialState,
  type QuestionActionState,
} from "./question-workflow-validation";
import styles from "./question-workflow.module.css";

type QuestionServerAction = (
  previousState: QuestionActionState,
  formData: FormData,
) => Promise<QuestionActionState>;

function SubmitQuestionButton({ labels }: { labels: LearnerQuestionActionCopy }) {
  const { pending } = useFormStatus();
  return (
    <Button disabled={pending} type="submit">
      {pending ? labels.sending : labels.send}
    </Button>
  );
}

export function LearnerQuestionForm({
  action,
  contexts,
  idempotencyKey,
  labels,
}: {
  action: QuestionServerAction;
  contexts: readonly QuestionContext[];
  idempotencyKey: string;
  labels: LearnerQuestionActionCopy;
}) {
  const [state, formAction] = useActionState(action, questionActionInitialState);

  if (contexts.length === 0) {
    return (
      <StatePanel
        description={labels.noContextDescription}
        title={labels.noContextTitle}
      />
    );
  }

  return (
    <section aria-labelledby="create-question-heading" className={`panel ${styles.formPanel}`}>
      <form action={formAction} className="form-grid">
        <h2 id="create-question-heading">{labels.createTitle}</h2>
        <input name="idempotencyKey" type="hidden" value={idempotencyKey} />
        <Field
          description={labels.contextDescription}
          error={state.fieldErrors?.context}
          htmlFor="question-context"
          label={labels.contextLabel}
        >
          <select
            aria-describedby={state.fieldErrors?.context ? "question-context-error" : undefined}
            aria-invalid={state.fieldErrors?.context ? "true" : undefined}
            className="select"
            defaultValue=""
            id="question-context"
            name="context"
            required
          >
            <option disabled value="">{labels.contextLabel}</option>
            {contexts.map((context) => (
              <option
                key={`${context.cohortId}:${context.taskId}`}
                value={`${context.cohortId}:${context.taskId}`}
              >
                {context.taskTitle} — {context.cohortName}
              </option>
            ))}
          </select>
        </Field>
        <Field
          error={state.fieldErrors?.subject}
          htmlFor="question-subject"
          label={labels.subjectLabel}
        >
          <Input
            aria-describedby={state.fieldErrors?.subject ? "question-subject-error" : undefined}
            aria-invalid={state.fieldErrors?.subject ? "true" : undefined}
            id="question-subject"
            maxLength={10_000}
            name="subject"
            placeholder={labels.subjectPlaceholder}
            required
          />
        </Field>
        <Field
          error={state.fieldErrors?.body}
          htmlFor="question-body"
          label={labels.bodyLabel}
        >
          <Textarea
            aria-describedby={state.fieldErrors?.body ? "question-body-error" : undefined}
            aria-invalid={state.fieldErrors?.body ? "true" : undefined}
            id="question-body"
            maxLength={10_000}
            name="body"
            placeholder={labels.bodyPlaceholder}
            required
          />
        </Field>
        {state.message ? <p className={styles.actionMessage} role="alert">{state.message}</p> : null}
        <div>
          <SubmitQuestionButton labels={labels} />
        </div>
      </form>
    </section>
  );
}

function ArchiveSubmitButton({ labels }: { labels: LearnerQuestionActionCopy }) {
  const { pending } = useFormStatus();
  return (
    <Button disabled={pending} type="submit" variant="secondary">
      {pending ? labels.archiving : labels.archive}
    </Button>
  );
}

export function ArchiveQuestionForm({
  action,
  expectedVersion,
  labels,
  questionId,
}: {
  action: QuestionServerAction;
  expectedVersion: number;
  labels: LearnerQuestionActionCopy;
  questionId: string;
}) {
  const [state, formAction] = useActionState(action, questionActionInitialState);
  return (
    <form action={formAction} className="stack">
      <input name="questionId" type="hidden" value={questionId} />
      <input name="expectedVersion" type="hidden" value={expectedVersion} />
      {state.message ? <p className={styles.actionMessage} role="alert">{state.message}</p> : null}
      <div>
        <ArchiveSubmitButton labels={labels} />
      </div>
    </form>
  );
}
