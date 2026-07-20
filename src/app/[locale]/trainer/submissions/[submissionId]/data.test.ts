import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/app/[locale]/_data/principal", () => ({ getPrincipal: vi.fn() }));
vi.mock("@/shared/database/server", () => ({ createServerClient: vi.fn() }));

import { getPrincipal } from "@/app/[locale]/_data/principal";
import { createServerClient } from "@/shared/database/server";

import { readReviewSubmission } from "./data";

type QueryResult = { data: unknown; error: unknown };

const ids = {
  submission: "01980a35-0000-7000-8000-000000000001",
  submissionVersion: "01980a36-0000-7000-8000-000000000001",
  organization: "01980a10-0000-7000-8000-000000000001",
  task: "01980a26-0000-7000-8000-000000000001",
  learner: "01980a00-0000-7000-8000-000000000001",
  trainer: "01980a00-0000-7000-8000-000000000002",
  cohort: "01980a30-0000-7000-8000-000000000001",
  attempt: "01980a34-0000-7000-8000-000000000001",
  version: "01980a22-0000-7000-8000-000000000001",
  option: "01980a28-0000-7000-8000-000000000001",
  rubric: "01980a2b-0000-7000-8000-000000000001",
  criterion: "01980a2c-0000-7000-8000-000000000001",
  skill: "01980a2a-0000-7000-8000-000000000001",
  evidenceExternal: "01980a39-0000-7000-8000-000000000001",
  evidenceUpload: "01980a39-0000-7000-8000-000000000002",
  evidenceLab: "01980a39-0000-7000-8000-000000000003",
  evidenceSubmission: "01980a39-0000-7000-8000-000000000004",
  evidenceReview: "01980a39-0000-7000-8000-000000000005",
  evidencePlacement: "01980a39-0000-7000-8000-000000000006",
  evidenceCredential: "01980a39-0000-7000-8000-000000000007",
  evidenceHttp: "01980a39-0000-7000-8000-000000000008",
  evidenceLocalUpload: "01980a39-0000-7000-8000-000000000009",
};

const trainerPrincipal = {
  userId: ids.trainer,
  organizationId: ids.organization,
  roles: ["trainer"],
  permissions: ["review.manage"],
  cohortIds: [ids.cohort],
};

function submissionRow(overrides: Record<string, unknown> = {}) {
  return {
    id: ids.submission,
    organization_id: ids.organization,
    task_id: ids.task,
    learner_id: ids.learner,
    cohort_id: ids.cohort,
    state: "submitted",
    row_version: 1,
    latest_version_number: 1,
    created_at: "2026-07-18T09:00:00.000Z",
    updated_at: "2026-07-18T09:30:00.000Z",
    accepted_at: null,
    attempts: {
      sequence_number: 1,
      started_at: "2026-07-18T09:00:00.000Z",
      elapsed_seconds: 300,
      attempt_hint_usage: [],
    },
    submission_versions: [{
      id: ids.submissionVersion,
      version_number: 1,
      answer_text: "Boundary evidence",
      selected_option_ids: [ids.option],
      evidence_refs: [] as string[],
      elapsed_seconds: 300,
      task_snapshot: { content_version_id: ids.version },
      submitted_at: "2026-07-18T09:30:00.000Z",
    }],
    reviews: [],
    review_transfers: [],
    ...overrides,
  };
}

function immutableContext(overrides: Record<string, unknown> = {}) {
  return {
    content_version_id: ids.version,
    submission_version_id: ids.submissionVersion,
    task_title: "Immutable login analysis",
    options: [{
      id: ids.option,
      labels: { en: "Boundary value analysis", de: "Grenzwertanalyse" },
    }],
    rubric: {
      id: ids.rubric,
      labels: { en: "Immutable review rubric", de: "Unveränderliche Rubrik" },
      version: 1,
      criteria: [{
        id: ids.criterion,
        code: "risk-coverage",
        labels: { en: "Risk coverage", de: "Risikoabdeckung" },
        position: 0,
        max_points: 10,
        required_for_acceptance: true,
        skill_id: ids.skill,
      }],
    },
    ...overrides,
  };
}

function queryBuilder(result: QueryResult) {
  const builder = {
    select: vi.fn(),
    eq: vi.fn(),
    or: vi.fn(),
    maybeSingle: vi.fn(),
    then: vi.fn(),
  };
  builder.select.mockReturnValue(builder);
  builder.eq.mockReturnValue(builder);
  builder.or.mockReturnValue(builder);
  builder.maybeSingle.mockResolvedValue(result);
  builder.then.mockImplementation((resolve, reject) =>
    Promise.resolve(result).then(resolve, reject)
  );
  return builder;
}

function clientFixture(
  context: QueryResult,
  submission: QueryResult = { data: submissionRow(), error: null },
  evidence: QueryResult = { data: [], error: null },
) {
  const selectCalls: Array<{ table: string; projection: string }> = [];
  const queues = new Map<string, QueryResult[]>([
    ["submissions", [submission]],
    ["profiles", [{ data: { display_name: "Ada Learner" }, error: null }]],
    ["cohorts", [{ data: { name: "Release 0" }, error: null }]],
    ["task_schedules", [{ data: { due_at: null }, error: null }]],
    ["evidence", [evidence]],
  ]);
  return {
    from: vi.fn((table: string) => {
      const result = queues.get(table)?.shift();
      if (!result) throw new Error(`Unexpected query for ${table}`);
      const builder = queryBuilder(result);
      builder.select.mockImplementation((projection: string) => {
        selectCalls.push({ table, projection });
        return builder;
      });
      return builder;
    }),
    rpc: vi.fn().mockResolvedValue(context),
    selectCalls,
  };
}

describe("readReviewSubmission immutable publication context", () => {
  beforeEach(() => {
    vi.mocked(getPrincipal).mockReset();
    vi.mocked(createServerClient).mockReset();
  });

  it("maps title, options, and rubric only from the exact snapshot RPC", async () => {
    vi.mocked(getPrincipal).mockResolvedValue(trainerPrincipal as never);
    const client = clientFixture({ data: immutableContext(), error: null });
    vi.mocked(createServerClient).mockResolvedValue(client as never);

    const submission = await readReviewSubmission("de", ids.submission);

    expect(client.rpc).toHaveBeenCalledWith("get_submission_review_context", {
      p_submission_id: ids.submission,
      p_locale: "de",
    });
    expect(client.selectCalls.find(({ table }) => table === "submissions")?.projection)
      .toContain("attempts!submissions_attempt_id_fkey!inner(");
    expect(client.from.mock.calls.map(([table]) => table)).not.toEqual(
      expect.arrayContaining([
        "task_localizations",
        "task_options",
        "task_rubric_assignments",
        "rubrics",
        "rubric_criteria",
      ]),
    );
    expect(submission).toMatchObject({
      taskTitle: "Immutable login analysis",
      selectedAnswers: [{ id: ids.option, label: "Grenzwertanalyse" }],
      rubric: {
        id: ids.rubric,
        title: "Unveränderliche Rubrik",
        criteria: [{
          id: ids.criterion,
          title: "Risikoabdeckung",
          skillId: ids.skill,
        }],
      },
      immutableSnapshot: { taskVersionId: ids.version },
    });
  });

  it("fails closed on a stale publication pin or missing immutable option", async () => {
    vi.mocked(getPrincipal).mockResolvedValue(trainerPrincipal as never);
    vi.mocked(createServerClient).mockResolvedValue(clientFixture({
      data: immutableContext({
        content_version_id: "01980a22-0000-7000-8000-000000000099",
      }),
      error: null,
    }) as never);
    await expect(readReviewSubmission("en", ids.submission)).rejects.toThrow(
      "review.submission_context_pin_mismatch",
    );

    vi.mocked(createServerClient).mockResolvedValue(clientFixture({
      data: immutableContext({ options: [] }),
      error: null,
    }) as never);
    await expect(readReviewSubmission("en", ids.submission)).rejects.toThrow(
      "review.selected_option_context_missing",
    );
  });

  it("maps the real withdrawn terminal state and rejects nonexistent draft submissions", async () => {
    vi.mocked(getPrincipal).mockResolvedValue(trainerPrincipal as never);
    vi.mocked(createServerClient).mockResolvedValue(clientFixture(
      { data: immutableContext(), error: null },
      { data: submissionRow({ state: "withdrawn" }), error: null },
    ) as never);
    await expect(readReviewSubmission("en", ids.submission)).resolves.toMatchObject({
      state: "withdrawn",
    });

    vi.mocked(createServerClient).mockResolvedValue(clientFixture(
      { data: immutableContext(), error: null },
      { data: submissionRow({ state: "draft" }), error: null },
    ) as never);
    await expect(readReviewSubmission("en", ids.submission)).rejects.toThrow();
  });

  it("maps every canonical evidence provenance to an honest trainer-facing kind", async () => {
    vi.mocked(getPrincipal).mockResolvedValue(trainerPrincipal as never);
    const row = submissionRow();
    row.submission_versions[0]!.evidence_refs = [
      ids.evidenceExternal,
      ids.evidenceUpload,
      ids.evidenceLab,
      ids.evidenceSubmission,
      ids.evidenceReview,
      ids.evidencePlacement,
    ];
    const evidenceRows = [
      [ids.evidenceExternal, "external", "External", "https://example.com/report"],
      [ids.evidenceUpload, "upload", "Upload", null],
      [ids.evidenceLab, "lab", "Lab", null],
      [ids.evidenceSubmission, "submission", "Submission", null],
      [ids.evidenceReview, "review", "Review", null],
      [ids.evidencePlacement, "placement", "Placement", null],
    ].map(([id, kind, title, sourceUri]) => ({
      id,
      evidence_kind: kind,
      title,
      source_uri: sourceUri,
      metadata: {},
      captured_at: "2026-07-18T09:20:00.000Z",
    }));
    vi.mocked(createServerClient).mockResolvedValue(clientFixture(
      { data: immutableContext(), error: null },
      { data: row, error: null },
      { data: evidenceRows, error: null },
    ) as never);

    const submission = await readReviewSubmission("en", ids.submission);

    expect(submission?.evidence.map(({ kind }) => kind)).toEqual([
      "link",
      "file",
      "lab_result",
      "text",
      "text",
      "text",
    ]);
    expect(submission?.evidence[0]).toMatchObject({
      kind: "link",
      uri: "https://example.com/report",
    });
  });

  it("never renders credential-bearing or non-HTTPS external evidence links", async () => {
    vi.mocked(getPrincipal).mockResolvedValue(trainerPrincipal as never);
    const row = submissionRow();
    row.submission_versions[0]!.evidence_refs = [
      ids.evidenceCredential,
      ids.evidenceHttp,
      ids.evidenceLocalUpload,
    ];
    const evidenceRows = [
      [ids.evidenceCredential, "external", "Credentials", "https://user:secret@example.test/path"],
      [ids.evidenceHttp, "external", "Insecure", "http://example.test/report"],
      [ids.evidenceLocalUpload, "upload", "Local file", "http://127.0.0.1:54321/object/report"],
    ].map(([id, kind, title, sourceUri]) => ({
      id,
      evidence_kind: kind,
      title,
      source_uri: sourceUri,
      metadata: {},
      captured_at: "2026-07-18T09:20:00.000Z",
    }));
    vi.mocked(createServerClient).mockResolvedValue(clientFixture(
      { data: immutableContext(), error: null },
      { data: row, error: null },
      { data: evidenceRows, error: null },
    ) as never);

    const submission = await readReviewSubmission("en", ids.submission);

    expect(submission?.evidence).toHaveLength(3);
    expect(submission?.evidence[0]).not.toHaveProperty("uri");
    expect(submission?.evidence[1]).not.toHaveProperty("uri");
    expect(submission?.evidence[2]).toMatchObject({
      kind: "file",
      uri: "http://127.0.0.1:54321/object/report",
    });
  });

  it("rejects hidden solution fields and does no reads for an unauthorized role", async () => {
    vi.mocked(getPrincipal).mockResolvedValue(trainerPrincipal as never);
    vi.mocked(createServerClient).mockResolvedValue(clientFixture({
      data: immutableContext({ model_answer: "hidden" }),
      error: null,
    }) as never);
    await expect(readReviewSubmission("en", ids.submission)).rejects.toThrow();

    const client = clientFixture({ data: immutableContext(), error: null });
    vi.mocked(getPrincipal).mockResolvedValue({
      ...trainerPrincipal,
      roles: ["learner"],
      permissions: [],
    } as never);
    vi.mocked(createServerClient).mockResolvedValue(client as never);
    await expect(readReviewSubmission("en", ids.submission)).resolves.toBeNull();
    expect(client.from).not.toHaveBeenCalled();
    expect(client.rpc).not.toHaveBeenCalled();
  });
});
