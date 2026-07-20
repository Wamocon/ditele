"use client";

import { useEffect, useRef, useState } from "react";

import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Field, Input, Textarea } from "@/shared/ui/field";
import { StatePanel } from "@/shared/ui/state-panel";

import {
  isAttemptEditable,
  type AttemptDetail,
  type EvidenceRef,
  type SaveAttemptDraftInput,
  type SubmitAttemptInput,
} from "../model/attempt";
import type { CreateExternalEvidenceInput } from "../model/external-evidence";
import { taskText, type LearnerTask, type TaskLocale } from "../model/task";
import styles from "./task-workspace.module.css";

const AUTOSAVE_DELAY_MS = 800;
const DURATION_CHECKPOINT_MS = 30_000;

interface TaskWorkspaceProps {
  task: LearnerTask;
  locale: TaskLocale;
  labels: TaskWorkspaceLabels;
  initialAttempt?: AttemptDetail;
  saveDraft(input: SaveAttemptDraftInput): Promise<AttemptDetail>;
  submit(input: SubmitAttemptInput): Promise<AttemptDetail>;
  addEvidence?(input: CreateExternalEvidenceInput): Promise<EvidenceRef>;
}

export interface TaskWorkspaceLabels {
  beforeVideo: string;
  openLearningVideo: string;
  testingTarget: string;
  openTestingTarget: string;
  optionalHint: string;
  revealHint: string;
  unavailableTitle: string;
  unavailableDescription: string;
  errorTitle: string;
  writtenAnswer: string;
  evidence: string;
  noEvidence: string;
  addEvidence: string;
  evidenceTitle: string;
  evidenceTitlePlaceholder: string;
  evidenceUrl: string;
  evidenceUrlPlaceholder: string;
  evidenceTitleRequired: string;
  evidenceUrlRequired: string;
  evidenceUrlInvalid: string;
  savingDraft: string;
  draftSaved: string;
  unsavedChanges: string;
  retryDraft: string;
  submitting: string;
  submitForReview: string;
  trainerFeedback: string;
  decision: string;
  reviewHistory: string;
  openAfterTaskVideo: string;
  saveFailed: string;
  submissionFailed: string;
  answerRequired: string;
  evidenceUploadFailed: string;
  attemptStates: Record<AttemptDetail["state"], string>;
  reviewDecisions: Record<"accepted" | "revision_required", string>;
}

type MutationState =
  | "idle"
  | "dirty"
  | "saving"
  | "saved"
  | "submitting"
  | "error";

type WorkspaceError = {
  kind: "evidence" | "save" | "submission" | "validation";
  message: string;
};

type EvidenceValidationError = "title" | "url_required" | "url_invalid";

type MutableDraft = Pick<
  SaveAttemptDraftInput,
  "answerText" | "evidence" | "selectedAnswerIds" | "usedHintIds"
>;

type DurationAnchor = {
  baseSeconds: number;
  startedAtMs: number | null;
};

function createIdempotencyKey(prefix: string): string {
  const uniquePart =
    globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
  return `${prefix}-${uniquePart}`;
}

function currentTimestamp(): number {
  return Date.now();
}

function initialMutableDraft(initialAttempt?: AttemptDetail): MutableDraft {
  return {
    answerText: initialAttempt?.answerText ?? "",
    selectedAnswerIds: [...(initialAttempt?.selectedAnswerIds ?? [])],
    evidence: initialAttempt?.evidence.map((item) => ({ ...item })) ?? [],
    usedHintIds:
      initialAttempt?.hintUsage.map((usage) => usage.hintId) ?? [],
  };
}

export function TaskWorkspace({
  task,
  locale,
  labels,
  initialAttempt,
  saveDraft,
  submit,
  addEvidence,
}: TaskWorkspaceProps) {
  const [attempt, setAttempt] = useState(initialAttempt);
  const [answerText, setAnswerText] = useState(
    () => initialAttempt?.answerText ?? "",
  );
  const [selectedAnswerIds, setSelectedAnswerIds] = useState<string[]>(
    () => [...(initialAttempt?.selectedAnswerIds ?? [])],
  );
  const [evidence, setEvidence] = useState<EvidenceRef[]>(
    () => initialAttempt?.evidence.map((item) => ({ ...item })) ?? [],
  );
  const [hintVisible, setHintVisible] = useState(false);
  const [mutationState, setMutationState] =
    useState<MutationState>("idle");
  const [workspaceError, setWorkspaceError] =
    useState<WorkspaceError | null>(null);
  const [dirty, setDirty] = useState(false);
  const [addingEvidence, setAddingEvidence] = useState(false);
  const [evidenceTitle, setEvidenceTitle] = useState("");
  const [evidenceUrl, setEvidenceUrl] = useState("");
  const [evidenceValidationError, setEvidenceValidationError] =
    useState<EvidenceValidationError | null>(null);

  const attemptRef = useRef(initialAttempt);
  const draftRef = useRef<MutableDraft>(initialMutableDraft(initialAttempt));
  const draftVersionRef = useRef(initialAttempt?.draftVersion ?? 0);
  const durationAnchorRef = useRef<DurationAnchor>({
    baseSeconds: initialAttempt?.solvingDurationSeconds ?? 0,
    startedAtMs: null,
  });
  const dirtyRevisionRef = useRef(0);
  const persistedRevisionRef = useRef(0);
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveLoopRef = useRef<Promise<AttemptDetail | undefined> | null>(null);
  const flushDraftRef =
    useRef<(() => Promise<AttemptDetail | undefined>) | null>(null);
  const pendingEvidenceRef = useRef<Promise<boolean> | null>(null);
  const draftKey = useRef<string | null>(null);
  const submissionKey = useRef<string | null>(null);
  const pendingSubmissionRef = useRef<SubmitAttemptInput | null>(null);
  const evidenceKey = useRef<string | null>(null);
  const submittingRef = useRef(false);
  const mountedRef = useRef(false);

  function canEditCurrentAttempt(): boolean {
    const currentAttempt = attemptRef.current;
    return (
      pendingSubmissionRef.current === null &&
      task.access === "available" &&
      (!currentAttempt || isAttemptEditable(currentAttempt.state))
    );
  }

  function currentDuration(capturedAtMs: number): number {
    const anchor = durationAnchorRef.current;
    if (anchor.startedAtMs === null) return anchor.baseSeconds;
    return (
      anchor.baseSeconds +
      Math.max(0, Math.floor((capturedAtMs - anchor.startedAtMs) / 1000))
    );
  }

  function clearAutosaveTimer(): void {
    if (autosaveTimerRef.current === null) return;
    clearTimeout(autosaveTimerRef.current);
    autosaveTimerRef.current = null;
  }

  function scheduleAutosave(): void {
    if (!canEditCurrentAttempt() || submittingRef.current) return;
    clearAutosaveTimer();
    autosaveTimerRef.current = setTimeout(() => {
      autosaveTimerRef.current = null;
      void flushDraftRef.current?.().catch(() => undefined);
    }, AUTOSAVE_DELAY_MS);
  }

  function markDraftDirty(options?: {
    allowDuringSubmission?: boolean;
    schedule?: boolean;
  }): void {
    if (
      !canEditCurrentAttempt() ||
      (submittingRef.current && !options?.allowDuringSubmission)
    ) {
      return;
    }
    dirtyRevisionRef.current += 1;
    if (mountedRef.current) {
      setDirty(true);
      setMutationState((current) =>
        current === "saving" || current === "submitting" ? current : "dirty",
      );
    }
    if (options?.schedule !== false && !submittingRef.current) {
      scheduleAutosave();
    }
  }

  function buildDraftInput(capturedAtMs: number): SaveAttemptDraftInput {
    const currentAttempt = attemptRef.current;
    const currentDraft = draftRef.current;
    return {
      taskId: task.id,
      groupId: task.groupId,
      taskVersionId: `${task.id}:${task.version}`,
      ...(currentAttempt ? { attemptId: currentAttempt.id } : {}),
      expectedVersion: draftVersionRef.current,
      answerText: currentDraft.answerText,
      selectedAnswerIds: [...currentDraft.selectedAnswerIds],
      evidence: currentDraft.evidence.map((item) => ({ ...item })),
      usedHintIds: [...currentDraft.usedHintIds],
      solvingDurationSeconds: currentDuration(capturedAtMs),
      idempotencyKey: (draftKey.current ??= createIdempotencyKey("draft")),
    };
  }

  async function runSaveLoop(): Promise<AttemptDetail | undefined> {
    let latestAttempt = attemptRef.current;
    while (
      mountedRef.current &&
      canEditCurrentAttempt() &&
      persistedRevisionRef.current < dirtyRevisionRef.current
    ) {
      const revisionBeingSaved = dirtyRevisionRef.current;
      const capturedAtMs = currentTimestamp();
      const input = buildDraftInput(capturedAtMs);
      setMutationState(submittingRef.current ? "submitting" : "saving");
      setWorkspaceError((current) =>
        current?.kind === "save" ? null : current,
      );

      let saved: AttemptDetail;
      try {
        saved = await saveDraft(input);
      } catch (error) {
        if (mountedRef.current) {
          setDirty(true);
          setMutationState("error");
          setWorkspaceError({ kind: "save", message: labels.saveFailed });
        }
        throw error;
      }

      latestAttempt = saved;
      attemptRef.current = saved;
      draftVersionRef.current =
        saved.draftVersion ?? input.expectedVersion + 1;
      durationAnchorRef.current = {
        baseSeconds: Math.max(
          saved.solvingDurationSeconds,
          input.solvingDurationSeconds,
        ),
        startedAtMs: capturedAtMs,
      };
      persistedRevisionRef.current = revisionBeingSaved;
      draftKey.current = createIdempotencyKey("draft");
      if (mountedRef.current) setAttempt(saved);
    }

    if (
      mountedRef.current &&
      persistedRevisionRef.current >= dirtyRevisionRef.current
    ) {
      setDirty(false);
      setMutationState(submittingRef.current ? "submitting" : "saved");
      setWorkspaceError((current) =>
        current?.kind === "save" ? null : current,
      );
    }
    return latestAttempt;
  }

  function flushDraft(): Promise<AttemptDetail | undefined> {
    clearAutosaveTimer();
    if (!canEditCurrentAttempt()) {
      return Promise.resolve(attemptRef.current);
    }
    if (persistedRevisionRef.current >= dirtyRevisionRef.current) {
      return Promise.resolve(attemptRef.current);
    }
    if (saveLoopRef.current) return saveLoopRef.current;

    const operation = runSaveLoop();
    saveLoopRef.current = operation;
    const clearOperation = () => {
      if (saveLoopRef.current === operation) saveLoopRef.current = null;
    };
    void operation.then(clearOperation, clearOperation);
    return operation;
  }

  useEffect(() => {
    flushDraftRef.current = flushDraft;
  });

  useEffect(() => {
    mountedRef.current = true;
    durationAnchorRef.current.startedAtMs = currentTimestamp();
    const checkpointTimer = setInterval(() => {
      if (!canEditCurrentAttempt() || submittingRef.current) return;
      markDraftDirty({ schedule: false });
      void flushDraftRef.current?.().catch(() => undefined);
    }, DURATION_CHECKPOINT_MS);

    return () => {
      mountedRef.current = false;
      clearAutosaveTimer();
      clearInterval(checkpointTimer);
    };
    // This mount-scoped timer calls the latest flush function through a ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!dirty) return;
    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warnBeforeUnload);
    return () => window.removeEventListener("beforeunload", warnBeforeUnload);
  }, [dirty]);

  const attemptEditable =
    task.access === "available" &&
    (!attempt || isAttemptEditable(attempt.state));
  const interactionDisabled =
    !attemptEditable ||
    mutationState === "submitting" ||
    workspaceError?.kind === "submission";

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submittingRef.current) return;

    const pendingSubmission = pendingSubmissionRef.current;
    if (pendingSubmission) {
      submittingRef.current = true;
      setMutationState("submitting");
      setWorkspaceError(null);
      try {
        const submitted = await submit(pendingSubmission);
        attemptRef.current = submitted;
        pendingSubmissionRef.current = null;
        setAttempt(submitted);
        persistedRevisionRef.current = dirtyRevisionRef.current;
        setDirty(false);
        setMutationState("saved");
        submissionKey.current = createIdempotencyKey("submission");
      } catch {
        setMutationState("error");
        setWorkspaceError({
          kind: "submission",
          message: labels.submissionFailed,
        });
      } finally {
        submittingRef.current = false;
      }
      return;
    }

    if (!canEditCurrentAttempt()) return;

    const answer = draftRef.current;
    if (
      answer.answerText.trim().length === 0 &&
      answer.selectedAnswerIds.length === 0
    ) {
      setWorkspaceError({
        kind: "validation",
        message: labels.answerRequired,
      });
      return;
    }

    submittingRef.current = true;
    clearAutosaveTimer();
    setMutationState("submitting");
    setWorkspaceError(null);
    let submissionStarted = false;

    try {
      const evidenceReady = await (pendingEvidenceRef.current ??
        Promise.resolve(true));
      if (!evidenceReady) return;

      // Capture the final elapsed-time boundary even when the learner submits
      // a previously saved answer without changing another field.
      markDraftDirty({ allowDuringSubmission: true, schedule: false });
      const saved = await flushDraft();
      if (!saved) {
        setDirty(true);
        setMutationState("error");
        setWorkspaceError({ kind: "save", message: labels.saveFailed });
        return;
      }

      const finalDraft = draftRef.current;
      setMutationState("submitting");
      submissionStarted = true;
      const submissionInput: SubmitAttemptInput = {
        taskId: task.id,
        groupId: task.groupId,
        taskVersionId: `${task.id}:${task.version}`,
        attemptId: saved.id,
        expectedVersion: saved.version,
        answerText: finalDraft.answerText,
        selectedAnswerIds: [...finalDraft.selectedAnswerIds],
        evidence: finalDraft.evidence.map((item) => ({ ...item })),
        usedHintIds: [...finalDraft.usedHintIds],
        solvingDurationSeconds: saved.solvingDurationSeconds,
        idempotencyKey: (submissionKey.current ??=
          createIdempotencyKey("submission")),
      };
      pendingSubmissionRef.current = submissionInput;
      const submitted = await submit(submissionInput);
      attemptRef.current = submitted;
      pendingSubmissionRef.current = null;
      setAttempt(submitted);
      persistedRevisionRef.current = dirtyRevisionRef.current;
      setDirty(false);
      setMutationState("saved");
      setWorkspaceError(null);
      submissionKey.current = createIdempotencyKey("submission");
    } catch {
      if (submissionStarted) {
        setMutationState("error");
        setWorkspaceError({
          kind: "submission",
          message: labels.submissionFailed,
        });
      }
    } finally {
      submittingRef.current = false;
    }
  }

  function handleAnswerChange(value: string): void {
    if (!canEditCurrentAttempt() || submittingRef.current) return;
    draftRef.current = { ...draftRef.current, answerText: value };
    setAnswerText(value);
    setWorkspaceError((current) =>
      current?.kind === "validation" || current?.kind === "submission"
        ? null
        : current,
    );
    markDraftDirty();
  }

  function toggleAnswer(answerId: string): void {
    if (!canEditCurrentAttempt() || submittingRef.current) return;
    const current = draftRef.current.selectedAnswerIds;
    const next =
      task.assessment?.selectionMode === "single"
        ? [answerId]
        : current.includes(answerId)
          ? current.filter((id) => id !== answerId)
          : [...current, answerId];
    draftRef.current = { ...draftRef.current, selectedAnswerIds: next };
    setSelectedAnswerIds(next);
    setWorkspaceError((currentError) =>
      currentError?.kind === "validation" ||
      currentError?.kind === "submission"
        ? null
        : currentError,
    );
    markDraftDirty();
  }

  function revealHint(): void {
    if (!canEditCurrentAttempt() || submittingRef.current) return;
    const hintId = task.hintId ?? "primary";
    setHintVisible(true);
    if (draftRef.current.usedHintIds.includes(hintId)) return;
    const next = [...draftRef.current.usedHintIds, hintId];
    draftRef.current = { ...draftRef.current, usedHintIds: next };
    markDraftDirty();
  }

  async function handleAddEvidence(): Promise<void> {
    if (
      !addEvidence ||
      !canEditCurrentAttempt() ||
      submittingRef.current ||
      pendingEvidenceRef.current
    ) {
      return;
    }

    const title = evidenceTitle.trim();
    if (title.length === 0) {
      setEvidenceValidationError("title");
      return;
    }
    let sourceUri: string;
    try {
      const parsedUrl = new URL(evidenceUrl.trim());
      if (
        parsedUrl.protocol !== "https:" ||
        parsedUrl.username.length > 0 ||
        parsedUrl.password.length > 0
      ) {
        throw new Error("invalid evidence URL");
      }
      sourceUri = parsedUrl.toString();
    } catch {
      setEvidenceValidationError(
        evidenceUrl.trim().length === 0 ? "url_required" : "url_invalid",
      );
      return;
    }

    setAddingEvidence(true);
    setEvidenceValidationError(null);
    setWorkspaceError((current) =>
      current?.kind === "evidence" ? null : current,
    );
    const operation = (async (): Promise<boolean> => {
      try {
        const newEvidence = await addEvidence({
          ...(attemptRef.current
            ? { attemptId: attemptRef.current.id }
            : {}),
          title,
          sourceUri,
          idempotencyKey: (evidenceKey.current ??=
            createIdempotencyKey("evidence")),
        });
        if (!mountedRef.current || !canEditCurrentAttempt()) return false;
        if (
          draftRef.current.evidence.some((item) => item.id === newEvidence.id)
        ) {
          return true;
        }
        const next = [
          ...draftRef.current.evidence,
          { ...newEvidence } as EvidenceRef,
        ];
        draftRef.current = { ...draftRef.current, evidence: next };
        setEvidence(next);
        setEvidenceTitle("");
        setEvidenceUrl("");
        evidenceKey.current = createIdempotencyKey("evidence");
        markDraftDirty({
          allowDuringSubmission: true,
          schedule: !submittingRef.current,
        });
        return true;
      } catch {
        if (mountedRef.current) {
          setMutationState("error");
          setWorkspaceError({
            kind: "evidence",
            message: labels.evidenceUploadFailed,
          });
        }
        return false;
      } finally {
        if (mountedRef.current) setAddingEvidence(false);
      }
    })();
    pendingEvidenceRef.current = operation;
    await operation;
    if (pendingEvidenceRef.current === operation) {
      pendingEvidenceRef.current = null;
    }
  }

  function handleEvidenceKeyDown(
    event: React.KeyboardEvent<HTMLInputElement>,
  ): void {
    if (event.key !== "Enter") return;
    event.preventDefault();
    void handleAddEvidence();
  }

  const statusMessage =
    mutationState === "saving"
      ? labels.savingDraft
      : mutationState === "saved" && attemptEditable
        ? labels.draftSaved
        : mutationState === "submitting"
          ? labels.submitting
          : mutationState === "dirty"
            ? labels.unsavedChanges
            : mutationState === "error"
              ? (workspaceError?.message ?? labels.unsavedChanges)
              : "";

  return (
    <article aria-labelledby="task-title" className={`stack ${styles.workspace}`}>
      <header className={`panel stack ${styles.hero}`}>
        <div className="cluster">
          <h1 id="task-title">{taskText(task.title, locale)}</h1>
          {attempt ? (
            <Badge tone={attempt.state === "accepted" ? "success" : "neutral"}>
              {labels.attemptStates[attempt.state]}
            </Badge>
          ) : null}
        </div>
        <p>{taskText(task.instructions, locale)}</p>
      </header>

      {task.beforeVideoUrl ? (
        <section aria-labelledby="before-task-video" className="panel stack">
          <h2 className={styles.sectionTitle} id="before-task-video">
            {labels.beforeVideo}
          </h2>
          <a
            className={`button button--secondary ${styles.secondaryAction}`}
            href={task.beforeVideoUrl}
            rel="noreferrer"
            target="_blank"
          >
            {labels.openLearningVideo}
          </a>
        </section>
      ) : null}

      {task.targetUrl ? (
        <section aria-labelledby="testing-target" className="panel stack">
          <h2 className={styles.sectionTitle} id="testing-target">
            {labels.testingTarget}
          </h2>
          <a
            className={`button button--secondary ${styles.secondaryAction}`}
            href={task.targetUrl}
            rel="noreferrer"
            target="_blank"
          >
            {labels.openTestingTarget}
          </a>
        </section>
      ) : null}

      {task.hint ? (
        <aside aria-labelledby="task-hint" className="panel stack">
          <h2 className={styles.sectionTitle} id="task-hint">
            {labels.optionalHint}
          </h2>
          {hintVisible ? (
            <p role="status">{taskText(task.hint, locale)}</p>
          ) : (
            <Button
              disabled={interactionDisabled}
              onClick={revealHint}
              type="button"
              variant="secondary"
            >
              {labels.revealHint}
            </Button>
          )}
        </aside>
      ) : null}

      {workspaceError ? (
        <div aria-live="assertive" role="alert">
          <StatePanel
            action={
              workspaceError.kind === "save" && attemptEditable ? (
                <Button
                  onClick={() => {
                    void flushDraft().catch(() => undefined);
                  }}
                  type="button"
                  variant="secondary"
                >
                  {labels.retryDraft}
                </Button>
              ) : undefined
            }
            description={workspaceError.message}
            title={labels.errorTitle}
            tone="danger"
          />
        </div>
      ) : null}

      {task.access !== "available" ? (
        <StatePanel
          description={labels.unavailableDescription}
          title={labels.unavailableTitle}
        />
      ) : null}

      <form
        aria-busy={
          mutationState === "saving" || mutationState === "submitting"
        }
        className="panel stack"
        onSubmit={handleSubmit}
      >
        <Field htmlFor="task-answer" label={labels.writtenAnswer}>
          <Textarea
            disabled={interactionDisabled}
            id="task-answer"
            maxLength={50_000}
            onBlur={() => {
              if (canEditCurrentAttempt() && dirty) {
                void flushDraft().catch(() => undefined);
              }
            }}
            onChange={(event) => handleAnswerChange(event.target.value)}
            value={answerText}
          />
        </Field>

        {task.assessment ? (
          <fieldset className={styles.assessment} disabled={interactionDisabled}>
            <legend>{taskText(task.assessment.question, locale)}</legend>
            {task.assessment.options.map((option) => (
              <label className={styles.option} key={option.id}>
                <input
                  checked={selectedAnswerIds.includes(option.id)}
                  name="task-assessment"
                  onChange={() => toggleAnswer(option.id)}
                  type={
                    task.assessment?.selectionMode === "single"
                      ? "radio"
                      : "checkbox"
                  }
                  value={option.id}
                />
                {taskText(option.label, locale)}
              </label>
            ))}
          </fieldset>
        ) : null}

        <section
          aria-labelledby="task-evidence"
          className={`stack ${styles.evidenceSection}`}
        >
          <h2 className={styles.sectionTitle} id="task-evidence">
            {labels.evidence}
          </h2>
          {evidence.length === 0 ? (
            <p className="muted">{labels.noEvidence}</p>
          ) : (
            <ul className={styles.evidenceList}>
              {evidence.map((item) => (
                <li key={item.id}>
                  {item.kind === "link" || item.kind === "file" ? (
                    <a href={item.uri} rel="noreferrer" target="_blank">
                      {item.name}
                    </a>
                  ) : (
                    item.name
                  )}
                </li>
              ))}
            </ul>
          )}
          {addEvidence && attemptEditable ? (
            <div className={`stack ${styles.evidenceComposer}`}>
              <div className={styles.evidenceFields}>
                <Field
                  error={
                    evidenceValidationError === "title"
                      ? labels.evidenceTitleRequired
                      : undefined
                  }
                  htmlFor="task-evidence-title"
                  label={labels.evidenceTitle}
                >
                  <Input
                    aria-describedby={
                      evidenceValidationError === "title"
                        ? "task-evidence-title-error"
                        : undefined
                    }
                    aria-invalid={evidenceValidationError === "title"}
                    autoComplete="off"
                    disabled={addingEvidence || interactionDisabled}
                    id="task-evidence-title"
                    maxLength={255}
                    onChange={(event) => {
                      setEvidenceTitle(event.target.value);
                      if (evidenceValidationError === "title") {
                        setEvidenceValidationError(null);
                      }
                    }}
                    onKeyDown={handleEvidenceKeyDown}
                    placeholder={labels.evidenceTitlePlaceholder}
                    value={evidenceTitle}
                  />
                </Field>
                <Field
                  error={
                    evidenceValidationError === "url_required"
                      ? labels.evidenceUrlRequired
                      : evidenceValidationError === "url_invalid"
                        ? labels.evidenceUrlInvalid
                        : undefined
                  }
                  htmlFor="task-evidence-url"
                  label={labels.evidenceUrl}
                >
                  <Input
                    aria-describedby={
                      evidenceValidationError === "url_required" ||
                      evidenceValidationError === "url_invalid"
                        ? "task-evidence-url-error"
                        : undefined
                    }
                    aria-invalid={
                      evidenceValidationError === "url_required" ||
                      evidenceValidationError === "url_invalid"
                    }
                    autoCapitalize="none"
                    autoComplete="url"
                    disabled={addingEvidence || interactionDisabled}
                    id="task-evidence-url"
                    maxLength={2048}
                    onChange={(event) => {
                      setEvidenceUrl(event.target.value);
                      if (
                        evidenceValidationError === "url_required" ||
                        evidenceValidationError === "url_invalid"
                      ) {
                        setEvidenceValidationError(null);
                      }
                    }}
                    onKeyDown={handleEvidenceKeyDown}
                    placeholder={labels.evidenceUrlPlaceholder}
                    type="url"
                    value={evidenceUrl}
                  />
                </Field>
              </div>
              <Button
                disabled={addingEvidence || mutationState === "submitting"}
                onClick={() => void handleAddEvidence()}
                type="button"
                variant="secondary"
              >
                {labels.addEvidence}
              </Button>
            </div>
          ) : null}
        </section>

        <p
          aria-live="polite"
          className={styles.statusLine}
          role="status"
        >
          {statusMessage}
        </p>

        {attemptEditable ? (
          <Button disabled={mutationState === "submitting"} type="submit">
            {labels.submitForReview}
          </Button>
        ) : null}
      </form>

      {attempt?.latestReview ? (
        <section aria-labelledby="trainer-feedback" className="panel stack">
          <h2 id="trainer-feedback">{labels.trainerFeedback}</h2>
          <p>{attempt.latestReview.comment}</p>
          <p>
            {labels.decision}: {labels.reviewDecisions[attempt.latestReview.decision]}
          </p>
        </section>
      ) : null}

      {attempt && attempt.reviewHistory.length > 0 ? (
        <section aria-labelledby="attempt-history" className="panel stack">
          <h2 id="attempt-history">{labels.reviewHistory}</h2>
          <ol>
            {attempt.reviewHistory.map((review) => (
              <li key={review.id}>
                {labels.reviewDecisions[review.decision]}: {review.comment}
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      {attempt?.state === "accepted" && task.afterVideoUrl ? (
        <a
          className="button button--secondary"
          href={task.afterVideoUrl}
          rel="noreferrer"
          target="_blank"
        >
          {labels.openAfterTaskVideo}
        </a>
      ) : null}
    </article>
  );
}
