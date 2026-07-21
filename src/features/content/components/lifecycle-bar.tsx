"use client";

import { useState, useTransition } from "react";
import { Button, Card, CardTitle, Field, Input, StatusBadge, Textarea, cn } from "@/shared/ui";
import type { ArchiveImpact } from "@/shared/data/content";
import {
  archiveVersionAction,
  decideReviewAction,
  loadArchiveImpactAction,
  publishVersionAction,
  submitForReviewAction,
  type ActionState,
} from "../actions";
import type { AdminStrings } from "../i18n";
import { isReady, type ContentVersionState, type ReadinessCheck } from "../model";
import { ReadinessList } from "./readiness-list";

const STEPS: { state: ContentVersionState | "approved"; key: keyof AdminStrings["lifecycle"] }[] = [
  { state: "draft", key: "stepDraft" },
  { state: "in_review", key: "stepReview" },
  { state: "approved", key: "stepApproved" },
  { state: "published", key: "stepPublished" },
  { state: "archived", key: "stepArchived" },
];

export interface LifecycleBarProps {
  locale: string;
  courseId: string;
  versionId: string;
  versionState: ContentVersionState;
  /** True when the newest `content_reviews` row for this version approved it. */
  approved: boolean;
  checks: ReadinessCheck[];
  strings: AdminStrings;
}

export function LifecycleBar({
  locale,
  courseId,
  versionId,
  versionState,
  approved,
  checks,
  strings,
}: LifecycleBarProps) {
  const s = strings.lifecycle;
  const [pending, startTransition] = useTransition();
  const [state, setState] = useState<ActionState>({ status: "idle" });
  const [comment, setComment] = useState("");
  const [reason, setReason] = useState("");
  const [confirmWord, setConfirmWord] = useState("");
  const [impact, setImpact] = useState<ArchiveImpact | null>(null);

  const ready = isReady(checks);
  const currentIndex = STEPS.findIndex((step) =>
    step.state === "approved" ? approved && versionState === "in_review" : step.state === versionState
  );
  const activeIndex =
    versionState === "in_review" && approved
      ? STEPS.findIndex((step) => step.state === "approved")
      : currentIndex;

  const run = (action: () => Promise<ActionState>) => {
    startTransition(async () => {
      setState(await action());
    });
  };

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <CardTitle>{s.title}</CardTitle>
        <StatusBadge state={versionState} locale={locale} />
      </div>

      {/* Steps. Colour is never the only signal — the current step is also labelled. */}
      <ol className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px]">
        {STEPS.map((step, index) => {
          const done = activeIndex > index;
          const current = activeIndex === index;
          return (
            <li key={step.state} className="flex items-center gap-2">
              {index > 0 && (
                <span className="text-(--color-fg-subtle)" aria-hidden>
                  ›
                </span>
              )}
              <span
                aria-current={current ? "step" : undefined}
                className={cn(
                  "rounded-full px-2.5 py-1 font-semibold",
                  current && "bg-(--color-brand-soft) text-(--color-brand)",
                  done && !current && "text-(--color-success)",
                  !done && !current && "text-(--color-fg-subtle)"
                )}
              >
                {s[step.key]}
              </span>
            </li>
          );
        })}
      </ol>

      {state.status === "error" && (
        <p role="alert" className="rounded-(--radius-md) bg-(--color-danger-soft) px-3 py-2 text-[13px] text-(--color-danger)">
          {state.message}
        </p>
      )}

      {/* ── draft: readiness gate ─────────────────────────────────────── */}
      {versionState === "draft" && (
        <div className="flex flex-col gap-3">
          <div>
            <p className="text-[13px] font-semibold">{s.checklist}</p>
            <p className="text-[13px] leading-5 text-(--color-fg-muted)">{s.checklistHint}</p>
          </div>
          <ReadinessList checks={checks} strings={strings} />
          <div>
            <Button
              onClick={() => run(() => submitForReviewAction({ locale, courseId, versionId }))}
              loading={pending}
              disabled={!ready}
            >
              {s.submit}
            </Button>
          </div>
        </div>
      )}

      {/* ── in_review: approve / request changes / publish ────────────── */}
      {versionState === "in_review" && (
        <div className="flex flex-col gap-3">
          {approved ? (
            <p className="rounded-(--radius-md) bg-(--color-success-soft) px-3 py-2 text-[13px] text-(--color-success)">
              {s.approvedNotice}
            </p>
          ) : (
            <>
              <ReadinessList checks={checks} strings={strings} />
              <Field label={s.comment} required>
                <Textarea
                  value={comment}
                  onChange={(event) => setComment(event.target.value)}
                  rows={3}
                />
              </Field>
            </>
          )}

          <div className="flex flex-wrap gap-2">
            {!approved && (
              <>
                <Button
                  onClick={() =>
                    run(() =>
                      decideReviewAction({
                        locale,
                        courseId,
                        versionId,
                        decision: "approved",
                        comment,
                      })
                    )
                  }
                  loading={pending}
                  disabled={!ready || !comment.trim()}
                >
                  {s.approve}
                </Button>
                <Button
                  variant="outline"
                  onClick={() =>
                    run(() =>
                      decideReviewAction({
                        locale,
                        courseId,
                        versionId,
                        decision: "changes_requested",
                        comment,
                      })
                    )
                  }
                  loading={pending}
                  disabled={!comment.trim()}
                >
                  {s.requestChanges}
                </Button>
              </>
            )}
            {approved && (
              <Button
                onClick={() => run(() => publishVersionAction({ locale, courseId, versionId }))}
                loading={pending}
              >
                {s.publish}
              </Button>
            )}
          </div>
        </div>
      )}

      {/* ── published: archive, impact first ──────────────────────────── */}
      {versionState === "published" && (
        <div className="flex flex-col gap-3">
          <p className="text-[13px] leading-5 text-(--color-fg-muted)">{s.archiveImpactHint}</p>

          {!impact ? (
            <div>
              <Button
                variant="outline"
                loading={pending}
                onClick={() =>
                  startTransition(async () => {
                    const result = await loadArchiveImpactAction({ locale, versionId });
                    setState(result);
                    if (result.impact) setImpact(result.impact);
                  })
                }
              >
                {s.loadImpact}
              </Button>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-[13px] sm:grid-cols-3">
                {(
                  [
                    [s.archiveImpactTasks, impact.taskCount],
                    [s.archiveImpactAttempts, impact.attemptCount],
                    [s.archiveImpactOpenAttempts, impact.openAttemptCount],
                    [s.archiveImpactSubmissions, impact.submissionCount],
                    [s.archiveImpactCohorts, impact.pinnedCohortCount],
                    [s.archiveImpactSchedules, impact.taskScheduleCount],
                  ] as const
                ).map(([label, value]) => (
                  <div key={label} className="flex flex-col">
                    <dt className="text-(--color-fg-muted)">{label}</dt>
                    <dd className="tabular text-[18px] font-semibold">{value}</dd>
                  </div>
                ))}
              </dl>

              <Field label={s.reason} required>
                <Input value={reason} onChange={(event) => setReason(event.target.value)} />
              </Field>
              <Field
                label={strings.shared.confirmTypeToDelete.replace(
                  "{word}",
                  strings.shared.confirmWord
                )}
                required
              >
                <Input
                  value={confirmWord}
                  onChange={(event) => setConfirmWord(event.target.value)}
                  autoComplete="off"
                />
              </Field>
              <div>
                <Button
                  variant="danger"
                  loading={pending}
                  disabled={!reason.trim() || confirmWord !== strings.shared.confirmWord}
                  onClick={() =>
                    run(() =>
                      archiveVersionAction({
                        locale,
                        courseId,
                        versionId,
                        reason,
                        impactFingerprint: impact.fingerprint,
                      })
                    )
                  }
                >
                  {s.archiveConfirm}
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
