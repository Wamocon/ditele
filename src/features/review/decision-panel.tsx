"use client";

import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Badge, Button, Card, ErrorState, Field, Input, Select, Textarea, cn } from "@/shared/ui";
import type { RubricCriterion } from "@/shared/data/review";
import { decideSubmissionAction, transferSubmissionAction } from "./actions";
import { ConfirmDialog } from "./confirm-dialog";

/**
 * ReviewDecisionBar. Three outcomes, one screen, no navigation in between —
 * trainer throughput is what makes the platform viable (00_MASTER_PLAN §1).
 *
 * The rubric inputs are NOT optional polish: `decide_submission` rejects any
 * call whose `p_criterion_scores` is not a non-empty array covering every
 * required criterion (ISSUES.md I-016). Rubric scoring is P0 here because the
 * database says so.
 */

export interface DecisionLabels {
  decision: string;
  rubric: string;
  rubricRequired: string;
  points: string;
  /** A template containing `{max}` — props crossing the server/client boundary
   *  must be serializable, so this cannot be a function. */
  maxPointsTemplate: string;
  comment: string;
  commentPlaceholder: string;
  commentRequired: string;
  accept: string;
  requestRevision: string;
  transfer: string;
  transferTo: string;
  transferReason: string;
  transferReasonPlaceholder: string;
  transferSubmit: string;
  transferNoTrainers: string;
  cancel: string;
  confirmAcceptTitle: string;
  confirmRevisionTitle: string;
  confirmText: string;
  confirm: string;
  lockedTitle: string;
  lockedReason: string;
}

export interface DecisionPanelProps {
  locale: string;
  submissionId: string;
  submissionVersionId: string;
  expectedVersion: number;
  criteria: RubricCriterion[];
  trainers: { id: string; name: string }[];
  decidable: boolean;
  labels: DecisionLabels;
  /** Where to go once the decision lands — the queue, so the next one is one click away. */
  queueHref: string;
}

type Pending = "accepted" | "revision_required" | null;

export function DecisionPanel({
  locale,
  submissionId,
  submissionVersionId,
  expectedVersion,
  criteria,
  trainers,
  decidable,
  labels,
  queueHref,
}: DecisionPanelProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [comment, setComment] = useState("");
  const [scores, setScores] = useState<Record<string, string>>(() =>
    Object.fromEntries(criteria.map((criterion) => [criterion.id, String(criterion.maxPoints)]))
  );
  const [confirming, setConfirming] = useState<Pending>(null);
  const [transferOpen, setTransferOpen] = useState(false);
  const [transferTo, setTransferTo] = useState(trainers[0]?.id ?? "");
  const [transferReason, setTransferReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [commentTouched, setCommentTouched] = useState(false);

  const commentMissing = comment.trim().length === 0;

  if (!decidable) {
    return (
      <Card className="flex flex-col gap-2 border-(--color-border-strong) bg-(--color-surface)">
        <h2 className="text-[18px] font-semibold leading-6">{labels.lockedTitle}</h2>
        <p className="text-[13px] leading-5 text-(--color-fg-muted)">{labels.lockedReason}</p>
      </Card>
    );
  }

  function runDecision(decision: "accepted" | "revision_required") {
    setError(null);
    startTransition(async () => {
      const result = await decideSubmissionAction({
        locale,
        submissionId,
        submissionVersionId,
        expectedVersion,
        decision,
        comment,
        scores: criteria.map((criterion) => ({
          criterionId: criterion.id,
          points: clamp(scores[criterion.id], criterion.maxPoints),
        })),
      });
      if (!result.ok) {
        setError(result.error.message);
        setConfirming(null);
        return;
      }
      setConfirming(null);
      // Straight back to the queue: the next review is one click away, which is
      // what makes a 90-second review possible.
      router.push(`${queueHref}?decided=${decision}` as Route);
      router.refresh();
    });
  }

  function runTransfer() {
    setError(null);
    startTransition(async () => {
      const result = await transferSubmissionAction({
        locale,
        submissionId,
        expectedVersion,
        toTrainerId: transferTo,
        reason: transferReason,
      });
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      setTransferOpen(false);
      router.push(`${queueHref}?transferred=1` as Route);
      router.refresh();
    });
  }

  return (
    <Card className="flex flex-col gap-5">
      <h2 className="text-[18px] font-semibold leading-6">{labels.decision}</h2>

      {criteria.length > 0 && (
        <fieldset className="flex flex-col gap-3">
          <legend className="mb-2 text-[11px] font-semibold uppercase tracking-[0.04em] text-(--color-fg-muted)">
            {labels.rubric}
          </legend>
          <div className="flex flex-col gap-3">
            {criteria.map((criterion) => (
              <div
                key={criterion.id}
                className="flex flex-wrap items-end justify-between gap-3 rounded-(--radius-md) bg-(--color-surface) p-3"
              >
                <div className="flex min-w-0 flex-col gap-1">
                  <span className="text-[15px] font-semibold leading-5">{criterion.label}</span>
                  {criterion.required && (
                    <Badge tone="brand" dot className="self-start">
                      {labels.rubricRequired}
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <label className="sr-only" htmlFor={`score-${criterion.id}`}>
                    {`${criterion.label} — ${labels.points}`}
                  </label>
                  <Input
                    id={`score-${criterion.id}`}
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={criterion.maxPoints}
                    step={1}
                    value={scores[criterion.id] ?? ""}
                    onChange={(event) =>
                      setScores((current) => ({ ...current, [criterion.id]: event.target.value }))
                    }
                    className="w-24 tabular"
                  />
                  <span className="whitespace-nowrap text-[13px] text-(--color-fg-muted)">
                    {labels.maxPointsTemplate.replace("{max}", String(criterion.maxPoints))}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </fieldset>
      )}

      <Field
        label={labels.comment}
        required
        {...(commentTouched && commentMissing ? { error: labels.commentRequired } : {})}
      >
        <Textarea
          value={comment}
          rows={5}
          placeholder={labels.commentPlaceholder}
          onChange={(event) => setComment(event.target.value)}
          onBlur={() => setCommentTouched(true)}
        />
      </Field>

      {error && <ErrorState message={error} className="text-left" />}

      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <Button
          type="button"
          variant="primary"
          className="sm:flex-1"
          disabled={isPending}
          onClick={() => {
            setCommentTouched(true);
            if (commentMissing) return;
            setConfirming("accepted");
          }}
        >
          {labels.accept}
        </Button>
        <Button
          type="button"
          variant="outline"
          className="sm:flex-1"
          disabled={isPending}
          onClick={() => {
            setCommentTouched(true);
            if (commentMissing) return;
            setConfirming("revision_required");
          }}
        >
          {labels.requestRevision}
        </Button>
        <Button
          type="button"
          variant="ghost"
          disabled={isPending}
          onClick={() => setTransferOpen(true)}
        >
          {labels.transfer}
        </Button>
      </div>

      <ConfirmDialog
        open={confirming !== null}
        title={confirming === "accepted" ? labels.confirmAcceptTitle : labels.confirmRevisionTitle}
        description={labels.confirmText}
        confirmLabel={labels.confirm}
        cancelLabel={labels.cancel}
        destructive={confirming === "revision_required"}
        busy={isPending}
        onCancel={() => setConfirming(null)}
        onConfirm={() => confirming && runDecision(confirming)}
      />

      <ConfirmDialog
        open={transferOpen}
        title={labels.transfer}
        confirmLabel={labels.transferSubmit}
        cancelLabel={labels.cancel}
        busy={isPending}
        onCancel={() => setTransferOpen(false)}
        onConfirm={runTransfer}
      >
        {trainers.length === 0 ? (
          <p className={cn("text-[13px] leading-5 text-(--color-fg-muted)")}>
            {labels.transferNoTrainers}
          </p>
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
    </Card>
  );
}

function clamp(raw: string | undefined, max: number): number {
  const value = Number(raw);
  if (!Number.isFinite(value)) return 0;
  return Math.min(Math.max(value, 0), max);
}
