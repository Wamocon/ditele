import { describe, expect, it } from "vitest";

import {
  parseReviewDecisionForm,
  parseSubmissionTransferForm,
} from "./validation";

const SUBMISSION_ID = "01980a35-0000-7000-8000-000000000001";
const CRITERION_ID = "01980a2c-0000-7000-8000-000000000001";
const TARGET_TRAINER_ID = "01980a00-0000-7000-8000-000000000009";

function validForm(): FormData {
  const form = new FormData();
  form.set("submissionId", SUBMISSION_ID);
  form.set("expectedVersion", "2");
  form.set("decision", "accepted");
  form.set("comment", "Clear, reproducible test coverage.");
  form.set(`score:${CRITERION_ID}`, "8.5");
  return form;
}

describe("parseReviewDecisionForm", () => {
  it("normalizes a valid scored review", () => {
    expect(parseReviewDecisionForm(validForm())).toEqual({
      submissionId: SUBMISSION_ID,
      expectedVersion: 2,
      decision: "accepted",
      comment: "Clear, reproducible test coverage.",
      criterionScores: [{ criterion_id: CRITERION_ID, points: 8.5 }],
    });
  });

  it("rejects a decision without criterion scores", () => {
    const form = validForm();
    form.delete(`score:${CRITERION_ID}`);
    expect(() => parseReviewDecisionForm(form)).toThrow();
  });

  it("rejects duplicate criterion identifiers", () => {
    const form = validForm();
    form.append(`score:${CRITERION_ID}`, "9");
    expect(() => parseReviewDecisionForm(form)).toThrow();
  });

  it("ignores an unscored optional criterion", () => {
    const form = validForm();
    form.set("score:01980a2c-0000-7000-8000-000000000002", "");
    expect(parseReviewDecisionForm(form).criterionScores).toEqual([
      { criterion_id: CRITERION_ID, points: 8.5 },
    ]);
  });

  it.each(["-1", "NaN", "1e3", "3.14159"])("rejects unsafe score %s", (score) => {
    const form = validForm();
    form.set(`score:${CRITERION_ID}`, score);
    expect(() => parseReviewDecisionForm(form)).toThrow();
  });

  it("rejects an invalid submission identifier", () => {
    const form = validForm();
    form.set("submissionId", "not-a-uuid");
    expect(() => parseReviewDecisionForm(form)).toThrow();
  });
});

describe("parseSubmissionTransferForm", () => {
  function transferForm(): FormData {
    const form = new FormData();
    form.set("submissionId", SUBMISSION_ID);
    form.set("expectedVersion", "4");
    form.set("toTrainerId", TARGET_TRAINER_ID);
    form.set("reason", "  Balance the active review queue.  ");
    form.set("idempotencyKey", "submission-transfer:stable-0001");
    return form;
  }

  it("normalizes a complete versioned transfer command", () => {
    expect(parseSubmissionTransferForm(transferForm())).toEqual({
      submissionId: SUBMISSION_ID,
      expectedVersion: 4,
      toTrainerId: TARGET_TRAINER_ID,
      reason: "Balance the active review queue.",
      idempotencyKey: "submission-transfer:stable-0001",
    });
  });

  it.each([
    ["toTrainerId", "not-a-user"],
    ["reason", "  "],
    ["idempotencyKey", "too-short"],
    ["expectedVersion", "0"],
  ])("rejects unsafe %s input", (field, value) => {
    const form = transferForm();
    form.set(field, value);
    expect(() => parseSubmissionTransferForm(form)).toThrow();
  });
});
