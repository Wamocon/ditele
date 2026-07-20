import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  type AttemptDetail,
  type EvidenceRef,
  type SaveAttemptDraftInput,
  type SubmitAttemptInput,
} from "../model/attempt";
import type { LearnerTask } from "../model/task";
import { TaskWorkspace, type TaskWorkspaceLabels } from "./task-workspace";

const AUTOSAVE_DELAY_MS = 800;
const DURATION_CHECKPOINT_MS = 30_000;

const task: LearnerTask = {
  id: "task-1",
  version: 1,
  courseId: "course-1",
  groupId: "group-1",
  stageId: "stage-1",
  title: { en: "Explore boundary values" },
  instructions: { en: "Test the input limits and document the result." },
  hint: { en: "Check values immediately above and below the limit." },
  assessment: {
    id: "assessment-1",
    question: { en: "Which technique fits?" },
    selectionMode: "single",
    options: [
      { id: "option-1", label: { en: "Boundary value analysis" } },
      { id: "option-2", label: { en: "Statement testing" } },
    ],
  },
  access: "available",
};

const saved: AttemptDetail = {
  id: "attempt-1",
  taskId: "task-1",
  learnerId: "learner-1",
  groupId: "group-1",
  attemptNumber: 1,
  state: "draft",
  version: 1,
  draftVersion: 1,
  createdAt: "2026-07-17T08:00:00.000Z",
  updatedAt: "2026-07-17T08:00:00.000Z",
  answerText: "",
  selectedAnswerIds: [],
  evidence: [],
  hintUsage: [],
  solvingDurationSeconds: 0,
  reviewHistory: [],
};

const labels: TaskWorkspaceLabels = {
  beforeVideo: "Before-task video",
  openLearningVideo: "Open learning video",
  testingTarget: "Testing target",
  openTestingTarget: "Open practice target",
  optionalHint: "Optional hint",
  revealHint: "Reveal hint",
  unavailableTitle: "Task unavailable",
  unavailableDescription: "The schedule does not allow a new attempt.",
  errorTitle: "Check this task",
  writtenAnswer: "Written answer",
  evidence: "Evidence",
  noEvidence: "No evidence attached yet.",
  addEvidence: "Add evidence",
  evidenceTitle: "Evidence title",
  evidenceTitlePlaceholder: "Evidence title example",
  evidenceUrl: "Secure evidence URL",
  evidenceUrlPlaceholder: "https://…",
  evidenceTitleRequired: "Evidence title required.",
  evidenceUrlRequired: "Evidence URL required.",
  evidenceUrlInvalid: "Use a valid HTTPS URL.",
  savingDraft: "Saving draft…",
  draftSaved: "Draft saved",
  unsavedChanges: "Unsaved changes",
  retryDraft: "Retry saving",
  submitting: "Submitting…",
  submitForReview: "Submit for review",
  trainerFeedback: "Trainer feedback",
  decision: "Decision",
  reviewHistory: "Review history",
  openAfterTaskVideo: "Open after-task video",
  saveFailed: "Save failed.",
  submissionFailed: "Submission failed.",
  answerRequired: "Answer required.",
  evidenceUploadFailed: "Evidence upload failed.",
  attemptStates: {
    draft: "Draft",
    submitted: "Submitted",
    revision_required: "Revision required",
    resubmitted: "Resubmitted",
    accepted: "Accepted",
    abandoned: "Abandoned",
  },
  reviewDecisions: {
    accepted: "Accepted",
    revision_required: "Revision required",
  },
};

function savedFromInput(
  input: SaveAttemptDraftInput,
  overrides: Partial<AttemptDetail> = {},
): AttemptDetail {
  return {
    ...saved,
    id: input.attemptId ?? saved.id,
    draftVersion: input.expectedVersion + 1,
    answerText: input.answerText,
    selectedAnswerIds: [...input.selectedAnswerIds],
    evidence: input.evidence.map((item) => ({ ...item })),
    hintUsage: input.usedHintIds.map((hintId) => ({
      hintId,
      usedAt: "2026-07-17T08:00:00.000Z",
    })),
    solvingDurationSeconds: input.solvingDurationSeconds,
    ...overrides,
  };
}

function deferred<T>(): {
  promise: Promise<T>;
  resolve(value: T): void;
  reject(reason: unknown): void;
} {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

async function advanceTime(milliseconds: number): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(milliseconds);
  });
}

afterEach(() => {
  vi.useRealTimers();
});

describe("TaskWorkspace", () => {
  it("records intentional hint reveal and exposes accessible task controls", async () => {
    const user = userEvent.setup();
    render(
      <TaskWorkspace
        locale="en"
        labels={labels}
        saveDraft={vi.fn(async () => saved)}
        submit={vi.fn(async (): Promise<AttemptDetail> => ({
          ...saved,
          state: "submitted",
        }))}
        task={task}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Reveal hint" }));
    expect(
      screen.getByText(/immediately above and below/),
    ).toBeVisible();
    expect(screen.getByLabelText("Written answer")).toBeEnabled();
    expect(
      screen.getByRole("group", { name: "Which technique fits?" }),
    ).toBeVisible();
    expect(screen.getByText("Unsaved changes")).toBeVisible();
  });

  it("clears a stale answer-validation alert as soon as the learner corrects it", () => {
    render(
      <TaskWorkspace
        locale="en"
        labels={labels}
        saveDraft={vi.fn(async () => saved)}
        submit={vi.fn()}
        task={task}
      />,
    );

    fireEvent.submit(
      screen.getByRole("button", { name: "Submit for review" }).closest("form")!,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("Answer required.");

    fireEvent.change(screen.getByLabelText("Written answer"), {
      target: { value: "Corrected boundary analysis" },
    });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByText("Unsaved changes")).toBeVisible();
  });

  it("debounces and persists answer, choice, and intentional hint changes together", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-17T08:00:00.000Z"));
    const saveDraft = vi.fn(async (input: SaveAttemptDraftInput) =>
      savedFromInput(input),
    );
    render(
      <TaskWorkspace
        locale="en"
        labels={labels}
        saveDraft={saveDraft}
        submit={vi.fn()}
        task={task}
      />,
    );

    fireEvent.change(screen.getByLabelText("Written answer"), {
      target: { value: "The upper boundary accepts one value too many." },
    });
    fireEvent.click(
      screen.getByRole("radio", { name: "Boundary value analysis" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Reveal hint" }));

    expect(screen.getByText("Unsaved changes")).toBeVisible();
    await advanceTime(AUTOSAVE_DELAY_MS - 1);
    expect(saveDraft).not.toHaveBeenCalled();
    await advanceTime(1);

    expect(saveDraft).toHaveBeenCalledTimes(1);
    expect(saveDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        answerText: "The upper boundary accepts one value too many.",
        expectedVersion: 0,
        selectedAnswerIds: ["option-1"],
        usedHintIds: ["primary"],
      }),
    );
    expect(screen.getByText("Draft saved")).toBeVisible();
  });

  it("persists evidence returned by the optional evidence boundary", async () => {
    vi.useFakeTimers();
    const evidence: EvidenceRef = {
      id: "evidence-1",
      kind: "text",
      name: "Boundary observation",
      text: "Value 101 is accepted although 100 is the documented maximum.",
      createdAt: "2026-07-17T08:00:00.000Z",
    };
    const saveDraft = vi.fn(async (input: SaveAttemptDraftInput) =>
      savedFromInput(input),
    );
    render(
      <TaskWorkspace
        addEvidence={vi.fn(async () => evidence)}
        locale="en"
        labels={labels}
        saveDraft={saveDraft}
        submit={vi.fn()}
        task={task}
      />,
    );

    fireEvent.change(screen.getByLabelText("Evidence title"), {
      target: { value: "Boundary observation" },
    });
    fireEvent.change(screen.getByLabelText("Secure evidence URL"), {
      target: { value: "https://evidence.example.test/boundary" },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Add evidence" }));
    });
    expect(screen.getByText("Boundary observation")).toBeVisible();

    await advanceTime(AUTOSAVE_DELAY_MS);
    expect(saveDraft).toHaveBeenCalledWith(
      expect.objectContaining({ evidence: [evidence] }),
    );
  });

  it("reports evidence-boundary failures without creating a draft mutation", async () => {
    vi.useFakeTimers();
    const saveDraft = vi.fn(async (input: SaveAttemptDraftInput) =>
      savedFromInput(input),
    );
    render(
      <TaskWorkspace
        addEvidence={vi.fn(async () => {
          throw new Error("upload unavailable");
        })}
        locale="en"
        labels={labels}
        saveDraft={saveDraft}
        submit={vi.fn()}
        task={task}
      />,
    );

    fireEvent.change(screen.getByLabelText("Evidence title"), {
      target: { value: "Boundary observation" },
    });
    fireEvent.change(screen.getByLabelText("Secure evidence URL"), {
      target: { value: "https://evidence.example.test/boundary" },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Add evidence" }));
    });
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Evidence upload failed.",
    );
    await advanceTime(AUTOSAVE_DELAY_MS);
    expect(saveDraft).not.toHaveBeenCalled();
  });

  it("serializes CAS saves and coalesces changes made during an in-flight save", async () => {
    vi.useFakeTimers();
    const firstSave = deferred<AttemptDetail>();
    let firstInput: SaveAttemptDraftInput | undefined;
    const saveDraft = vi.fn((input: SaveAttemptDraftInput) => {
      if (!firstInput) {
        firstInput = input;
        return firstSave.promise;
      }
      return Promise.resolve(savedFromInput(input));
    });
    render(
      <TaskWorkspace
        locale="en"
        labels={labels}
        saveDraft={saveDraft}
        submit={vi.fn()}
        task={task}
      />,
    );

    fireEvent.change(screen.getByLabelText("Written answer"), {
      target: { value: "First draft" },
    });
    await advanceTime(AUTOSAVE_DELAY_MS);
    expect(saveDraft).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Saving draft…")).toBeVisible();

    fireEvent.change(screen.getByLabelText("Written answer"), {
      target: { value: "Newest coalesced draft" },
    });
    fireEvent.click(screen.getByRole("radio", { name: "Statement testing" }));
    await advanceTime(AUTOSAVE_DELAY_MS);
    expect(saveDraft).toHaveBeenCalledTimes(1);

    await act(async () => {
      firstSave.resolve(savedFromInput(firstInput!));
      await firstSave.promise;
    });

    expect(saveDraft).toHaveBeenCalledTimes(2);
    expect(saveDraft.mock.calls[1]?.[0]).toEqual(
      expect.objectContaining({
        answerText: "Newest coalesced draft",
        expectedVersion: 1,
        selectedAnswerIds: ["option-2"],
      }),
    );
    expect(screen.getByText("Draft saved")).toBeVisible();
  });

  it("retains failed dirty state, warns before unload, and retries the latest snapshot", async () => {
    vi.useFakeTimers();
    const saveDraft = vi
      .fn<(input: SaveAttemptDraftInput) => Promise<AttemptDetail>>()
      .mockRejectedValueOnce(new Error("network failure"))
      .mockImplementation(async (input) => savedFromInput(input));
    render(
      <TaskWorkspace
        locale="en"
        labels={labels}
        saveDraft={saveDraft}
        submit={vi.fn()}
        task={task}
      />,
    );

    fireEvent.change(screen.getByLabelText("Written answer"), {
      target: { value: "Failed snapshot" },
    });
    await advanceTime(AUTOSAVE_DELAY_MS);
    expect(screen.getByRole("alert")).toHaveTextContent("Save failed.");

    const dirtyUnload = new Event("beforeunload", {
      bubbles: false,
      cancelable: true,
    });
    window.dispatchEvent(dirtyUnload);
    expect(dirtyUnload.defaultPrevented).toBe(true);

    fireEvent.change(screen.getByLabelText("Written answer"), {
      target: { value: "Latest retry snapshot" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Retry saving" }));
    await act(async () => undefined);

    expect(saveDraft).toHaveBeenCalledTimes(2);
    expect(saveDraft.mock.calls[1]?.[0]).toEqual(
      expect.objectContaining({
        answerText: "Latest retry snapshot",
        expectedVersion: 0,
        idempotencyKey: saveDraft.mock.calls[0]?.[0].idempotencyKey,
      }),
    );
    expect(screen.getByText("Draft saved")).toBeVisible();

    const cleanUnload = new Event("beforeunload", {
      bubbles: false,
      cancelable: true,
    });
    window.dispatchEvent(cleanUnload);
    expect(cleanUnload.defaultPrevented).toBe(false);
  });

  it("checkpoints elapsed solving time even when no field changed", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-17T08:00:00.000Z"));
    const initialAttempt = { ...saved, solvingDurationSeconds: 12 };
    const saveDraft = vi.fn(async (input: SaveAttemptDraftInput) =>
      savedFromInput(input),
    );
    render(
      <TaskWorkspace
        initialAttempt={initialAttempt}
        locale="en"
        labels={labels}
        saveDraft={saveDraft}
        submit={vi.fn()}
        task={task}
      />,
    );

    await advanceTime(DURATION_CHECKPOINT_MS - 1);
    expect(saveDraft).not.toHaveBeenCalled();
    await advanceTime(1);

    expect(saveDraft).toHaveBeenCalledTimes(1);
    expect(saveDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        attemptId: "attempt-1",
        expectedVersion: 1,
        solvingDurationSeconds: 42,
      }),
    );
  });

  it("waits for the active autosave before submitting and never races another save", async () => {
    vi.useFakeTimers();
    const inFlightSave = deferred<AttemptDetail>();
    let saveInput: SaveAttemptDraftInput | undefined;
    const saveDraft = vi.fn((input: SaveAttemptDraftInput) => {
      if (!saveInput) {
        saveInput = input;
        return inFlightSave.promise;
      }
      return Promise.resolve(savedFromInput(input, { version: 2 }));
    });
    const submit = vi.fn(async () => ({
      ...saved,
      answerText: "Ready for review",
      state: "submitted" as const,
      version: 2,
    }));
    render(
      <TaskWorkspace
        locale="en"
        labels={labels}
        saveDraft={saveDraft}
        submit={submit}
        task={task}
      />,
    );

    fireEvent.change(screen.getByLabelText("Written answer"), {
      target: { value: "Ready for review" },
    });
    await advanceTime(AUTOSAVE_DELAY_MS);
    expect(saveDraft).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Submit for review" }));
    expect(screen.getByText("Submitting…")).toBeVisible();
    expect(submit).not.toHaveBeenCalled();
    await advanceTime(AUTOSAVE_DELAY_MS * 2);
    expect(saveDraft).toHaveBeenCalledTimes(1);

    await act(async () => {
      inFlightSave.resolve(savedFromInput(saveInput!));
      await inFlightSave.promise;
    });

    expect(saveDraft).toHaveBeenCalledTimes(2);
    expect(saveDraft.mock.calls[1]?.[0]).toEqual(
      expect.objectContaining({
        answerText: "Ready for review",
        expectedVersion: 1,
      }),
    );
    expect(submit).toHaveBeenCalledTimes(1);
    expect(submit).toHaveBeenCalledWith(
      expect.objectContaining({
        answerText: "Ready for review",
        attemptId: "attempt-1",
        expectedVersion: 2,
      }),
    );
    expect(
      screen.queryByRole("button", { name: "Submit for review" }),
    ).not.toBeInTheDocument();

    await advanceTime(DURATION_CHECKPOINT_MS);
    expect(saveDraft).toHaveBeenCalledTimes(2);
  });

  it("retries a pending submission command exactly without saving another draft", async () => {
    vi.useFakeTimers();
    const saveDraft = vi.fn(async (input: SaveAttemptDraftInput) =>
      savedFromInput(input),
    );
    const submitted: AttemptDetail = {
      ...saved,
      answerText: "Ready for review",
      state: "submitted",
      version: 2,
    };
    const submit = vi
      .fn<(input: SubmitAttemptInput) => Promise<AttemptDetail>>()
      .mockRejectedValueOnce(new TypeError("both immediate responses were lost"))
      .mockResolvedValueOnce(submitted);
    render(
      <TaskWorkspace
        locale="en"
        labels={labels}
        saveDraft={saveDraft}
        submit={submit}
        task={task}
      />,
    );

    fireEvent.change(screen.getByLabelText("Written answer"), {
      target: { value: "Ready for review" },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Submit for review" }));
    });

    expect(screen.getByRole("alert")).toHaveTextContent("Submission failed.");
    expect(screen.getByLabelText("Written answer")).toBeDisabled();
    expect(saveDraft).toHaveBeenCalledTimes(1);
    expect(submit).toHaveBeenCalledTimes(1);
    const firstCommand = submit.mock.calls[0]?.[0];

    await advanceTime(DURATION_CHECKPOINT_MS);
    expect(saveDraft).toHaveBeenCalledTimes(1);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Submit for review" }));
    });

    expect(saveDraft).toHaveBeenCalledTimes(1);
    expect(submit).toHaveBeenCalledTimes(2);
    expect(submit.mock.calls[1]?.[0]).toEqual(firstCommand);
    expect(
      screen.queryByRole("button", { name: "Submit for review" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("Submitted", { selector: ".badge" })).toBeVisible();
  });

  it("renders an explicit read-only state when progression has not unlocked the task", async () => {
    vi.useFakeTimers();
    const saveDraft = vi.fn(async () => saved);
    render(
      <TaskWorkspace
        locale="en"
        labels={labels}
        saveDraft={saveDraft}
        submit={vi.fn()}
        task={{ ...task, access: "inactive" }}
      />,
    );

    expect(screen.getByRole("heading", { name: "Task unavailable" })).toBeVisible();
    expect(screen.getByLabelText("Written answer")).toBeDisabled();
    expect(
      screen.queryByRole("button", { name: "Submit for review" }),
    ).not.toBeInTheDocument();
    await advanceTime(DURATION_CHECKPOINT_MS);
    expect(saveDraft).not.toHaveBeenCalled();
  });

  it("does not autosave an already submitted attempt", async () => {
    vi.useFakeTimers();
    const saveDraft = vi.fn(async () => saved);
    render(
      <TaskWorkspace
        initialAttempt={{ ...saved, state: "submitted", version: 2 }}
        locale="en"
        labels={labels}
        saveDraft={saveDraft}
        submit={vi.fn()}
        task={task}
      />,
    );

    expect(screen.getByLabelText("Written answer")).toBeDisabled();
    expect(screen.getByRole("radio", { name: "Boundary value analysis" })).toBeDisabled();
    expect(
      screen.queryByRole("button", { name: "Submit for review" }),
    ).not.toBeInTheDocument();
    await advanceTime(DURATION_CHECKPOINT_MS * 2);
    expect(saveDraft).not.toHaveBeenCalled();
  });

  it("labels an abandoned attempt and keeps the terminal workspace read-only", async () => {
    vi.useFakeTimers();
    const saveDraft = vi.fn(async () => saved);
    render(
      <TaskWorkspace
        initialAttempt={{ ...saved, state: "abandoned", version: 2 }}
        locale="en"
        labels={labels}
        saveDraft={saveDraft}
        submit={vi.fn()}
        task={task}
      />,
    );

    expect(screen.getByText("Abandoned", { selector: ".badge" })).toBeVisible();
    expect(screen.getByLabelText("Written answer")).toBeDisabled();
    expect(
      screen.queryByRole("button", { name: "Submit for review" }),
    ).not.toBeInTheDocument();
    await advanceTime(DURATION_CHECKPOINT_MS * 2);
    expect(saveDraft).not.toHaveBeenCalled();
  });
});
