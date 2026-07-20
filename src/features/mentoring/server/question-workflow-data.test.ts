import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/app/[locale]/_data/principal", () => ({ getPrincipal: vi.fn() }));
vi.mock("@/shared/database/server", () => ({ createServerClient: vi.fn() }));

import { getPrincipal } from "@/app/[locale]/_data/principal";
import { createServerClient } from "@/shared/database/server";

import {
  readLearnerQuestionDetail,
  readLearnerQuestionWorkspace,
  readTrainerQuestionDetail,
  readTrainerQuestionQueue,
} from "./question-workflow-data";

type QueryResult = { data: unknown; error: unknown };

const learnerId = "01980a00-0000-7000-8000-000000000001";
const trainerId = "01980a00-0000-7000-8000-000000000002";
const otherTrainerId = "01980a00-0000-7000-8000-000000000003";
const organizationId = "01980a10-0000-7000-8000-000000000001";
const cohortId = "01980a30-0000-7000-8000-000000000001";
const taskId = "01980a26-0000-7000-8000-000000000001";
const contentVersionId = "01980a22-0000-7000-8000-000000000001";
const questionId = "01980a36-0000-7000-8000-000000000001";

function questionRow(overrides: Record<string, unknown> = {}) {
  return {
    id: questionId,
    organization_id: organizationId,
    learner_id: learnerId,
    cohort_id: cohortId,
    task_id: taskId,
    content_version_id: contentVersionId,
    assigned_trainer_id: null,
    state: "open",
    subject: "Boundary behavior",
    row_version: 1,
    created_at: "2026-07-18T10:00:00.000Z",
    updated_at: "2026-07-18T10:05:00.000Z",
    answered_at: null,
    archived_at: null,
    question_messages: [{
      id: "01980a37-0000-7000-8000-000000000001",
      author_id: learnerId,
      body: "How should I choose the boundary?",
      message_kind: "message",
      created_at: "2026-07-18T10:00:00.000Z",
    }],
    question_transfers: [],
    ...overrides,
  };
}

function queryBuilder(result: QueryResult) {
  const builder = {
    select: vi.fn(),
    eq: vi.fn(),
    neq: vi.fn(),
    in: vi.fn(),
    order: vi.fn(),
    maybeSingle: vi.fn(),
    then: vi.fn(),
  };
  builder.select.mockReturnValue(builder);
  builder.eq.mockReturnValue(builder);
  builder.neq.mockReturnValue(builder);
  builder.in.mockReturnValue(builder);
  builder.order.mockReturnValue(builder);
  builder.maybeSingle.mockResolvedValue(result);
  builder.then.mockImplementation((resolve, reject) =>
    Promise.resolve(result).then(resolve, reject),
  );
  return builder;
}

function clientFixture(
  results: Record<string, QueryResult[]>,
  rpcResults: Record<string, QueryResult> = {},
) {
  const queues = new Map(
    Object.entries(results).map(([table, entries]) => [table, [...entries]]),
  );
  return {
    from: vi.fn((table: string) => {
      const result = queues.get(table)?.shift();
      if (!result) throw new Error(`Unexpected query for ${table}`);
      return queryBuilder(result);
    }),
    rpc: vi.fn((name: string) => {
      const result = rpcResults[name] ?? (
        name === "list_my_question_participant_contexts"
          ? participantContextResult()
          : undefined
      );
      if (!result) throw new Error(`Unexpected RPC ${name}`);
      return Promise.resolve(result);
    }),
  };
}

function participantContextResult(): QueryResult {
  return {
    data: [
      { question_id: questionId, user_id: learnerId, display_name: "Ada Learner" },
    ],
    error: null,
  };
}

function contextResults() {
  return {
    cohorts: [{ data: [{ id: cohortId, name: "Release 0" }], error: null }],
  };
}

function historicalContextResult(title = "Test a login flow"): QueryResult {
  return {
    data: [{ question_id: questionId, task_title: title }],
    error: null,
  };
}

const learnerPrincipal = {
  userId: learnerId,
  roles: ["learner"],
  permissions: [],
  cohortIds: [cohortId],
};

const trainerPrincipal = {
  userId: trainerId,
  roles: ["trainer"],
  permissions: ["question.manage"],
  cohortIds: [cohortId],
};

describe("question workflow repository projection", () => {
  beforeEach(() => {
    vi.mocked(getPrincipal).mockReset();
    vi.mocked(createServerClient).mockReset();
  });

  it("reads learner contexts and historical titles only from immutable snapshot RPCs", async () => {
    vi.mocked(getPrincipal).mockResolvedValue(learnerPrincipal as never);
    const client = clientFixture({
      questions: [{ data: [questionRow()], error: null }],
      cohorts: [{ data: [{ id: cohortId, name: "Release 0" }], error: null }],
      profiles: [{ data: [{ user_id: learnerId, display_name: "Ada Learner" }], error: null }],
    }, {
      list_my_available_question_contexts: {
        data: [{
          cohort_id: cohortId,
          cohort_name: "Release 0",
          task_id: taskId,
          task_title: "Login-Ablauf testen",
        }],
        error: null,
      },
      list_my_question_task_contexts: historicalContextResult(
        "Historischer Login-Ablauf",
      ),
    });
    vi.mocked(createServerClient).mockResolvedValue(client as never);

    const workspace = await readLearnerQuestionWorkspace("de");
    expect(workspace.contexts).toEqual([{
      cohortId,
      cohortName: "Release 0",
      taskId,
      taskTitle: "Login-Ablauf testen",
    }]);
    expect(workspace.questions[0]).toMatchObject({
      learnerName: "Ada Learner",
      state: "open",
      taskTitle: "Historischer Login-Ablauf",
    });
    expect(client.rpc).toHaveBeenCalledWith(
      "list_my_available_question_contexts",
      { p_locale: "de" },
    );
    expect(client.rpc).toHaveBeenCalledWith(
      "list_my_question_task_contexts",
      { p_locale: "de" },
    );
    expect(client.rpc).toHaveBeenCalledWith(
      "list_my_question_participant_contexts",
    );
    expect(client.from.mock.calls.map(([table]) => table)).not.toEqual(
      expect.arrayContaining([
        "profiles",
        "tasks",
        "task_localizations",
        "task_schedules",
        "content_versions",
      ]),
    );
  });

  it("offers published active tasks in an entitled flexible cohort without requiring a schedule", async () => {
    const unentitledCohortId = "01980a30-0000-7000-8000-000000000002";
    vi.mocked(getPrincipal).mockResolvedValue({
      ...learnerPrincipal,
      cohortIds: [cohortId, unentitledCohortId],
    } as never);
    const client = clientFixture({
      questions: [{ data: [], error: null }],
    }, {
      list_my_available_question_contexts: {
        data: [{
          cohort_id: cohortId,
          cohort_name: "Flexible Release 0",
          task_id: taskId,
          task_title: "Test a login flow",
        }],
        error: null,
      },
    });
    vi.mocked(createServerClient).mockResolvedValue(client as never);

    const workspace = await readLearnerQuestionWorkspace("en");
    expect(workspace.contexts).toEqual([{
      cohortId,
      cohortName: "Flexible Release 0",
      taskId,
      taskTitle: "Test a login flow",
    }]);
    expect(workspace.contexts).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ cohortId: unentitledCohortId }),
    ]));
  });

  it("projects learner detail with ordered messages and transfer names, but rejects a non-learner", async () => {
    vi.mocked(getPrincipal).mockResolvedValue(learnerPrincipal as never);
    const row = questionRow({
      assigned_trainer_id: trainerId,
      state: "transferred",
      row_version: 3,
      question_messages: [
        {
          id: "01980a37-0000-7000-8000-000000000002",
          author_id: trainerId,
          body: "Compare both sides.",
          message_kind: "answer",
          created_at: "2026-07-18T10:06:00.000Z",
        },
        {
          id: "01980a37-0000-7000-8000-000000000001",
          author_id: learnerId,
          body: "How should I choose the boundary?",
          message_kind: "message",
          created_at: "2026-07-18T10:00:00.000Z",
        },
      ],
      question_transfers: [{
        id: "01980a38-0000-7000-8000-000000000001",
        from_trainer_id: otherTrainerId,
        to_trainer_id: trainerId,
        reason: "Boundary specialist",
        created_at: "2026-07-18T10:03:00.000Z",
      }],
    });
    const client = clientFixture({
      questions: [{ data: row, error: null }],
      ...contextResults(),
    }, {
      list_my_question_task_contexts: historicalContextResult(),
      list_my_question_participant_contexts: {
        data: [
          { question_id: questionId, user_id: learnerId, display_name: "Ada Learner" },
          { question_id: questionId, user_id: trainerId, display_name: "Tess Trainer" },
          { question_id: questionId, user_id: otherTrainerId, display_name: "Other Trainer" },
        ],
        error: null,
      },
    });
    vi.mocked(createServerClient).mockResolvedValue(client as never);
    const detail = await readLearnerQuestionDetail("en", questionId);
    expect(detail?.messages.map((message) => message.authorKind)).toEqual([
      "learner",
      "trainer",
    ]);
    expect(detail?.transfers[0]).toMatchObject({
      fromTrainerName: "Other Trainer",
      toTrainerName: "Tess Trainer",
    });

    vi.mocked(getPrincipal).mockResolvedValue(trainerPrincipal as never);
    const noReadClient = clientFixture({});
    vi.mocked(createServerClient).mockResolvedValue(noReadClient as never);
    await expect(readLearnerQuestionDetail("en", questionId)).resolves.toBeNull();
    expect(noReadClient.from).not.toHaveBeenCalled();
  });

  it("fails closed when participant attribution is missing or exceeds the question graph", async () => {
    vi.mocked(getPrincipal).mockResolvedValue(learnerPrincipal as never);
    const row = questionRow({
      assigned_trainer_id: trainerId,
      state: "answered",
      answered_at: "2026-07-18T10:07:00.000Z",
      question_messages: [
        ...questionRow().question_messages,
        {
          id: "01980a37-0000-7000-8000-000000000002",
          author_id: trainerId,
          body: "Compare both sides.",
          message_kind: "answer",
          created_at: "2026-07-18T10:06:00.000Z",
        },
      ],
    });
    const baseResults = {
      questions: [{ data: row, error: null }],
      cohorts: [{ data: [{ id: cohortId, name: "Release 0" }], error: null }],
    };
    const taskContext = {
      list_my_question_task_contexts: historicalContextResult(),
    };

    vi.mocked(createServerClient).mockResolvedValue(clientFixture(baseResults, {
      ...taskContext,
      list_my_question_participant_contexts: {
        data: [{ question_id: questionId, user_id: learnerId, display_name: "Ada Learner" }],
        error: null,
      },
    }) as never);
    await expect(readLearnerQuestionDetail("en", questionId)).rejects.toThrow(
      "questions.participant_context_missing",
    );

    vi.mocked(createServerClient).mockResolvedValue(clientFixture(baseResults, {
      ...taskContext,
      list_my_question_participant_contexts: {
        data: [
          { question_id: questionId, user_id: learnerId, display_name: "Ada Learner" },
          { question_id: questionId, user_id: trainerId, display_name: "Tess Trainer" },
          { question_id: questionId, user_id: otherTrainerId, display_name: "Other Trainer" },
        ],
        error: null,
      },
    }) as never);
    await expect(readLearnerQuestionDetail("en", questionId)).rejects.toThrow(
      "questions.participant_scope_mismatch",
    );
  });

  it("shows open cohort questions and current-owner assignments while excluding another owner's queue", async () => {
    vi.mocked(getPrincipal).mockResolvedValue(trainerPrincipal as never);
    const ownedId = "01980a36-0000-7000-8000-000000000002";
    const otherId = "01980a36-0000-7000-8000-000000000003";
    const rows = [
      questionRow(),
      questionRow({ id: ownedId, assigned_trainer_id: trainerId, state: "assigned" }),
      questionRow({ id: otherId, assigned_trainer_id: otherTrainerId, state: "assigned" }),
    ];
    const client = clientFixture({
      questions: [{ data: rows, error: null }],
      ...contextResults(),
    }, {
      list_my_question_task_contexts: {
        data: rows.map((item) => ({
          question_id: item.id,
          task_title: "Test a login flow",
        })),
        error: null,
      },
      list_my_question_participant_contexts: {
        data: [
          { question_id: questionId, user_id: learnerId, display_name: "Ada Learner" },
          { question_id: ownedId, user_id: learnerId, display_name: "Ada Learner" },
          { question_id: ownedId, user_id: trainerId, display_name: "Tess Trainer" },
          { question_id: otherId, user_id: learnerId, display_name: "Ada Learner" },
          { question_id: otherId, user_id: otherTrainerId, display_name: "Other Trainer" },
        ],
        error: null,
      },
    });
    vi.mocked(createServerClient).mockResolvedValue(client as never);

    const queue = await readTrainerQuestionQueue("en", false);
    expect(queue.map((question) => question.id)).toEqual([questionId, ownedId]);
    expect(queue[0]?.assignedTrainerId).toBeUndefined();
  });

  it("enables actions only for the assigned trainer and returns active same-cohort candidates", async () => {
    vi.mocked(getPrincipal).mockResolvedValue(trainerPrincipal as never);
    const row = questionRow({
      assigned_trainer_id: trainerId,
      state: "assigned",
      row_version: 2,
    });
    const client = clientFixture(
      {
        questions: [{ data: row, error: null }],
        ...contextResults(),
      },
      {
        list_my_question_task_contexts: historicalContextResult(),
        list_my_question_participant_contexts: {
          data: [
            { question_id: questionId, user_id: learnerId, display_name: "Ada Learner" },
            { question_id: questionId, user_id: trainerId, display_name: "Tess Trainer" },
          ],
          error: null,
        },
        list_active_question_trainers: {
          data: [{ user_id: otherTrainerId, display_name: "Other Trainer" }],
          error: null,
        },
      },
    );
    vi.mocked(createServerClient).mockResolvedValue(client as never);

    const workspace = await readTrainerQuestionDetail("en", questionId);
    expect(workspace).toMatchObject({ canAct: true, isOwner: true });
    expect(workspace?.candidates).toEqual([{ id: otherTrainerId, name: "Other Trainer" }]);
    expect(client.rpc).toHaveBeenCalledWith("list_active_question_trainers", {
      p_cohort_id: cohortId,
    });
  });

  it("fails closed for unauthorized queue access and surfaces read errors", async () => {
    vi.mocked(getPrincipal).mockResolvedValue(learnerPrincipal as never);
    vi.mocked(createServerClient).mockResolvedValue(clientFixture({}) as never);
    await expect(readTrainerQuestionQueue("en", false)).rejects.toThrow(
      "questions.forbidden",
    );

    vi.mocked(getPrincipal).mockResolvedValue(trainerPrincipal as never);
    vi.mocked(createServerClient).mockResolvedValue(clientFixture({
      questions: [{ data: null, error: new Error("provider unavailable") }],
    }) as never);
    await expect(readTrainerQuestionQueue("en", false)).rejects.toThrow(
      "questions.queue_read_failed",
    );
  });

  it("fails closed when a snapshot context RPC returns an unpinned shape", async () => {
    vi.mocked(getPrincipal).mockResolvedValue(learnerPrincipal as never);
    const client = clientFixture({
      questions: [{ data: [], error: null }],
    }, {
      list_my_available_question_contexts: {
        data: [{
          cohort_id: cohortId,
          cohort_name: "Release 0",
          task_id: taskId,
          task_title: "Test a login flow",
          model_answer: "must never cross the boundary",
        }],
        error: null,
      },
    });
    vi.mocked(createServerClient).mockResolvedValue(client as never);

    await expect(readLearnerQuestionWorkspace("en")).rejects.toThrow();
  });
});
