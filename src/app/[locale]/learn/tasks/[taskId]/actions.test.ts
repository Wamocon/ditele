import { createHash } from "node:crypto";

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/[locale]/_data/principal", () => ({ getPrincipal: vi.fn() }));
vi.mock("@/shared/database/server", () => ({ createServerClient: vi.fn() }));
vi.mock("./data", () => ({ readTaskWorkspace: vi.fn() }));

import { getPrincipal } from "@/app/[locale]/_data/principal";
import type {
  AttemptDetail,
  EvidenceRef,
  SaveAttemptDraftInput,
  SubmitAttemptInput,
} from "@/features/tasks/model/attempt";
import type { CreateExternalEvidenceInput } from "@/features/tasks/model/external-evidence";
import type { Principal } from "@/shared/auth/types";
import { createServerClient } from "@/shared/database/server";

import {
  createExternalTaskEvidenceAction,
  saveAttemptDraftAction,
  submitAttemptAction,
} from "./actions";
import { readTaskWorkspace } from "./data";

type QueryResult = Readonly<{ data: unknown; error: unknown }>;
type RpcOutcome = QueryResult | Error;

const ids = {
  learner: "01980a00-0000-7000-8000-000000000001",
  foreignLearner: "01980a00-0000-7000-8000-000000000099",
  organization: "01980a10-0000-7000-8000-000000000001",
  foreignOrganization: "01980a10-0000-7000-8000-000000000099",
  enrollment: "01980a33-0000-7000-8000-000000000001",
  foreignEnrollment: "01980a33-0000-7000-8000-000000000099",
  cohort: "01980a30-0000-7000-8000-000000000001",
  foreignCohort: "01980a30-0000-7000-8000-000000000099",
  course: "01980a20-0000-7000-8000-000000000001",
  contentVersion: "01980a22-0000-7000-8000-000000000001",
  task: "01980a26-0000-7000-8000-000000000001",
  foreignTask: "01980a26-0000-7000-8000-000000000099",
  attempt: "01980a34-0000-7000-8000-000000000001",
  foreignAttempt: "01980a34-0000-7000-8000-000000000099",
  optionOne: "01980a27-0000-7000-8000-000000000001",
  optionTwo: "01980a27-0000-7000-8000-000000000002",
  hint: "01980a28-0000-7000-8000-000000000001",
  evidenceOne: "01980a81-0000-7000-8000-000000000001",
  evidenceTwo: "01980a81-0000-7000-8000-000000000002",
  correlation: "01980a90-0000-7000-8000-000000000001",
} as const;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const learner: Principal = {
  userId: ids.learner,
  sessionId: "task-action-test-session",
  organizationId: ids.organization,
  primaryRole: "learner",
  roles: ["learner"],
  permissions: ["task.attempt"],
  cohortIds: [ids.cohort],
};

const actionContext = {
  enrollmentId: ids.enrollment,
  groupId: ids.cohort,
  taskId: ids.task,
};

function linkEvidence(
  overrides: Partial<Extract<EvidenceRef, { kind: "link" }>> = {},
): Extract<EvidenceRef, { kind: "link" }> {
  return {
    id: ids.evidenceOne,
    kind: "link",
    name: "Browser trace",
    uri: "https://evidence.example.test/runs/login-boundary",
    createdAt: "2026-07-20T08:15:30.000Z",
    ...overrides,
  };
}

function attemptDetail(overrides: Partial<AttemptDetail> = {}): AttemptDetail {
  return {
    id: ids.attempt,
    taskId: ids.task,
    learnerId: ids.learner,
    groupId: ids.cohort,
    attemptNumber: 1,
    state: "draft",
    version: 2,
    draftVersion: 1,
    createdAt: "2026-07-20T08:00:00.000Z",
    updatedAt: "2026-07-20T08:10:00.000Z",
    answerText: "The login boundary rejects a locked account.",
    selectedAnswerIds: [ids.optionOne],
    evidence: [],
    hintUsage: [],
    solvingDurationSeconds: 120,
    startedAt: "2026-07-20T08:00:00.000Z",
    reviewHistory: [],
    ...overrides,
  };
}

function saveInput(
  overrides: Partial<SaveAttemptDraftInput> = {},
): SaveAttemptDraftInput {
  return {
    taskId: ids.task,
    groupId: ids.cohort,
    taskVersionId: `${ids.task}:2`,
    expectedVersion: 1,
    answerText: "The login boundary rejects a locked account.",
    selectedAnswerIds: [ids.optionOne],
    evidence: [],
    usedHintIds: [ids.hint],
    solvingDurationSeconds: 120,
    idempotencyKey: "task-save-action-test-0001",
    ...overrides,
  };
}

function submitInput(
  overrides: Partial<SubmitAttemptInput> = {},
): SubmitAttemptInput {
  return {
    ...saveInput(),
    attemptId: ids.attempt,
    idempotencyKey: "task-submit-action-test-0001",
    ...overrides,
  };
}

function evidenceInput(
  overrides: Partial<CreateExternalEvidenceInput> = {},
): CreateExternalEvidenceInput {
  return {
    attemptId: ids.attempt,
    title: "Browser trace",
    sourceUri: "https://evidence.example.test/runs/login-boundary",
    idempotencyKey: "task-evidence-action-test-0001",
    ...overrides,
  };
}

function startRow(overrides: Record<string, unknown> = {}) {
  return {
    attempt_id: ids.attempt,
    organization_id: ids.organization,
    enrollment_id: ids.enrollment,
    cohort_id: ids.cohort,
    course_id: ids.course,
    content_version_id: ids.contentVersion,
    task_id: ids.task,
    attempt_state: "in_progress",
    attempt_row_version: 1,
    replayed: false,
    correlation_id: ids.correlation,
    ...overrides,
  };
}

function attemptRow(overrides: Record<string, unknown> = {}) {
  return {
    id: ids.attempt,
    organization_id: ids.organization,
    enrollment_id: ids.enrollment,
    learner_id: ids.learner,
    cohort_id: ids.cohort,
    task_id: ids.task,
    ...overrides,
  };
}

function expectedEvidenceDigest(title: string, sourceUri: string): string {
  return createHash("sha256")
    .update("ditele-external-evidence-reference-v1\0", "utf8")
    .update(title, "utf8")
    .update("\0", "utf8")
    .update(sourceUri, "utf8")
    .digest("hex");
}

function externalEvidenceRow(overrides: Record<string, unknown> = {}) {
  const input = evidenceInput();
  return {
    id: ids.evidenceOne,
    organization_id: ids.organization,
    owner_id: ids.learner,
    task_id: ids.task,
    evidence_kind: "external",
    title: input.title,
    source_uri: input.sourceUri,
    sha256_hex: expectedEvidenceDigest(input.title, input.sourceUri),
    captured_at: "2026-07-20T10:15:30+02:00",
    ...overrides,
  };
}

function queryBuilder(result: QueryResult) {
  const builder = {
    select: vi.fn(),
    eq: vi.fn(),
    maybeSingle: vi.fn().mockResolvedValue(result),
  };
  builder.select.mockReturnValue(builder);
  builder.eq.mockReturnValue(builder);
  return builder;
}

function clientFixture({
  attempt = { data: attemptRow(), error: null },
  start = { data: [startRow()], error: null },
  save = { data: null, error: null },
  submit = { data: null, error: null },
  evidence = { data: externalEvidenceRow(), error: null },
}: Readonly<{
  attempt?: QueryResult;
  start?: QueryResult;
  save?: QueryResult;
  submit?: QueryResult | readonly RpcOutcome[];
  evidence?: QueryResult;
}> = {}) {
  const attemptQuery = queryBuilder(attempt);
  const submitOutcomes: RpcOutcome[] = Array.isArray(submit)
    ? [...submit]
    : [submit as QueryResult];
  const rpc = vi.fn((name: string, _arguments?: unknown) => {
    void _arguments;
    switch (name) {
      case "start_attempt":
        return Promise.resolve(start);
      case "save_attempt_draft":
        return Promise.resolve(save);
      case "submit_attempt":
        {
          const outcome = submitOutcomes.shift();
          if (!outcome) throw new Error("Unexpected repeated submit_attempt RPC");
          return outcome instanceof Error
            ? Promise.reject(outcome)
            : Promise.resolve(outcome);
        }
      case "create_external_task_evidence":
        return Promise.resolve(evidence);
      default:
        throw new Error(`Unexpected task workflow RPC: ${name}`);
    }
  });
  return {
    rpc,
    from: vi.fn((table: string) => {
      if (table !== "attempts") {
        throw new Error(`Unexpected task workflow table: ${table}`);
      }
      return attemptQuery;
    }),
    attemptQuery,
  };
}

function mutationCalls(client: ReturnType<typeof clientFixture>) {
  return client.rpc.mock.calls.filter(
    ([name]) =>
      name === "start_attempt" ||
      name === "save_attempt_draft" ||
      name === "submit_attempt" ||
      name === "create_external_task_evidence",
  );
}

describe("learner task server actions", () => {
  beforeEach(() => {
    vi.mocked(getPrincipal).mockReset();
    vi.mocked(createServerClient).mockReset();
    vi.mocked(readTaskWorkspace).mockReset();
    vi.mocked(getPrincipal).mockResolvedValue(learner);
    vi.mocked(readTaskWorkspace).mockResolvedValue({
      task: {} as never,
      enrollmentId: ids.enrollment,
      attempt: attemptDetail(),
    });
  });

  it("starts against the exact enrollment and verifies the actor-owned attempt before saving", async () => {
    const client = clientFixture();
    vi.mocked(createServerClient).mockResolvedValue(client as never);

    await expect(
      saveAttemptDraftAction(actionContext, saveInput()),
    ).resolves.toMatchObject({ id: ids.attempt, state: "draft" });

    expect(client.rpc).toHaveBeenNthCalledWith(1, "start_attempt", {
      p_enrollment_id: ids.enrollment,
      p_task_id: ids.task,
      p_idempotency_key: "task-save-action-test-0001",
      p_correlation_id: expect.stringMatching(UUID_PATTERN),
    });
    expect(client.from).toHaveBeenCalledWith("attempts");
    expect(client.attemptQuery.eq.mock.calls).toEqual([
      ["id", ids.attempt],
      ["learner_id", ids.learner],
    ]);
    expect(client.rpc).toHaveBeenNthCalledWith(2, "save_attempt_draft", {
      p_attempt_id: ids.attempt,
      p_expected_draft_version: 1,
      p_answer_text: "The login boundary rejects a locked account.",
      p_selected_option_ids: [ids.optionOne],
      p_evidence_draft: [],
      p_elapsed_seconds: 120,
      p_used_hint_ids: [ids.hint],
    });
  });

  it("uses an existing actor-owned attempt without starting another one and preserves the draft payload", async () => {
    const client = clientFixture();
    const evidence = linkEvidence();
    vi.mocked(createServerClient).mockResolvedValue(client as never);

    await saveAttemptDraftAction(
      actionContext,
      saveInput({
        attemptId: ids.attempt,
        answerText: "Saved with an external trace.",
        selectedAnswerIds: [ids.optionOne, ids.optionTwo],
        evidence: [evidence],
        usedHintIds: [],
        solvingDurationSeconds: 431,
        expectedVersion: 7,
      }),
    );

    expect(client.rpc).toHaveBeenCalledTimes(1);
    expect(client.rpc).not.toHaveBeenCalledWith(
      "start_attempt",
      expect.anything(),
    );
    expect(client.rpc).toHaveBeenCalledWith("save_attempt_draft", {
      p_attempt_id: ids.attempt,
      p_expected_draft_version: 7,
      p_answer_text: "Saved with an external trace.",
      p_selected_option_ids: [ids.optionOne, ids.optionTwo],
      p_evidence_draft: [{ ...evidence }],
      p_elapsed_seconds: 431,
      p_used_hint_ids: [],
    });
  });

  it("submits only validated evidence identifiers with CAS, idempotency, and a fresh correlation id", async () => {
    const client = clientFixture();
    const evidenceOne = linkEvidence();
    const evidenceTwo = linkEvidence({
      id: ids.evidenceTwo,
      name: "API trace",
      uri: "https://evidence.example.test/runs/api-boundary",
    });
    vi.mocked(createServerClient).mockResolvedValue(client as never);
    vi.mocked(readTaskWorkspace).mockResolvedValue({
      task: {} as never,
      enrollmentId: ids.enrollment,
      attempt: attemptDetail({ state: "submitted", version: 3 }),
    });

    await expect(
      submitAttemptAction(
        actionContext,
        submitInput({
          expectedVersion: 2,
          selectedAnswerIds: [ids.optionTwo],
          evidence: [evidenceOne, evidenceTwo],
        }),
      ),
    ).resolves.toMatchObject({ id: ids.attempt, state: "submitted" });

    expect(client.rpc).toHaveBeenCalledTimes(1);
    expect(client.rpc).toHaveBeenCalledWith("submit_attempt", {
      p_attempt_id: ids.attempt,
      p_expected_version: 2,
      p_idempotency_key: "task-submit-action-test-0001",
      p_answer_text: "The login boundary rejects a locked account.",
      p_selected_option_ids: [ids.optionTwo],
      p_evidence_refs: [ids.evidenceOne, ids.evidenceTwo],
      p_correlation_id: expect.stringMatching(UUID_PATTERN),
    });
  });

  it("recovers a committed submission whose first response was lost by replaying the exact command", async () => {
    const client = clientFixture({
      submit: [
        {
          data: null,
          error: { code: "", message: "TypeError: fetch failed after commit" },
        },
        { data: null, error: null },
      ],
    });
    vi.mocked(createServerClient).mockResolvedValue(client as never);
    vi.mocked(readTaskWorkspace).mockResolvedValue({
      task: {} as never,
      enrollmentId: ids.enrollment,
      attempt: attemptDetail({ state: "submitted", version: 3 }),
    });

    await expect(
      submitAttemptAction(actionContext, submitInput()),
    ).resolves.toMatchObject({ id: ids.attempt, state: "submitted", version: 3 });

    const submitCalls = client.rpc.mock.calls.filter(
      ([name]) => name === "submit_attempt",
    );
    expect(submitCalls).toHaveLength(2);
    expect(submitCalls[1]?.[1]).toEqual(submitCalls[0]?.[1]);
    expect(readTaskWorkspace).toHaveBeenCalledOnce();
  });

  it("keeps an ambiguous double failure recoverable with the same exact command", async () => {
    const client = clientFixture({
      submit: [
        new TypeError("first response lost"),
        new TypeError("replay response lost"),
      ],
    });
    vi.mocked(createServerClient).mockResolvedValue(client as never);

    await expect(
      submitAttemptAction(actionContext, submitInput()),
    ).rejects.toThrow("tasks.submit_failed");

    const submitCalls = client.rpc.mock.calls.filter(
      ([name]) => name === "submit_attempt",
    );
    expect(submitCalls).toHaveLength(2);
    expect(submitCalls[1]?.[1]).toEqual(submitCalls[0]?.[1]);
    expect(readTaskWorkspace).not.toHaveBeenCalled();
  });

  it.each([
    ["a genuine database timeout", "57014"],
    ["a stale or concurrent attempt", "40001"],
    ["an idempotency conflict", "23505"],
  ])("does not misclassify %s as a lost response", async (_label, code) => {
    const providerError = { code, message: "authoritative database failure" };
    const client = clientFixture({
      submit: { data: null, error: providerError },
    });
    vi.mocked(createServerClient).mockResolvedValue(client as never);

    await expect(
      submitAttemptAction(actionContext, submitInput()),
    ).rejects.toMatchObject({
      message: "tasks.submit_failed",
      cause: providerError,
    });
    expect(client.rpc).toHaveBeenCalledTimes(1);
    expect(readTaskWorkspace).not.toHaveBeenCalled();
  });

  it("surfaces a concurrent stale result from the exact recovery replay", async () => {
    const stale = { code: "40001", message: "attempt became stale" };
    const client = clientFixture({
      submit: [
        new TypeError("first response lost"),
        { data: null, error: stale },
      ],
    });
    vi.mocked(createServerClient).mockResolvedValue(client as never);

    await expect(
      submitAttemptAction(actionContext, submitInput()),
    ).rejects.toThrow("tasks.submit_failed");
    const submitCalls = client.rpc.mock.calls.filter(
      ([name]) => name === "submit_attempt",
    );
    expect(submitCalls).toHaveLength(2);
    expect(submitCalls[1]?.[1]).toEqual(submitCalls[0]?.[1]);
    expect(readTaskWorkspace).not.toHaveBeenCalled();
  });

  it("creates a canonical HTTPS link reference with a deterministic SHA-256 digest", async () => {
    const input = evidenceInput({ title: "  Browser trace  " });
    const canonicalTitle = "Browser trace";
    const digest = expectedEvidenceDigest(canonicalTitle, input.sourceUri);
    const client = clientFixture({
      evidence: {
        data: externalEvidenceRow({ title: canonicalTitle, sha256_hex: digest }),
        error: null,
      },
    });
    vi.mocked(createServerClient).mockResolvedValue(client as never);

    await expect(
      createExternalTaskEvidenceAction(actionContext, input),
    ).resolves.toEqual({
      id: ids.evidenceOne,
      kind: "link",
      name: canonicalTitle,
      uri: input.sourceUri,
      createdAt: "2026-07-20T08:15:30.000Z",
    });

    expect(digest).toMatch(/^[0-9a-f]{64}$/);
    expect(client.rpc).toHaveBeenCalledWith(
      "create_external_task_evidence",
      {
        p_attempt_id: ids.attempt,
        p_title: canonicalTitle,
        p_source_uri: input.sourceUri,
        p_sha256_hex: digest,
        p_idempotency_key: "task-evidence-action-test-0001",
      },
    );
  });

  it.each([
    ["an invalid action context", { ...actionContext, enrollmentId: "not-a-uuid" }, saveInput()],
    ["a task/context mismatch", { ...actionContext, taskId: ids.foreignTask }, saveInput()],
    ["a version outside the requested task", actionContext, saveInput({ taskVersionId: `${ids.foreignTask}:2` })],
    ["a short idempotency key", actionContext, saveInput({ idempotencyKey: "too-short" })],
  ])("rejects %s before session or database work", async (_label, context, input) => {
    await expect(saveAttemptDraftAction(context, input)).rejects.toThrow();
    expect(getPrincipal).not.toHaveBeenCalled();
    expect(createServerClient).not.toHaveBeenCalled();
  });

  it.each([
    ["a non-HTTPS URL", "http://evidence.example.test/run"],
    ["a credential-bearing URL", "https://learner:secret@evidence.example.test/run"],
    ["an executable URL", "javascript:alert(1)"],
  ])("rejects %s before creating an attempt or evidence", async (_label, sourceUri) => {
    await expect(
      createExternalTaskEvidenceAction(
        actionContext,
        evidenceInput({ sourceUri }),
      ),
    ).rejects.toThrow();
    expect(getPrincipal).not.toHaveBeenCalled();
    expect(createServerClient).not.toHaveBeenCalled();
  });

  it("rejects non-UUID submission evidence before authentication or mutation", async () => {
    await expect(
      submitAttemptAction(
        actionContext,
        submitInput({ evidence: [linkEvidence({ id: "foreign-reference" })] }),
      ),
    ).rejects.toThrow();
    expect(getPrincipal).not.toHaveBeenCalled();
    expect(createServerClient).not.toHaveBeenCalled();
  });

  it.each([
    ["a non-learner", { ...learner, primaryRole: "trainer" as const, roles: ["trainer" as const] }],
    ["an actor without an organization", { ...learner, organizationId: null }],
  ])("does not mutate for %s", async (_label, principal) => {
    const client = clientFixture();
    vi.mocked(getPrincipal).mockResolvedValue(principal);
    vi.mocked(createServerClient).mockResolvedValue(client as never);

    await expect(
      saveAttemptDraftAction(actionContext, saveInput()),
    ).rejects.toThrow("tasks.forbidden");
    expect(mutationCalls(client)).toHaveLength(0);
    expect(client.from).not.toHaveBeenCalled();
  });

  it.each([
    ["organization", { organization_id: ids.foreignOrganization }],
    ["enrollment", { enrollment_id: ids.foreignEnrollment }],
    ["cohort", { cohort_id: ids.foreignCohort }],
    ["task", { task_id: ids.foreignTask }],
  ])("fails closed when start_attempt returns a foreign %s", async (_label, override) => {
    const client = clientFixture({
      start: { data: [startRow(override)], error: null },
    });
    vi.mocked(createServerClient).mockResolvedValue(client as never);

    await expect(
      saveAttemptDraftAction(actionContext, saveInput()),
    ).rejects.toThrow("tasks.start_context_mismatch");
    expect(client.from).not.toHaveBeenCalled();
    expect(client.rpc).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["organization", { organization_id: ids.foreignOrganization }],
    ["enrollment", { enrollment_id: ids.foreignEnrollment }],
    ["learner", { learner_id: ids.foreignLearner }],
    ["cohort", { cohort_id: ids.foreignCohort }],
    ["task", { task_id: ids.foreignTask }],
  ])("fails closed when the ownership re-read returns a foreign %s", async (_label, override) => {
    const client = clientFixture({
      attempt: { data: attemptRow(override), error: null },
    });
    vi.mocked(createServerClient).mockResolvedValue(client as never);

    await expect(
      saveAttemptDraftAction(
        actionContext,
        saveInput({ attemptId: ids.attempt }),
      ),
    ).rejects.toThrow("tasks.forbidden");
    expect(client.rpc).not.toHaveBeenCalled();
  });

  it("rejects a malformed or multi-row start receipt before reading an attempt", async () => {
    const client = clientFixture({
      start: { data: [startRow(), startRow({ attempt_id: ids.foreignAttempt })], error: null },
    });
    vi.mocked(createServerClient).mockResolvedValue(client as never);

    await expect(
      saveAttemptDraftAction(actionContext, saveInput()),
    ).rejects.toThrow();
    expect(client.from).not.toHaveBeenCalled();
    expect(client.rpc).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["organization", { organization_id: ids.foreignOrganization }],
    ["owner", { owner_id: ids.foreignLearner }],
    ["task", { task_id: ids.foreignTask }],
    ["title", { title: "A different trace" }],
    ["URI", { source_uri: "https://evidence.example.test/runs/other" }],
    ["digest", { sha256_hex: "a".repeat(64) }],
  ])("fails closed when evidence creation returns a mismatched %s", async (_label, override) => {
    const client = clientFixture({
      evidence: { data: externalEvidenceRow(override), error: null },
    });
    vi.mocked(createServerClient).mockResolvedValue(client as never);

    await expect(
      createExternalTaskEvidenceAction(actionContext, evidenceInput()),
    ).rejects.toThrow("tasks.evidence_context_mismatch");
    expect(client.rpc).toHaveBeenCalledTimes(1);
  });

  it.each([
    [
      "save",
      () =>
        saveAttemptDraftAction(
          actionContext,
          saveInput({ attemptId: ids.attempt }),
        ),
      "tasks.saved_attempt_unavailable",
    ],
    [
      "submit",
      () => submitAttemptAction(actionContext, submitInput()),
      "tasks.submitted_attempt_unavailable",
    ],
  ] as const)("rejects a foreign workspace after %s succeeds", async (_label, invoke, errorKey) => {
    const client = clientFixture();
    vi.mocked(createServerClient).mockResolvedValue(client as never);
    vi.mocked(readTaskWorkspace).mockResolvedValue({
      task: {} as never,
      enrollmentId: ids.enrollment,
      attempt: attemptDetail({ id: ids.foreignAttempt }),
    });

    await expect(invoke()).rejects.toThrow(errorKey);
  });

  it("surfaces a start provider failure without reading or saving an attempt", async () => {
    const providerError = { code: "57014", message: "start timeout" };
    const client = clientFixture({
      start: { data: null, error: providerError },
    });
    vi.mocked(createServerClient).mockResolvedValue(client as never);

    await expect(
      saveAttemptDraftAction(actionContext, saveInput()),
    ).rejects.toThrow("tasks.start_failed");
    expect(client.from).not.toHaveBeenCalled();
    expect(client.rpc).toHaveBeenCalledTimes(1);
  });

  it("surfaces an ownership re-read provider failure before a mutation", async () => {
    const client = clientFixture({
      attempt: {
        data: null,
        error: { code: "57014", message: "attempt read timeout" },
      },
    });
    vi.mocked(createServerClient).mockResolvedValue(client as never);

    await expect(
      saveAttemptDraftAction(
        actionContext,
        saveInput({ attemptId: ids.attempt }),
      ),
    ).rejects.toThrow("tasks.attempt_read_failed");
    expect(client.rpc).not.toHaveBeenCalled();
  });

  it.each([
    [
      "save",
      () => saveAttemptDraftAction(actionContext, saveInput({ attemptId: ids.attempt })),
      { save: { data: null, error: { code: "57014", message: "save timeout" } } },
      "tasks.save_failed",
    ],
    [
      "submit",
      () => submitAttemptAction(actionContext, submitInput()),
      { submit: { data: null, error: { code: "57014", message: "submit timeout" } } },
      "tasks.submit_failed",
    ],
    [
      "evidence",
      () => createExternalTaskEvidenceAction(actionContext, evidenceInput()),
      { evidence: { data: null, error: { code: "57014", message: "evidence timeout" } } },
      "tasks.evidence_create_failed",
    ],
  ] as const)("surfaces the %s provider failure and does not hydrate a workspace", async (_label, invoke, options, errorKey) => {
    const client = clientFixture(options);
    vi.mocked(createServerClient).mockResolvedValue(client as never);

    await expect(invoke()).rejects.toThrow(errorKey);
    expect(readTaskWorkspace).not.toHaveBeenCalled();
  });

  it("does not hide a workspace provider failure after a successful save", async () => {
    const client = clientFixture();
    const workspaceError = new Error("tasks.workspace_provider_failed");
    vi.mocked(createServerClient).mockResolvedValue(client as never);
    vi.mocked(readTaskWorkspace).mockRejectedValue(workspaceError);

    await expect(
      saveAttemptDraftAction(
        actionContext,
        saveInput({ attemptId: ids.attempt }),
      ),
    ).rejects.toBe(workspaceError);
  });
});
