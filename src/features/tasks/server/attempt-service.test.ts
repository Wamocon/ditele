import { describe, expect, it, vi } from "vitest";

import type { AttemptDetail } from "../model/attempt";
import { saveAttemptDraft, submitAttempt, type AttemptRepository } from "./attempt-service";
import { TaskError, type TaskAccessPolicy } from "./task-service";

const detail: AttemptDetail = {
  id: "attempt-1",
  taskId: "task-1",
  learnerId: "learner-1",
  groupId: "group-1",
  attemptNumber: 1,
  state: "draft",
  version: 1,
  createdAt: "2026-07-17T08:00:00.000Z",
  updatedAt: "2026-07-17T08:00:00.000Z",
  answerText: "",
  selectedAnswerIds: [],
  evidence: [],
  hintUsage: [],
  solvingDurationSeconds: 20,
  reviewHistory: [],
};

const draftInput = {
  taskId: "task-1",
  groupId: "group-1",
  taskVersionId: "task-1:1",
  expectedVersion: 0,
  answerText: "A boundary-value defect was observed.",
  selectedAnswerIds: [],
  evidence: [],
  usedHintIds: [],
  solvingDurationSeconds: 20,
  idempotencyKey: "draft-request-0001",
};

describe("attempt services", () => {
  it("uses the server principal and a resource policy before saving", async () => {
    const saveDraft = vi.fn(async () => detail);
    const policy: TaskAccessPolicy = { canAccess: vi.fn(async () => true) };

    await saveAttemptDraft(
      { policy, repository: { saveDraft, submit: vi.fn() } },
      { id: "learner-1", role: "learner" },
      draftInput,
    );

    expect(saveDraft).toHaveBeenCalledWith(
      expect.objectContaining({ learnerId: "learner-1" }),
    );
  });

  it("blocks cross-group access before persistence", async () => {
    const repository: AttemptRepository = { saveDraft: vi.fn(), submit: vi.fn() };
    const policy: TaskAccessPolicy = { canAccess: vi.fn(async () => false) };

    await expect(
      saveAttemptDraft(
        { policy, repository },
        { id: "learner-1", role: "learner" },
        draftInput,
      ),
    ).rejects.toEqual(new TaskError("tasks.forbidden"));
    expect(repository.saveDraft).not.toHaveBeenCalled();
  });

  it("requires content before submit and never calls persistence for invalid input", async () => {
    const repository: AttemptRepository = { saveDraft: vi.fn(), submit: vi.fn() };
    const policy: TaskAccessPolicy = { canAccess: vi.fn(async () => true) };

    await expect(
      submitAttempt(
        { policy, repository },
        { id: "learner-1", role: "learner" },
        { ...draftInput, attemptId: "attempt-1", answerText: "" },
      ),
    ).rejects.toThrow();
    expect(repository.submit).not.toHaveBeenCalled();
  });
});
