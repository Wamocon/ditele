import { describe, expect, it } from "vitest";

import { buildLearnerPortfolioRecord } from "./learner-portfolio-record";

const portfolioId = "01980a42-0000-7000-8000-000000000001";
const learnerId = "01980a00-0000-7000-8000-000000000001";

const portfolio = {
  id: portfolioId,
  learner_id: learnerId,
  title: "QA evidence",
  summary: "Reviewed work",
  visibility: "organization",
  row_version: 4,
  updated_at: "2026-07-18T10:00:00.000Z",
};

describe("learner portfolio record", () => {
  it("uses the canonical organization visibility and distinguishes verification", () => {
    const result = buildLearnerPortfolioRecord(portfolio, [
      {
        id: "01980a43-0000-7000-8000-000000000001",
        evidence_id: "01980a44-0000-7000-8000-000000000001",
        position: 1,
        reflection: "A deterministic lab check.",
        created_at: "2026-07-18T09:00:00.000Z",
        evidence: {
          id: "01980a44-0000-7000-8000-000000000001",
          evidence_kind: "lab",
          title: "Boundary lab",
          captured_at: "2026-07-18T08:00:00.000Z",
          validation_results: [{
            outcome: "passed",
            validated_at: "2026-07-18T08:30:00.000Z",
          }],
        },
      },
      {
        id: "01980a43-0000-7000-8000-000000000002",
        evidence_id: "01980a44-0000-7000-8000-000000000002",
        position: 0,
        reflection: "Reviewed by a trainer.",
        created_at: "2026-07-18T07:00:00.000Z",
        evidence: {
          id: "01980a44-0000-7000-8000-000000000002",
          evidence_kind: "review",
          title: "Trainer rubric review",
          captured_at: "2026-07-18T07:00:00.000Z",
          validation_results: [],
        },
      },
      {
        id: "01980a43-0000-7000-8000-000000000003",
        evidence_id: "01980a44-0000-7000-8000-000000000003",
        position: 2,
        reflection: "Draft evidence.",
        created_at: "2026-07-18T06:00:00.000Z",
        evidence: {
          id: "01980a44-0000-7000-8000-000000000003",
          evidence_kind: "submission",
          title: "Submission evidence",
          captured_at: "2026-07-18T06:00:00.000Z",
          validation_results: [],
        },
      },
    ]);

    expect(result.visibility).toBe("organization");
    expect(result.items.map((item) => item.verification)).toEqual([
      "recorded",
      "verified",
      "recorded",
    ]);
    expect(result.items.map((item) => item.position)).toEqual([0, 1, 2]);
  });

  it("retains an item without exposing an inaccessible evidence identifier as a title", () => {
    const result = buildLearnerPortfolioRecord(portfolio, [{
      id: "01980a43-0000-7000-8000-000000000004",
      evidence_id: "01980a44-0000-7000-8000-000000000004",
      position: 0,
      reflection: "",
      created_at: "2026-07-18T09:00:00.000Z",
      evidence: null,
    }]);

    expect(result.items[0]).toMatchObject({
      title: null,
      kind: null,
      verification: "unavailable",
    });
  });
});
