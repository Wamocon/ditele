import { describe, expect, it, vi } from "vitest";

import {
  createQuestion,
  QuestionError,
  type QuestionAccessPolicy,
  type QuestionRepository,
} from "./question-service";

const thread = {
  id: "question-1",
  taskId: "task-1",
  learnerId: "learner-1",
  groupId: "group-1",
  state: "open",
  version: 1,
  createdAt: "2026-07-17T08:00:00.000Z",
  updatedAt: "2026-07-17T08:00:00.000Z",
  messages: [
    {
      id: "message-1",
      author: { id: "learner-1", kind: "learner" },
      body: "Should this result be reported as a boundary defect?",
      createdAt: "2026-07-17T08:00:00.000Z",
    },
  ],
  transferHistory: [],
  history: [],
};

describe("createQuestion", () => {
  it("links the thread to the server-derived learner", async () => {
    const create = vi.fn(async () => thread);
    const policy: QuestionAccessPolicy = { canAccess: vi.fn(async () => true) };

    await createQuestion(
      { policy, repository: { create, get: vi.fn(), archive: vi.fn() } },
      { id: "learner-1", role: "learner" },
      {
        taskId: "task-1",
        groupId: "group-1",
        body: "Should this result be reported as a boundary defect?",
        idempotencyKey: "question-key-0001",
      },
    );

    expect(create).toHaveBeenCalledWith(expect.objectContaining({ learnerId: "learner-1" }));
  });

  it("blocks cross-group creation", async () => {
    const repository: QuestionRepository = { create: vi.fn(), get: vi.fn(), archive: vi.fn() };
    const policy: QuestionAccessPolicy = { canAccess: vi.fn(async () => false) };

    await expect(
      createQuestion(
        { policy, repository },
        { id: "learner-1", role: "learner" },
        {
          taskId: "task-1",
          groupId: "other-group",
          body: "Can I access this task?",
          idempotencyKey: "question-key-0001",
        },
      ),
    ).rejects.toEqual(new QuestionError("questions.forbidden"));
    expect(repository.create).not.toHaveBeenCalled();
  });
});
