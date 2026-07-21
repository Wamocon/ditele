"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button, Card, ConfirmDialog, ErrorState, Field, Select, Textarea } from "@/shared/ui";
import {
  answerQuestionAction,
  archiveQuestionAction,
  claimQuestionAction,
  transferQuestionAction,
} from "./actions";

/**
 * Claim → answer → transfer → archive, in one panel.
 *
 * A question can only be answered by the trainer who claimed it, so the panel
 * shows exactly one primary action at a time instead of four disabled buttons.
 */
export interface QuestionActionLabels {
  claim: string;
  claimHint: string;
  answerLabel: string;
  answerPlaceholder: string;
  answerRequired: string;
  answer: string;
  transfer: string;
  transferTo: string;
  transferReason: string;
  transferReasonPlaceholder: string;
  transferSubmit: string;
  transferNoTrainers: string;
  archive: string;
  archiveConfirm: string;
  cancel: string;
  confirm: string;
  notYours: string;
  isArchived: string;
}

export function QuestionActions({
  locale,
  questionId,
  expectedVersion,
  canClaim,
  canAnswer,
  isArchived,
  trainers,
  labels,
}: {
  locale: string;
  questionId: string;
  expectedVersion: number;
  canClaim: boolean;
  canAnswer: boolean;
  isArchived: boolean;
  trainers: { id: string; name: string }[];
  labels: QuestionActionLabels;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [body, setBody] = useState("");
  const [bodyTouched, setBodyTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [transferOpen, setTransferOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [transferTo, setTransferTo] = useState(trainers[0]?.id ?? "");
  const [transferReason, setTransferReason] = useState("");

  const bodyMissing = body.trim().length === 0;

  function run(work: () => Promise<{ ok: boolean; error?: { message: string } }>) {
    setError(null);
    startTransition(async () => {
      const result = await work();
      if (!result.ok) {
        setError(result.error?.message ?? "");
        return;
      }
      setTransferOpen(false);
      setArchiveOpen(false);
      setBody("");
      setBodyTouched(false);
      router.refresh();
    });
  }

  if (isArchived) {
    return (
      <Card className="bg-(--color-surface)">
        <p className="text-[15px] leading-6 text-(--color-fg-muted)">{labels.isArchived}</p>
      </Card>
    );
  }

  return (
    <Card className="flex flex-col gap-4">
      {canClaim && !canAnswer && (
        <div className="flex flex-col gap-3">
          <p className="text-[15px] leading-6 text-(--color-fg-muted)">{labels.claimHint}</p>
          <Button
            type="button"
            loading={isPending}
            onClick={() =>
              run(() => claimQuestionAction({ locale, questionId, expectedVersion }))
            }
          >
            {labels.claim}
          </Button>
        </div>
      )}

      {!canClaim && !canAnswer && (
        <p className="text-[15px] leading-6 text-(--color-fg-muted)">{labels.notYours}</p>
      )}

      {canAnswer && (
        <>
          <Field
            label={labels.answerLabel}
            required
            {...(bodyTouched && bodyMissing ? { error: labels.answerRequired } : {})}
          >
            <Textarea
              rows={5}
              value={body}
              placeholder={labels.answerPlaceholder}
              onChange={(event) => setBody(event.target.value)}
              onBlur={() => setBodyTouched(true)}
            />
          </Field>

          <div className="flex flex-col gap-2 sm:flex-row">
            <Button
              type="button"
              className="sm:flex-1"
              loading={isPending}
              onClick={() => {
                setBodyTouched(true);
                if (bodyMissing) return;
                run(() => answerQuestionAction({ locale, questionId, expectedVersion, body }));
              }}
            >
              {labels.answer}
            </Button>
            <Button type="button" variant="outline" disabled={isPending} onClick={() => setTransferOpen(true)}>
              {labels.transfer}
            </Button>
            <Button type="button" variant="ghost" disabled={isPending} onClick={() => setArchiveOpen(true)}>
              {labels.archive}
            </Button>
          </div>
        </>
      )}

      {error && <ErrorState message={error} />}

      <ConfirmDialog
        open={transferOpen}
        title={labels.transfer}
        confirmLabel={labels.transferSubmit}
        cancelLabel={labels.cancel}
        busy={isPending}
        onCancel={() => setTransferOpen(false)}
        onConfirm={() =>
          run(() =>
            transferQuestionAction({
              locale,
              questionId,
              expectedVersion,
              toTrainerId: transferTo,
              reason: transferReason,
            })
          )
        }
      >
        {trainers.length === 0 ? (
          <p className="text-[13px] leading-5 text-(--color-fg-muted)">{labels.transferNoTrainers}</p>
        ) : (
          <div className="flex flex-col gap-3">
            <Field label={labels.transferTo} required>
              <Select value={transferTo} onChange={(event) => setTransferTo(event.target.value)}>
                {trainers.map((trainer) => (
                  <option key={trainer.id} value={trainer.id}>
                    {trainer.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={labels.transferReason} required>
              <Textarea
                rows={3}
                value={transferReason}
                placeholder={labels.transferReasonPlaceholder}
                onChange={(event) => setTransferReason(event.target.value)}
              />
            </Field>
          </div>
        )}
      </ConfirmDialog>

      <ConfirmDialog
        open={archiveOpen}
        title={labels.archive}
        description={labels.archiveConfirm}
        confirmLabel={labels.confirm}
        cancelLabel={labels.cancel}
        destructive
        busy={isPending}
        onCancel={() => setArchiveOpen(false)}
        onConfirm={() => run(() => archiveQuestionAction({ locale, questionId, expectedVersion }))}
      />
    </Card>
  );
}
