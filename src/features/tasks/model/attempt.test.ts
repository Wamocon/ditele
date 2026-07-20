import { describe, expect, it } from "vitest";

import {
  AttemptStateSchema,
  canTransitionAttempt,
  createSubmissionSnapshot,
  isAttemptEditable,
} from "./attempt";

describe("attempt state machine", () => {
  it("models submit, revision, resubmit and acceptance with named states", () => {
    expect(canTransitionAttempt("draft", "submitted")).toBe(true);
    expect(canTransitionAttempt("submitted", "revision_required")).toBe(true);
    expect(canTransitionAttempt("revision_required", "resubmitted")).toBe(true);
    expect(canTransitionAttempt("resubmitted", "accepted")).toBe(true);
  });

  it("does not allow a transfer to masquerade as an attempt transition", () => {
    expect(canTransitionAttempt("submitted", "resubmitted")).toBe(false);
    expect(isAttemptEditable("submitted")).toBe(false);
    expect(isAttemptEditable("revision_required")).toBe(true);
  });

  it("keeps abandoned attempts terminal and non-editable", () => {
    expect(AttemptStateSchema.parse("abandoned")).toBe("abandoned");
    expect(canTransitionAttempt("abandoned", "draft")).toBe(false);
    expect(canTransitionAttempt("abandoned", "submitted")).toBe(false);
    expect(isAttemptEditable("abandoned")).toBe(false);
  });

  it("creates an immutable submission snapshot copy", () => {
    const selectedAnswerIds = ["answer-1"];
    const snapshot = createSubmissionSnapshot({
      taskVersionId: "task-1:2",
      answerText: "Observed result",
      selectedAnswerIds,
      evidence: [],
      hintUsage: [],
      solvingDurationSeconds: 120,
    });
    selectedAnswerIds.push("answer-2");
    expect(snapshot.selectedAnswerIds).toEqual(["answer-1"]);
    expect(Object.isFrozen(snapshot)).toBe(true);
  });
});
