import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/shared/database/server", () => ({ createServerClient: vi.fn() }));

import { createServerClient } from "@/shared/database/server";

import { readTaskWorkspace, TaskNotAccessibleError } from "./data";

type QueryResult = { data: unknown; error: unknown };

const ids = {
  learner: "01980a00-0000-7000-8000-000000000001",
  enrollment: "01980a33-0000-7000-8000-000000000001",
  course: "01980a20-0000-7000-8000-000000000001",
  cohort: "01980a30-0000-7000-8000-000000000001",
  version: "01980a22-0000-7000-8000-000000000001",
  stage: "01980a23-0000-7000-8000-000000000001",
  task: "01980a26-0000-7000-8000-000000000001",
  hint: "01980a28-0000-7000-8000-000000000001",
  optionOne: "01980a27-0000-7000-8000-000000000001",
  optionTwo: "01980a27-0000-7000-8000-000000000002",
  attempt: "01980a34-0000-7000-8000-000000000001",
  submission: "01980a35-0000-7000-8000-000000000001",
  submissionVersion: "01980a36-0000-7000-8000-000000000001",
  evidence: "01980a70-0000-7000-8000-000000000001",
};

function taskProjection(overrides: Record<string, unknown> = {}) {
  const localized = { en: "English", de: "Deutsch", ru: "Русский" };
  return {
    id: ids.task,
    version_number: 2,
    content_version_id: ids.version,
    content_version_state: "published",
    course_id: ids.course,
    enrollment_id: ids.enrollment,
    cohort_id: ids.cohort,
    cohort_state: "active",
    stage_id: ids.stage,
    title: { ...localized, en: "Test login" },
    instructions: { ...localized, en: "Collect evidence." },
    target_url: "https://lab.example.test/login",
    hint: { id: ids.hint, content: localized },
    assessment: {
      id: `assessment:${ids.task}`,
      question: localized,
      selection_mode: "single",
      options: [
        { id: ids.optionOne, label: localized },
        { id: ids.optionTwo, label: localized },
      ],
    },
    activated_at: "2026-07-18T08:00:00+00:00",
    access: "available",
    ...overrides,
  };
}

function queryBuilder(result: QueryResult) {
  const builder = {
    select: vi.fn(),
    eq: vi.fn(),
    order: vi.fn(),
    limit: vi.fn(),
    maybeSingle: vi.fn(),
    then: vi.fn(),
  };
  builder.select.mockReturnValue(builder);
  builder.eq.mockReturnValue(builder);
  builder.order.mockReturnValue(builder);
  builder.limit.mockReturnValue(builder);
  builder.maybeSingle.mockResolvedValue(result);
  builder.then.mockImplementation((resolve, reject) =>
    Promise.resolve(result).then(resolve, reject),
  );
  return builder;
}

function clientFixture(
  rpcResult: QueryResult,
  tableResults: Record<string, QueryResult[]> = {},
) {
  const queues = new Map(
    Object.entries(tableResults).map(([table, results]) => [table, [...results]]),
  );
  return {
    rpc: vi.fn().mockResolvedValue(rpcResult),
    from: vi.fn((table: string) => {
      const result = queues.get(table)?.shift();
      if (!result) throw new Error(`Unexpected normalized query for ${table}`);
      return queryBuilder(result);
    }),
  };
}

function attemptRow(overrides: Record<string, unknown> = {}) {
  return {
    id: ids.attempt,
    learner_id: ids.learner,
    cohort_id: ids.cohort,
    sequence_number: 1,
    state: "in_progress",
    row_version: 2,
    elapsed_seconds: 120,
    hint_used: false,
    hint_first_used_at: null,
    started_at: "2026-07-18T08:00:00+00:00",
    submitted_at: null,
    accepted_at: null,
    created_at: "2026-07-18T08:00:00+00:00",
    updated_at: "2026-07-18T08:02:00+00:00",
    ...overrides,
  };
}

describe("readTaskWorkspace", () => {
  beforeEach(() => vi.mocked(createServerClient).mockReset());

  it("uses the safe pinned task RPC and reads only the actor-owned attempt", async () => {
    const client = clientFixture(
      { data: taskProjection(), error: null },
      { attempts: [{ data: null, error: null }] },
    );
    vi.mocked(createServerClient).mockResolvedValue(client as never);

    const workspace = await readTaskWorkspace(ids.task);

    expect(client.rpc).toHaveBeenCalledWith("get_my_learning_task", {
      p_task_id: ids.task,
    });
    expect(client.from).toHaveBeenCalledTimes(1);
    expect(client.from).toHaveBeenCalledWith("attempts");
    expect(workspace.task).toMatchObject({
      id: ids.task,
      version: 2,
      groupId: ids.cohort,
      access: "available",
    });
    expect(workspace.enrollmentId).toBe(ids.enrollment);
    expect(workspace.attempt).toBeUndefined();
  });

  it("hydrates learner-owned draft history without rereading mutable task content", async () => {
    const client = clientFixture(
      { data: taskProjection(), error: null },
      {
        attempts: [{ data: attemptRow(), error: null }],
        attempt_drafts: [{
          data: {
            answer_text: "Boundary cases",
            selected_option_ids: [ids.optionOne],
            evidence_draft: [],
            row_version: 3,
          },
          error: null,
        }],
        submissions: [{ data: null, error: null }],
        attempt_hint_usage: [{ data: [], error: null }],
      },
    );
    vi.mocked(createServerClient).mockResolvedValue(client as never);

    const workspace = await readTaskWorkspace(ids.task);

    expect(workspace.attempt).toMatchObject({
      id: ids.attempt,
      answerText: "Boundary cases",
      selectedAnswerIds: [ids.optionOne],
      draftVersion: 3,
    });
    expect(client.from.mock.calls.map(([table]) => table)).toEqual([
      "attempts",
      "attempt_drafts",
      "submissions",
      "attempt_hint_usage",
    ]);
    expect(client.from).not.toHaveBeenCalledWith("tasks");
    expect(client.from).not.toHaveBeenCalledWith("task_options");
    expect(client.from).not.toHaveBeenCalledWith("task_localizations");
  });

  it("preserves abandoned attempts as a terminal learner-visible state", async () => {
    const client = clientFixture(
      { data: taskProjection(), error: null },
      {
        attempts: [{ data: attemptRow({ state: "abandoned" }), error: null }],
        attempt_drafts: [{ data: null, error: null }],
        submissions: [{ data: null, error: null }],
        attempt_hint_usage: [{ data: [], error: null }],
      },
    );
    vi.mocked(createServerClient).mockResolvedValue(client as never);

    const workspace = await readTaskWorkspace(ids.task);

    expect(workspace.attempt).toMatchObject({
      id: ids.attempt,
      state: "abandoned",
    });
  });

  it("hydrates immutable evidence and hint facts after the mutable draft is deleted", async () => {
    const client = clientFixture(
      { data: taskProjection(), error: null },
      {
        attempts: [{
          data: attemptRow({
            state: "submitted",
            submitted_at: "2026-07-18T08:05:00+00:00",
          }),
          error: null,
        }],
        attempt_drafts: [{ data: null, error: null }],
        submissions: [{
          data: {
            id: ids.submission,
            state: "submitted",
            latest_version_number: 1,
          },
          error: null,
        }],
        attempt_hint_usage: [{
          data: [{
            hint_id: ids.hint,
            first_used_at: "2026-07-18T08:04:59+00:00",
          }],
          error: null,
        }],
        submission_versions: [{
          data: [{
            id: ids.submissionVersion,
            version_number: 1,
            answer_text: "Immutable submitted answer",
            selected_option_ids: [ids.optionOne],
            elapsed_seconds: 301,
            submitted_at: "2026-07-18T08:05:00+00:00",
          }],
          error: null,
        }],
        reviews: [{ data: [], error: null }],
        submission_version_evidence: [{
          data: [{
            position: 0,
            evidence_id: ids.evidence,
            evidence: {
              id: ids.evidence,
              evidence_kind: "external",
              title: "Login boundary report",
              source_uri: "https://evidence.example.test/login-report",
              captured_at: "2026-07-18T08:04:00+00:00",
            },
          }],
          error: null,
        }],
        submission_version_hint_usage: [{
          data: [{
            hint_id: ids.hint,
            first_used_at: "2026-07-18T08:03:00+00:00",
          }],
          error: null,
        }],
      },
    );
    vi.mocked(createServerClient).mockResolvedValue(client as never);

    const workspace = await readTaskWorkspace(ids.task);

    expect(workspace.attempt).toMatchObject({
      state: "submitted",
      answerText: "Immutable submitted answer",
      evidence: [{
        id: ids.evidence,
        kind: "link",
        name: "Login boundary report",
        uri: "https://evidence.example.test/login-report",
      }],
      hintUsage: [{
        hintId: ids.hint,
        usedAt: "2026-07-18T08:03:00.000Z",
      }],
      immutableSnapshot: {
        evidence: [{ id: ids.evidence }],
        hintUsage: [{ hintId: ids.hint }],
      },
    });
    expect(client.from.mock.calls.map(([table]) => table)).toContain(
      "submission_version_evidence",
    );
    expect(client.from.mock.calls.map(([table]) => table)).toContain(
      "submission_version_hint_usage",
    );
  });

  it("fails closed on a malformed immutable evidence snapshot", async () => {
    const client = clientFixture(
      { data: taskProjection(), error: null },
      {
        attempts: [{ data: attemptRow({ state: "submitted" }), error: null }],
        attempt_drafts: [{ data: null, error: null }],
        submissions: [{
          data: {
            id: ids.submission,
            state: "submitted",
            latest_version_number: 1,
          },
          error: null,
        }],
        attempt_hint_usage: [{ data: [], error: null }],
        submission_versions: [{
          data: [{
            id: ids.submissionVersion,
            version_number: 1,
            answer_text: "Submitted answer",
            selected_option_ids: [],
            elapsed_seconds: 1,
            submitted_at: "2026-07-18T08:05:00+00:00",
          }],
          error: null,
        }],
        reviews: [{ data: [], error: null }],
        submission_version_evidence: [{
          data: [{
            position: 0,
            evidence_id: ids.evidence,
            evidence: {
              id: ids.evidence,
              evidence_kind: "external",
              title: "Unsafe evidence",
              source_uri: "https:///missing-host",
              captured_at: "2026-07-18T08:04:00+00:00",
            },
          }],
          error: null,
        }],
        submission_version_hint_usage: [{ data: [], error: null }],
      },
    );
    vi.mocked(createServerClient).mockResolvedValue(client as never);

    await expect(readTaskWorkspace(ids.task)).rejects.toThrow(
      "tasks.invalid_external_evidence_snapshot",
    );
  });

  it("fails closed when persistence returns an unknown attempt state", async () => {
    const client = clientFixture(
      { data: taskProjection(), error: null },
      {
        attempts: [{ data: attemptRow({ state: "expired" }), error: null }],
        attempt_drafts: [{ data: null, error: null }],
        submissions: [{ data: null, error: null }],
        attempt_hint_usage: [{ data: [], error: null }],
      },
    );
    vi.mocked(createServerClient).mockResolvedValue(client as never);

    await expect(readTaskWorkspace(ids.task)).rejects.toThrow(
      "tasks.invalid_attempt_state",
    );
  });

  it("fails closed before any normalized read for forbidden or unsafe projections", async () => {
    const forbiddenClient = clientFixture({ data: null, error: null });
    vi.mocked(createServerClient).mockResolvedValue(forbiddenClient as never);
    await expect(readTaskWorkspace(ids.task)).rejects.toBeInstanceOf(
      TaskNotAccessibleError,
    );
    expect(forbiddenClient.from).not.toHaveBeenCalled();

    const unsafeClient = clientFixture({
      data: { ...taskProjection(), model_answer: "hidden answer" },
      error: null,
    });
    vi.mocked(createServerClient).mockResolvedValue(unsafeClient as never);
    await expect(readTaskWorkspace(ids.task)).rejects.toThrow();
    expect(unsafeClient.from).not.toHaveBeenCalled();

    const erroredClient = clientFixture({ data: null, error: { code: "42501" } });
    vi.mocked(createServerClient).mockResolvedValue(erroredClient as never);
    await expect(readTaskWorkspace(ids.task)).rejects.toThrow("tasks.read_failed");
    expect(erroredClient.from).not.toHaveBeenCalled();
  });
});
