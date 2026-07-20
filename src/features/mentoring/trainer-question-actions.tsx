"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { Button } from "@/shared/ui/button";
import { Field, Textarea } from "@/shared/ui/field";

import type { TrainerQuestionActionCopy } from "./question-workflow-copy";
import {
  questionActionInitialState,
  type QuestionActionState,
} from "./question-workflow-validation";
import styles from "./question-workflow.module.css";

type QuestionServerAction = (
  previousState: QuestionActionState,
  formData: FormData,
) => Promise<QuestionActionState>;

function PendingButton({ idle, pending }: { idle: string; pending: string }) {
  const status = useFormStatus();
  return <Button disabled={status.pending} type="submit">{status.pending ? pending : idle}</Button>;
}

function ActionMessage({ state }: { state: QuestionActionState }) {
  return state.message ? <p className={styles.actionMessage} role="alert">{state.message}</p> : null;
}

export type TrainerCandidate = {
  readonly id: string;
  readonly name: string;
};

export function ClaimQuestionAction({
  action,
  expectedVersion,
  idempotencyKey,
  labels,
  questionId,
}: {
  action: QuestionServerAction;
  expectedVersion: number;
  idempotencyKey: string;
  labels: TrainerQuestionActionCopy;
  questionId: string;
}) {
  const [actionState, formAction] = useActionState(
    action,
    questionActionInitialState,
  );

  return (
    <form action={formAction} className={`panel form-grid ${styles.formPanel}`}>
      <h2>{labels.claimTitle}</h2>
      <p className="muted">{labels.claimDescription}</p>
      <input name="questionId" type="hidden" value={questionId} />
      <input name="expectedVersion" type="hidden" value={expectedVersion} />
      <input name="idempotencyKey" type="hidden" value={idempotencyKey} />
      <ActionMessage state={actionState} />
      <div>
        <PendingButton idle={labels.claim} pending={labels.claiming} />
      </div>
    </form>
  );
}

export function TrainerQuestionActions({
  answerAction,
  answerIdempotencyKey,
  candidates,
  expectedVersion,
  labels,
  questionId,
  transferAction,
  transferIdempotencyKey,
}: {
  answerAction: QuestionServerAction;
  answerIdempotencyKey: string;
  candidates: readonly TrainerCandidate[];
  expectedVersion: number;
  labels: TrainerQuestionActionCopy;
  questionId: string;
  transferAction: QuestionServerAction;
  transferIdempotencyKey: string;
}) {
  const [answerState, answerFormAction] = useActionState(
    answerAction,
    questionActionInitialState,
  );
  const [transferState, transferFormAction] = useActionState(
    transferAction,
    questionActionInitialState,
  );

  return (
    <section aria-label={labels.answerTitle} className={styles.actionGrid}>
      <form action={answerFormAction} className={`panel form-grid ${styles.formPanel}`}>
        <h2>{labels.answerTitle}</h2>
        <input name="questionId" type="hidden" value={questionId} />
        <input name="expectedVersion" type="hidden" value={expectedVersion} />
        <input name="idempotencyKey" type="hidden" value={answerIdempotencyKey} />
        <Field
          error={answerState.fieldErrors?.body}
          htmlFor="question-answer"
          label={labels.answerLabel}
        >
          <Textarea
            aria-describedby={answerState.fieldErrors?.body ? "question-answer-error" : undefined}
            aria-invalid={answerState.fieldErrors?.body ? "true" : undefined}
            id="question-answer"
            maxLength={10_000}
            name="body"
            placeholder={labels.answerPlaceholder}
            required
          />
        </Field>
        <ActionMessage state={answerState} />
        <div>
          <PendingButton idle={labels.answer} pending={labels.answering} />
        </div>
      </form>

      <form action={transferFormAction} className={`panel form-grid ${styles.formPanel}`}>
        <h2>{labels.transferTitle}</h2>
        <input name="questionId" type="hidden" value={questionId} />
        <input name="expectedVersion" type="hidden" value={expectedVersion} />
        <input name="idempotencyKey" type="hidden" value={transferIdempotencyKey} />
        {candidates.length === 0 ? (
          <p className="muted" role="status">{labels.noTransferTarget}</p>
        ) : (
          <>
            <Field
              error={transferState.fieldErrors?.toTrainerId}
              htmlFor="question-transfer-target"
              label={labels.transferTarget}
            >
              <select
                aria-describedby={transferState.fieldErrors?.toTrainerId ? "question-transfer-target-error" : undefined}
                aria-invalid={transferState.fieldErrors?.toTrainerId ? "true" : undefined}
                className="select"
                defaultValue=""
                id="question-transfer-target"
                name="toTrainerId"
                required
              >
                <option disabled value="">{labels.transferTarget}</option>
                {candidates.map((candidate) => (
                  <option key={candidate.id} value={candidate.id}>{candidate.name}</option>
                ))}
              </select>
            </Field>
            <Field
              error={transferState.fieldErrors?.reason}
              htmlFor="question-transfer-reason"
              label={labels.transferReason}
            >
              <Textarea
                aria-describedby={transferState.fieldErrors?.reason ? "question-transfer-reason-error" : undefined}
                aria-invalid={transferState.fieldErrors?.reason ? "true" : undefined}
                id="question-transfer-reason"
                maxLength={1_000}
                name="reason"
                placeholder={labels.transferPlaceholder}
                required
              />
            </Field>
            <ActionMessage state={transferState} />
            <div>
              <PendingButton idle={labels.transfer} pending={labels.transferring} />
            </div>
          </>
        )}
      </form>
    </section>
  );
}
