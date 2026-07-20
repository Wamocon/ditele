import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { TaskWorkspace } from "@/features/tasks/components/task-workspace";
import type {
  AttemptDetail,
  EvidenceRef,
  SaveAttemptDraftInput,
  SubmitAttemptInput,
} from "@/features/tasks/model/attempt";
import type { LearnerTask } from "@/features/tasks/model/task";

afterEach(cleanup);

const timestamp = "2026-07-18T08:00:00.000Z";
const labels = {
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
  saveFailed: "Save failed. Try again.",
  submissionFailed: "Submission failed. Try again.",
  answerRequired: "Write an answer or select an option.",
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
} as const;

function task(selectionMode: "single" | "multiple" = "single"): LearnerTask {
  return {
    id: "task-1",
    version: 2,
    courseId: "course-1",
    groupId: "group-1",
    stageId: "stage-1",
    title: { en: "Boundary analysis" },
    instructions: { en: "Exercise the documented limits and capture evidence." },
    targetUrl: "https://target.example.test",
    hintId: "hint-1",
    hint: { en: "Check values immediately either side of each boundary." },
    beforeVideoUrl: "https://media.example.test/before",
    afterVideoUrl: "https://media.example.test/after",
    assessment: {
      id: "assessment-1",
      question: { en: "Which techniques apply?" },
      selectionMode,
      options: [
        { id: "option-1", label: { en: "Boundary value analysis" } },
        { id: "option-2", label: { en: "Equivalence partitioning" } },
      ],
    },
    access: "available",
  };
}

function attempt(overrides: Partial<AttemptDetail> = {}): AttemptDetail {
  return {
    id: "attempt-1",
    taskId: "task-1",
    learnerId: "learner-1",
    groupId: "group-1",
    attemptNumber: 1,
    state: "draft",
    version: 1,
    draftVersion: 1,
    createdAt: timestamp,
    updatedAt: timestamp,
    answerText: "",
    selectedAnswerIds: [],
    evidence: [],
    hintUsage: [],
    solvingDurationSeconds: 10,
    reviewHistory: [],
    ...overrides,
  };
}

function successfulSave(input: SaveAttemptDraftInput): Promise<AttemptDetail> {
  return Promise.resolve(attempt({
    answerText: input.answerText,
    selectedAnswerIds: input.selectedAnswerIds,
    evidence: input.evidence,
    hintUsage: input.usedHintIds.map((hintId) => ({ hintId, usedAt: timestamp })),
    solvingDurationSeconds: input.solvingDurationSeconds,
    version: 2,
    draftVersion: 2,
  }));
}

function successfulSubmit(input: SubmitAttemptInput): Promise<AttemptDetail> {
  return Promise.resolve(attempt({
    answerText: input.answerText,
    selectedAnswerIds: input.selectedAnswerIds,
    evidence: input.evidence,
    state: "submitted",
    version: 3,
    draftVersion: 2,
    submittedAt: timestamp,
  }));
}

describe("TaskWorkspace validation and mutation failures", () => {
  it("requires either written content or an assessment selection before persistence", () => {
    const saveDraft = vi.fn(successfulSave);
    const submit = vi.fn(successfulSubmit);
    render(<TaskWorkspace labels={labels} locale="en" saveDraft={saveDraft} submit={submit} task={task()} />);

    fireEvent.submit(screen.getByRole("button", { name: "Submit for review" }).closest("form")!);
    expect(screen.getByRole("alert")).toHaveTextContent("Write an answer or select an option.");
    expect(saveDraft).not.toHaveBeenCalled();
    expect(submit).not.toHaveBeenCalled();
  });

  it("surfaces background draft-save failure after an editable answer loses focus", async () => {
    const saveDraft = vi.fn(async (input: SaveAttemptDraftInput) => {
      void input;
      throw new Error("network unavailable");
    });
    render(<TaskWorkspace labels={labels} locale="en" saveDraft={saveDraft} submit={vi.fn(successfulSubmit)} task={task()} />);

    fireEvent.change(screen.getByLabelText("Written answer"), { target: { value: "I tested lower and upper boundaries." } });
    fireEvent.blur(screen.getByLabelText("Written answer"));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Save failed. Try again."));
    expect(saveDraft).toHaveBeenCalledWith(expect.objectContaining({ answerText: "I tested lower and upper boundaries.", expectedVersion: 0 }));
  });

  it("reports submit failure after a successful atomic draft handoff", async () => {
    const saveDraft = vi.fn(successfulSave);
    const submit = vi.fn(async (input: SubmitAttemptInput) => {
      void input;
      throw new Error("review queue unavailable");
    });
    render(<TaskWorkspace labels={labels} locale="en" saveDraft={saveDraft} submit={submit} task={task()} />);

    fireEvent.change(screen.getByLabelText("Written answer"), { target: { value: "Evidence-based answer" } });
    fireEvent.submit(screen.getByRole("button", { name: "Submit for review" }).closest("form")!);
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Submission failed. Try again."));
    expect(saveDraft).toHaveBeenCalledTimes(1);
    expect(submit).toHaveBeenCalledWith(expect.objectContaining({ attemptId: "attempt-1", expectedVersion: 2, answerText: "Evidence-based answer" }));
  });
});

describe("TaskWorkspace assessment selection semantics", () => {
  it("keeps only the last choice for a single-selection assessment", async () => {
    const user = userEvent.setup();
    const saveDraft = vi.fn(successfulSave);
    const submit = vi.fn(successfulSubmit);
    render(<TaskWorkspace labels={labels} locale="en" saveDraft={saveDraft} submit={submit} task={task("single")} />);

    await user.click(screen.getByRole("radio", { name: "Boundary value analysis" }));
    await user.click(screen.getByRole("radio", { name: "Equivalence partitioning" }));
    expect(screen.getByRole("radio", { name: "Boundary value analysis" })).not.toBeChecked();
    expect(screen.getByRole("radio", { name: "Equivalence partitioning" })).toBeChecked();
    fireEvent.submit(screen.getByRole("button", { name: "Submit for review" }).closest("form")!);

    await waitFor(() => expect(submit).toHaveBeenCalledTimes(1));
    expect(saveDraft).toHaveBeenCalledWith(expect.objectContaining({ selectedAnswerIds: ["option-2"] }));
    expect(submit).toHaveBeenCalledWith(expect.objectContaining({ selectedAnswerIds: ["option-2"] }));
  });

  it("adds and removes independent choices for a multiple-selection assessment", async () => {
    const user = userEvent.setup();
    const saveDraft = vi.fn(successfulSave);
    const submit = vi.fn(successfulSubmit);
    render(<TaskWorkspace labels={labels} locale="en" saveDraft={saveDraft} submit={submit} task={task("multiple")} />);

    const boundary = screen.getByRole("checkbox", { name: "Boundary value analysis" });
    const partition = screen.getByRole("checkbox", { name: "Equivalence partitioning" });
    await user.click(boundary);
    await user.click(partition);
    expect(boundary).toBeChecked();
    expect(partition).toBeChecked();
    await user.click(boundary);
    expect(boundary).not.toBeChecked();
    fireEvent.submit(screen.getByRole("button", { name: "Submit for review" }).closest("form")!);

    await waitFor(() => expect(submit).toHaveBeenCalledTimes(1));
    expect(submit).toHaveBeenCalledWith(expect.objectContaining({ selectedAnswerIds: ["option-2"] }));
  });
});

describe("TaskWorkspace evidence controls", () => {
  it("validates a title and credential-free HTTPS URL before calling the provider", async () => {
    const user = userEvent.setup();
    const addEvidence = vi.fn();
    render(
      <TaskWorkspace
        addEvidence={addEvidence}
        labels={labels}
        locale="en"
        saveDraft={vi.fn(successfulSave)}
        submit={vi.fn(successfulSubmit)}
        task={task()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Add evidence" }));
    expect(screen.getByText("Evidence title required.")).toBeVisible();
    await user.type(screen.getByLabelText("Evidence title"), "Boundary report");
    await user.type(
      screen.getByLabelText("Secure evidence URL"),
      "http://evidence.example.test/report",
    );
    await user.click(screen.getByRole("button", { name: "Add evidence" }));
    expect(screen.getByText("Use a valid HTTPS URL.")).toBeVisible();
    expect(addEvidence).not.toHaveBeenCalled();
  });

  it("turns evidence-provider failure into an actionable message", async () => {
    const user = userEvent.setup();
    const addEvidence = vi.fn(async () => {
      throw new Error("upload failed");
    });
    render(
      <TaskWorkspace
        addEvidence={addEvidence}
        labels={labels}
        locale="en"
        saveDraft={vi.fn(successfulSave)}
        submit={vi.fn(successfulSubmit)}
        task={task()}
      />,
    );
    await user.type(screen.getByLabelText("Evidence title"), "Boundary report");
    await user.type(
      screen.getByLabelText("Secure evidence URL"),
      "https://evidence.example.test/report",
    );
    await user.click(screen.getByRole("button", { name: "Add evidence" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Evidence upload failed."));
  });

  it("appends successful evidence and includes it in the next draft", async () => {
    const evidence: EvidenceRef = {
      id: "evidence-1",
      kind: "link",
      name: "Boundary report",
      uri: "https://evidence.example.test/report",
      createdAt: timestamp,
    };
    const saveDraft = vi.fn(successfulSave);
    const user = userEvent.setup();
    render(
      <TaskWorkspace
        addEvidence={vi.fn(async () => evidence)}
        labels={labels}
        locale="en"
        saveDraft={saveDraft}
        submit={vi.fn(successfulSubmit)}
        task={task()}
      />,
    );
    await user.type(screen.getByLabelText("Evidence title"), "Boundary report");
    await user.type(
      screen.getByLabelText("Secure evidence URL"),
      "https://evidence.example.test/report",
    );
    await user.click(screen.getByRole("button", { name: "Add evidence" }));
    expect(await screen.findByText("Boundary report")).toBeInTheDocument();
    fireEvent.blur(screen.getByLabelText("Written answer"));
    await waitFor(() => expect(saveDraft).toHaveBeenCalledWith(expect.objectContaining({ evidence: [evidence] })));
  });
});

describe("TaskWorkspace terminal accepted state", () => {
  it("is read-only while preserving accepted review evidence and after-task learning", () => {
    const review = {
      id: "review-1",
      decision: "accepted" as const,
      comment: "Clear evidence and correct boundary selection.",
      reviewerId: "trainer-1",
      createdAt: timestamp,
      version: 1,
    };
    render(
      <TaskWorkspace
        addEvidence={vi.fn(async (): Promise<EvidenceRef> => ({ id: "unused", kind: "text", name: "Unused", text: "Unused", createdAt: timestamp }))}
        initialAttempt={attempt({ state: "accepted", answerText: "Accepted answer", latestReview: review, reviewHistory: [review] })}
        labels={labels}
        locale="en"
        saveDraft={vi.fn(successfulSave)}
        submit={vi.fn(successfulSubmit)}
        task={task()}
      />,
    );

    expect(screen.getByText("Accepted", { selector: ".badge" })).toHaveClass("badge--success");
    expect(screen.getByLabelText("Written answer")).toBeDisabled();
    expect(screen.getByRole("group", { name: "Which techniques apply?" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Submit for review" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add evidence" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Reveal hint" })).toBeDisabled();
    expect(screen.getByRole("heading", { name: "Trainer feedback" })).toBeInTheDocument();
    expect(screen.getByText("Clear evidence and correct boundary selection.")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Review history" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open after-task video" })).toHaveAttribute("href", "https://media.example.test/after");
    expect(screen.getByRole("link", { name: "Open learning video" })).toHaveAttribute("href", "https://media.example.test/before");
    expect(screen.getByRole("link", { name: "Open practice target" })).toHaveAttribute("href", "https://target.example.test");
  });
});
