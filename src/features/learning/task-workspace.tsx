"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { Route } from "next";
import { ArrowLeft, CheckCircle2, CircleAlert, ExternalLink, FileText, Lock, MessageCircleQuestion, Save } from "lucide-react";
import {
  Badge,
  Button,
  Card,
  CardTitle,
  ConfirmDialog,
  Field,
  SectionLabel,
  StatusBadge,
  StepList,
  Textarea,
  cn,
  type Step,
} from "@/shared/ui";
import {
  EMPTY_DEFECT,
  isAttemptLocked,
  type AttemptState,
  type DefectReport,
  type DraftState,
  type LearningTask,
} from "./model";
import { saveDraftAction, startAttemptAction, submitAttemptAction } from "./actions";
import { DefectForm, formatDefectReport, isDefectComplete } from "./defect-form";
import { HintCascade } from "./hint-cascade";
import { VideoEmbed } from "@/shared/ui";
import { IframePanel } from "./iframe-panel";
import { format, learnStrings } from "./i18n";
import { formatTime } from "./format";
import { useAutosave, useElapsedSeconds } from "./use-autosave";

/**
 * ⭐⭐ The task workspace — the product (MASTER_PLAN §1).
 *
 * Built mobile-first: at 375px it is one column with `Aufgabe` / `Antwort` tabs
 * and a sticky submit bar; from `lg` it widens into description-left,
 * answer-right with the answer panel pinned. 375px is the hard layout, so it is
 * the one the markup is written for and the desktop grid is the enhancement.
 *
 * The rules this screen has to get right, all of them measured against the live
 * database rather than assumed:
 *  - the draft survives a reload (autosave + `attempt_drafts`),
 *  - a hint is recorded *before* it is revealed,
 *  - double-submit is blocked by disabling the button **and** by the server's
 *    idempotency key,
 *  - a submitted attempt is read-only,
 *  - a practice task's defect report becomes the evidence the submission needs.
 */

export interface TaskWorkspaceProps {
  locale: string;
  task: LearningTask;
  attempt: AttemptState | null;
  draft: DraftState | null;
  courseHref: string;
}

export function TaskWorkspace({ locale, task, attempt, draft, courseHref }: TaskWorkspaceProps) {
  const s = learnStrings(locale).task;
  const router = useRouter();

  const isPractice = task.targetUrl !== null;
  const readOnly = isAttemptLocked(attempt?.state);
  const canEdit = attempt !== null && !readOnly;

  const [answerText, setAnswerText] = useState(draft?.answerText ?? "");
  const [selectedOptionIds, setSelectedOptionIds] = useState<string[]>(
    draft?.selectedOptionIds ?? []
  );
  const [defect, setDefect] = useState<DefectReport>(draft?.defect ?? EMPTY_DEFECT);
  const [revealedHintIds, setRevealedHintIds] = useState<string[]>(draft?.usedHintIds ?? []);

  const [activeTab, setActiveTab] = useState<"task" | "answer">("task");
  const [showErrors, setShowErrors] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [starting, setStarting] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const elapsedRef = useElapsedSeconds(attempt?.elapsedSeconds ?? 0, canEdit);

  // `save_attempt_draft` bumps the *attempt's* row_version too, so the value
  // `submit_attempt` needs is the one the last save returned — not the one the
  // page was rendered with. Sending a stale version would hang (ISSUES.md I-009).
  const attemptVersionRef = useRef(attempt?.rowVersion ?? 0);

  // The 20s autosave tick and the blur handlers both need the *current* form
  // values without re-creating the callback on every keystroke. Written in an
  // effect, never during render — the interval always reads it long afterwards.
  const stateRef = useRef({ answerText, selectedOptionIds, defect, revealedHintIds });
  useEffect(() => {
    stateRef.current = { answerText, selectedOptionIds, defect, revealedHintIds };
  }, [answerText, selectedOptionIds, defect, revealedHintIds]);

  const getPayload = useCallback(
    () => ({
      answerText: stateRef.current.answerText,
      selectedOptionIds: stateRef.current.selectedOptionIds,
      usedHintIds: stateRef.current.revealedHintIds,
      defect: isPractice ? stateRef.current.defect : null,
      elapsedSeconds: elapsedRef.current,
    }),
    [isPractice, elapsedRef]
  );

  const save = useCallback(
    async (input: {
      attemptId: string;
      answerText: string;
      selectedOptionIds: string[];
      usedHintIds: string[];
      defect: DefectReport | null;
      elapsedSeconds: number;
      expectedDraftVersion: number;
    }) => {
      const result = await saveDraftAction({ locale, ...input });
      if (result.ok) attemptVersionRef.current = result.data.attemptVersion;
      return result;
    },
    [locale]
  );

  const autosave = useAutosave({
    attemptId: attempt?.id ?? null,
    initialVersion: draft?.version ?? 0,
    initialSavedAt: draft?.updatedAt ?? null,
    readOnly,
    getPayload,
    save,
  });

  const { markDirty, flush, flushIfDirty } = autosave;

  const edit = useCallback(
    (apply: () => void) => {
      apply();
      markDirty();
    },
    [markDirty]
  );

  /* ── Actions ──────────────────────────────────────────────────────────── */

  const onStart = async () => {
    if (!task.enrollmentId) return;
    setStarting(true);
    const result = await startAttemptAction({
      locale,
      taskId: task.id,
      enrollmentId: task.enrollmentId,
    });
    setStarting(false);
    if (!result.ok) {
      setFormError(result.error.message);
      return;
    }
    // Re-render from the server so the draft row version is the real one.
    router.refresh();
  };

  /**
   * Record first, reveal second. The id is pushed into the save explicitly
   * rather than into state, so a failed save leaves the hint hidden — a learner
   * whose connection drops mid-reveal does not get an unrecorded hint.
   */
  const onRevealHint = async (hintId: string) => {
    const next = [...revealedHintIds, hintId];
    const result = await flush({ usedHintIds: next });
    if (result && !result.ok) {
      setFormError(result.error.message);
      return false;
    }
    setRevealedHintIds(next);
    return true;
  };

  const validation = useMemo(() => {
    if (task.assessment && task.assessment.options.length > 0 && selectedOptionIds.length === 0) {
      return s.validationOption;
    }
    if (isPractice) {
      return isDefectComplete(defect) ? null : s.validationDefect;
    }
    return answerText.trim().length > 0 ? null : s.validationAnswer;
  }, [task.assessment, selectedOptionIds, isPractice, defect, answerText, s]);

  /**
   * The four steps of a task, each derived from state we actually hold.
   *
   * Deliberately not modelling "watched the video" or "read the script": there
   * is no persistence behind either, so those rows could only ever guess. A
   * checklist that guesses is worse than a shorter one that does not — the
   * learner stops trusting every row once one of them is wrong.
   */
  const steps = useMemo<Step[]>(() => {
    const state = attempt?.state;

    /**
     * How far along this attempt is, as a single monotonic index.
     *
     * Deriving each row from its own independent boolean looked simpler but
     * produced impossible lists: an *accepted* attempt is read-only, so the
     * form fields are empty and the `validation` gate reported "answer not
     * written" — giving a checklist where step 2 was still in progress while
     * steps 3 and 4 were already done. One index cannot contradict itself.
     *
     * `revision_required` deliberately falls back to 1. The trainer has sent it
     * back, so the answer genuinely is the open step again; the status badge
     * beside it carries the "revision required" meaning.
     */
    const reached =
      attempt === null
        ? 0
        : state === "accepted"
          ? 4
          : state === "submitted" || state === "resubmitted"
            ? 3
            : state === "revision_required"
              ? 1
              : validation === null
                ? 2
                : 1;

    return [
      { id: "started", label: s.stepStarted, hint: s.stepStartedHint },
      { id: "answer", label: s.stepAnswer, hint: s.stepAnswerHint },
      { id: "submitted", label: s.stepSubmitted, hint: s.stepSubmittedHint },
      { id: "reviewed", label: s.stepReviewed, hint: s.stepReviewedHint },
    ].map((row, i) => ({
      ...row,
      // Everything before the index is done, the row at it is where you are,
      // everything after is still ahead. At most one "current", always.
      state: i < reached ? "done" : i === reached ? "current" : "pending",
    }));
  }, [attempt, validation, s]);

  const onRequestSubmit = () => {
    setShowErrors(true);
    setFormError(null);
    if (validation) {
      setFormError(validation);
      setActiveTab("answer");
      return;
    }
    setConfirmOpen(true);
  };

  const onConfirmSubmit = async () => {
    if (!attempt) return;
    setSubmitting(true);
    setFormError(null);

    // Persist first: whatever happens next, the learner's work is on the server,
    // and this refreshes the attempt version submit_attempt needs.
    const saved = await flush();
    if (saved && !saved.ok) {
      setSubmitting(false);
      setConfirmOpen(false);
      setFormError(saved.error.message);
      return;
    }

    const result = await submitAttemptAction({
      locale,
      taskId: task.id,
      attemptId: attempt.id,
      answerText: isPractice ? formatDefectReport(defect, answerText, s) : answerText,
      selectedOptionIds,
      expectedVersion: attemptVersionRef.current,
      evidence: isPractice
        ? { title: defect.summary, sourceUri: defect.sourceUri }
        : null,
    });

    setSubmitting(false);
    setConfirmOpen(false);

    if (!result.ok) {
      setFormError(
        // ⚠️ `EVIDENCE_URI` before the generic `22023`. The evidence RPC
        // requires `^https://`, and the defect form prefills the sandbox URL —
        // so on a deployment served over plain HTTP every hunt report was
        // refused with "fill in the defect report", on a form that was already
        // full. Naming the actual problem is the difference between a learner
        // fixing it in five seconds and filing a support ticket.
        result.error.code === "EVIDENCE_URI"
          ? s.errorEvidenceUri
          : result.error.code === "22023"
            ? s.errorEvidence
            : result.error.code === "CONFLICT"
              ? s.errorConflict
            : result.error.message || s.errorSubmit
      );
      return;
    }
    router.refresh();
  };

  /* ── Pieces ───────────────────────────────────────────────────────────── */

  const saveIndicator = (() => {
    if (readOnly || !attempt) return null;
    const label =
      autosave.state === "saving"
        ? s.saveStateSaving
        : autosave.state === "error"
          ? s.saveStateError
          : autosave.state === "dirty"
            ? s.saveStateUnsaved
            : autosave.lastSavedAt
              ? format(s.saveState, { time: formatTime(autosave.lastSavedAt, locale) })
              : "";
    if (!label) return null;
    return (
      <p
        aria-live="polite"
        className={cn(
          "text-[13px] leading-5",
          autosave.state === "error" ? "text-(--color-danger)" : "text-(--color-fg-muted)"
        )}
      >
        {label}
      </p>
    );
  })();

  const assessment = task.assessment;
  const assessmentBlock = assessment && assessment.options.length > 0 && (
    <fieldset className="flex flex-col gap-3" disabled={!canEdit}>
      <legend className="mb-1 flex flex-col gap-1">
        <span className="text-[18px] font-semibold leading-6">{s.assessmentTitle}</span>
        <span className="text-[13px] leading-5 text-(--color-fg-muted)">
          {assessment.multiple ? s.assessmentMultiple : s.assessmentSingle}
        </span>
      </legend>
      <p className="text-[15px] leading-6">{assessment.question}</p>
      <div className="flex flex-col gap-2">
        {assessment.options.map((option) => {
          const checked = selectedOptionIds.includes(option.id);
          return (
            <label
              key={option.id}
              className={cn(
                "flex min-h-11 cursor-pointer items-center gap-3 rounded-(--radius-md) border px-3 py-2",
                "transition-colors duration-(--duration-fast)",
                checked
                  ? "border-(--color-brand) bg-(--color-brand-soft)"
                  : "border-(--color-border-strong) hover:bg-(--color-surface)",
                !canEdit && "cursor-default opacity-80"
              )}
            >
              <input
                type={assessment.multiple ? "checkbox" : "radio"}
                name="assessment"
                className="size-4 accent-(--color-brand)"
                checked={checked}
                disabled={!canEdit}
                onChange={() =>
                  edit(() =>
                    setSelectedOptionIds((current) => {
                      if (!assessment.multiple) return [option.id];
                      return current.includes(option.id)
                        ? current.filter((id) => id !== option.id)
                        : [...current, option.id];
                    })
                  )
                }
                onBlur={flushIfDirty}
              />
              <span className="text-[15px] leading-6">{option.label}</span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );

  const answerPanel = (
    <div className="flex flex-col gap-5">
      {readOnly && attempt && (
        <div className="flex items-start gap-3 rounded-(--radius-md) border border-(--color-info) bg-(--color-info-soft) px-4 py-3">
          <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-(--color-info)" aria-hidden />
          <div className="flex flex-col gap-0.5">
            <p className="text-[15px] font-semibold leading-6">
              {attempt.state === "accepted" ? s.acceptedTitle : s.submittedTitle}
            </p>
            <p className="text-[13px] leading-5 text-(--color-fg-muted)">
              {attempt.state === "accepted" ? s.acceptedDescription : s.submittedDescription}
            </p>
          </div>
        </div>
      )}

      {attempt?.state === "revision_required" && (
        <div className="flex items-start gap-3 rounded-(--radius-md) border border-(--color-warning) bg-(--color-warning-soft) px-4 py-3">
          <CircleAlert className="mt-0.5 size-5 shrink-0 text-(--color-warning)" aria-hidden />
          <div className="flex flex-col gap-0.5">
            <p className="text-[15px] font-semibold leading-6">{s.revisionTitle}</p>
            <p className="text-[13px] leading-5 text-(--color-fg-muted)">{s.revisionDescription}</p>
          </div>
        </div>
      )}

      {assessmentBlock}

      {isPractice && (
        <section className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <CardTitle>{s.defectTitle}</CardTitle>
            <p className="text-[13px] leading-5 text-(--color-fg-muted)">{s.defectDescription}</p>
          </div>
          <DefectForm
            value={defect}
            onChange={(next) => edit(() => setDefect(next))}
            onBlur={flushIfDirty}
            disabled={!canEdit}
            showErrors={showErrors}
            strings={s}
          />
        </section>
      )}

      <Field
        label={s.answerLabel}
        hint={s.answerHint}
        error={showErrors && !isPractice && answerText.trim().length === 0 ? s.validationAnswer : ""}
        required={!isPractice}
      >
        <Textarea
          rows={isPractice ? 4 : 10}
          value={answerText}
          disabled={!canEdit}
          placeholder={s.answerPlaceholder}
          onChange={(event) => edit(() => setAnswerText(event.target.value))}
          onBlur={flushIfDirty}
        />
      </Field>

      {formError && (
        <p role="alert" className="text-[13px] leading-5 text-(--color-danger)">
          {formError}
        </p>
      )}

      {canEdit && (
        <div className="hidden flex-col gap-2 lg:flex">
          {saveIndicator}
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={() => void flush()}
              iconLeft={<Save className="size-4" aria-hidden />}
            >
              {s.saveNow}
            </Button>
            <Button fullWidth onClick={onRequestSubmit} disabled={submitting}>
              {attempt?.state === "revision_required" ? s.resubmit : s.submit}
            </Button>
          </div>
        </div>
      )}
    </div>
  );

  /* ── Gates before the workspace itself ────────────────────────────────── */

  if (task.access !== "available") {
    return (
      <Card className="flex flex-col items-center gap-3 py-12 text-center">
        <Lock className="size-8 text-(--color-fg-subtle)" aria-hidden />
        <CardTitle>{s.lockedTitle}</CardTitle>
        <p className="max-w-prose text-[13px] leading-5 text-(--color-fg-muted)">
          {s.lockedDescription}
        </p>
        <Button variant="outline" onClick={() => router.push(courseHref as Route)}>
          {s.backToCourse}
        </Button>
      </Card>
    );
  }

  /* ── The screen ───────────────────────────────────────────────────────── */

  return (
    <div className="flex flex-col gap-6">
      {/* Mobile tabs. Below lg the two halves cannot both fit, and a 375px
          two-column layout is worse than an honest switch. */}
      <div
        role="tablist"
        aria-label={s.breadcrumb}
        className="flex gap-1 rounded-(--radius-md) bg-(--color-surface-2) p-1 lg:hidden"
      >
        {(["task", "answer"] as const).map((tab) => (
          <button
            key={tab}
            role="tab"
            type="button"
            aria-selected={activeTab === tab}
            onClick={() => setActiveTab(tab)}
            className={cn(
              "min-h-11 flex-1 rounded-(--radius-sm) text-[15px] font-semibold",
              "transition-colors duration-(--duration-fast)",
              activeTab === tab
                ? "bg-(--color-bg) text-(--color-fg) shadow-(--shadow-sm)"
                : "text-(--color-fg-muted)"
            )}
          >
            {tab === "task" ? s.tabTask : s.tabAnswer}
          </button>
        ))}
      </div>

      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_400px] lg:items-start lg:gap-8">
        {/* ── Left: the task ────────────────────────────────────────────── */}
        <section
          className={cn(
            "flex flex-col gap-6",
            activeTab === "task" ? "flex" : "hidden lg:flex"
          )}
        >
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={isPractice ? "brand" : "info"}>
                {isPractice ? s.typePractice : s.typeTheory}
              </Badge>
              {attempt && <StatusBadge state={attempt.state} locale={locale} />}
              {attempt && attempt.sequenceNumber > 0 && (
                <span className="text-[11px] font-semibold uppercase tracking-[0.04em] text-(--color-fg-muted)">
                  {format(s.attempt, { number: attempt.sequenceNumber })}
                </span>
              )}
            </div>
            <div className="max-w-[68ch] whitespace-pre-line text-[15px] leading-6">
              {task.instructions}
            </div>
          </div>

          {/* Workflow B — "Intro-Video ansehen" leads into the scenario. */}
          {task.introVideoUrl && (
            <VideoEmbed url={task.introVideoUrl} title={task.title} intro />
          )}

          {/* Workflow A — "Video ansehen" then "PDF-Skript lesen". */}
          {task.videoUrl && <VideoEmbed url={task.videoUrl} title={task.title} />}

          {task.documentUrl && (
            /* Material row: a tinted type tile, the name with its format
               underneath, and the action as a pill on the right. The tile makes
               the file type identifiable before the label is read. */
            <div className="flex flex-col gap-2">
              <SectionLabel>{s.materialsTitle}</SectionLabel>
              <a
                href={task.documentUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="group flex items-center gap-3 rounded-(--radius-lg) border border-(--color-border) bg-(--color-bg) p-3 transition-colors hover:border-(--color-border-strong) hover:bg-(--color-surface)"
              >
                <span
                  aria-hidden
                  className="flex size-10 shrink-0 items-center justify-center rounded-(--radius-md) bg-(--color-danger-soft) text-(--color-danger)"
                >
                  <FileText className="size-5" />
                </span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-[14px] font-semibold leading-5">
                    {s.documentOpen}
                  </span>
                  <span className="text-[12.5px] leading-5 text-(--color-fg-muted)">PDF</span>
                </span>
                <span className="flex min-h-9 shrink-0 items-center gap-1.5 rounded-full border border-(--color-border) px-3 text-[13px] font-semibold transition-colors group-hover:border-(--color-brand) group-hover:text-(--color-brand)">
                  {s.materialOpen}
                  <ExternalLink className="size-3.5" aria-hidden />
                </span>
              </a>
            </div>
          )}

          {isPractice && task.targetUrl && <IframePanel src={task.targetUrl} strings={s} />}

          <Card className="flex flex-col gap-3">
            <CardTitle>{s.hintsTitle}</CardTitle>
            <HintCascade
              hints={task.hints}
              revealedIds={revealedHintIds}
              onReveal={onRevealHint}
              disabled={!canEdit}
              strings={s}
            />
          </Card>

          <div className="flex flex-wrap items-center gap-3">
            <Link
              href={`/${locale}/learn/questions/new?taskId=${task.id}` as Route}
              className="inline-flex min-h-11 items-center gap-2 text-[15px] font-semibold text-(--color-brand) hover:underline"
            >
              <MessageCircleQuestion className="size-4" aria-hidden />
              {s.askQuestion}
            </Link>
          </div>
        </section>

        {/* ── Right: the answer ─────────────────────────────────────────── */}
        <aside
          className={cn(
            "flex-col gap-4 lg:sticky lg:top-[calc(var(--header-height)+16px)]",
            activeTab === "answer" ? "flex" : "hidden lg:flex"
          )}
        >
          {/* Where the learner is on this task, before the form itself. Steps
              are derived from real attempt state — see the `steps` memo. */}
          <Card className="flex flex-col gap-3">
            <SectionLabel>{s.stepsTitle}</SectionLabel>
            <StepList steps={steps} label={s.stepsTitle} />
          </Card>

          {attempt === null ? (
            <Card className="flex flex-col gap-3">
              <CardTitle>{s.notStartedTitle}</CardTitle>
              <p className="text-[13px] leading-5 text-(--color-fg-muted)">
                {s.notStartedDescription}
              </p>
              {formError && (
                <p role="alert" className="text-[13px] leading-5 text-(--color-danger)">
                  {formError}
                </p>
              )}
              <Button fullWidth loading={starting} onClick={onStart} disabled={!task.enrollmentId}>
                {s.start}
              </Button>
            </Card>
          ) : (
            <Card className="flex flex-col gap-4">
              <CardTitle>{s.answerTitle}</CardTitle>
              {answerPanel}
              {readOnly && (
                <p className="text-[13px] leading-5 text-(--color-fg-muted)">
                  {s.submittedReadOnly}
                </p>
              )}
            </Card>
          )}

          <Link
            href={courseHref as Route}
            className="inline-flex min-h-11 items-center gap-2 text-[15px] font-semibold text-(--color-fg-muted) hover:text-(--color-brand)"
          >
            <ArrowLeft className="size-4" aria-hidden />
            {s.backToCourse}
          </Link>
        </aside>
      </div>

      {/* Sticky mobile submit bar — the primary action must never be scrolled
          off a 375px screen. Sits above the tab bar's safe area. */}
      {canEdit && (
        <div className="fixed inset-x-0 bottom-[calc(var(--tabbar-height)+env(safe-area-inset-bottom))] z-30 border-t border-(--color-border) bg-[color-mix(in_srgb,var(--color-bg)_95%,transparent)] px-4 py-3 backdrop-blur lg:hidden">
          <div className="mx-auto flex max-w-(--content-max) items-center gap-3">
            <div className="min-w-0 flex-1">{saveIndicator}</div>
            <Button onClick={onRequestSubmit} disabled={submitting}>
              {attempt?.state === "revision_required" ? s.resubmit : s.submit}
            </Button>
          </div>
        </div>
      )}
      {canEdit && <div className="h-16 lg:hidden" aria-hidden />}

      <ConfirmDialog
        open={confirmOpen}
        title={s.confirmTitle}
        description={s.confirmDescription}
        confirmLabel={s.confirmAction}
        cancelLabel={s.confirmCancel}
        busy={submitting}
        onConfirm={onConfirmSubmit}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  );
}
