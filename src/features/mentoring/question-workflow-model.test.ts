import { describe, expect, it } from "vitest";

import {
  questionWorkflowCopy,
  QUESTION_STATES,
  toLearnerQuestionActionCopy,
  toTrainerQuestionActionCopy,
} from "./question-workflow-copy";
import {
  canTrainerActOnQuestion,
  isQuestionHistoryState,
  isQuestionQueueState,
  QuestionContextSchema,
  QuestionDetailViewSchema,
  QuestionSummarySchema,
} from "./question-workflow-model";
import {
  parseAnswerQuestionForm,
  parseArchiveQuestionForm,
  parseClaimQuestionForm,
  parseCreateQuestionForm,
  parseTransferQuestionForm,
} from "./question-workflow-validation";

const learnerId = "01980a00-0000-7000-8000-000000000001";
const trainerId = "01980a00-0000-7000-8000-000000000002";
const otherTrainerId = "01980a00-0000-7000-8000-000000000003";
const cohortId = "01980a30-0000-7000-8000-000000000001";
const taskId = "01980a26-0000-7000-8000-000000000001";
const questionId = "01980a36-0000-7000-8000-000000000001";

function validSummary() {
  return {
    id: questionId,
    learnerId,
    learnerName: "Ada Learner",
    cohortId,
    cohortName: "Release 0",
    taskId,
    taskTitle: "Test a login flow",
    subject: "Boundary behavior",
    state: "assigned" as const,
    version: 2,
    createdAt: "2026-07-18T10:00:00.000Z",
    updatedAt: "2026-07-18T10:05:00.000Z",
    assignedTrainerId: trainerId,
    assignedTrainerName: "Tess Trainer",
  };
}

describe("question workflow presentation contracts", () => {
  it("validates localized question context, summary, detail, and transfer records", () => {
    expect(QuestionContextSchema.parse({
      cohortId,
      cohortName: "Release 0",
      taskId,
      taskTitle: "Test a login flow",
    })).toMatchObject({ cohortId, taskId });
    expect(QuestionSummarySchema.parse(validSummary()).state).toBe("assigned");
    expect(QuestionDetailViewSchema.parse({
      ...validSummary(),
      messages: [{
        id: "01980a37-0000-7000-8000-000000000001",
        authorId: learnerId,
        authorName: "Ada Learner",
        authorKind: "learner",
        body: "How should I choose the boundary?",
        kind: "message",
        createdAt: "2026-07-18T10:00:00.000Z",
      }],
      transfers: [{
        id: "01980a38-0000-7000-8000-000000000001",
        fromTrainerId: otherTrainerId,
        fromTrainerName: "Other Trainer",
        toTrainerId: trainerId,
        toTrainerName: "Tess Trainer",
        reason: "Subject specialist",
        createdAt: "2026-07-18T10:02:00.000Z",
      }],
    }).transfers).toHaveLength(1);
  });

  it("partitions every named state and permits actions only for the current owner", () => {
    expect(QUESTION_STATES.filter(isQuestionQueueState)).toEqual([
      "open",
      "assigned",
      "transferred",
    ]);
    expect(QUESTION_STATES.filter(isQuestionHistoryState)).toEqual([
      "answered",
      "archived",
    ]);
    expect(canTrainerActOnQuestion(validSummary(), trainerId)).toBe(true);
    expect(canTrainerActOnQuestion(validSummary(), otherTrainerId)).toBe(false);
    expect(canTrainerActOnQuestion({ ...validSummary(), state: "answered" }, trainerId)).toBe(false);
  });

  it("contains complete EN/DE/RU state labels and explicit unassigned explanations", () => {
    for (const locale of ["en", "de", "ru"] as const) {
      const copy = questionWorkflowCopy[locale];
      expect(Object.keys(copy.common.states)).toEqual(QUESTION_STATES);
      expect(copy.learner.openExplanation.length).toBeGreaterThan(80);
      expect(copy.trainer.openExplanation.length).toBeGreaterThan(80);
      expect(copy.learner.historyCount(1)).not.toBe(copy.learner.historyCount(2));
      expect(copy.trainer.queueCount(1)).toBeTruthy();
      expect(copy.trainer.claimSuccessTitle).toBeTruthy();
      expect(copy.trainer.claimSuccess.length).toBeGreaterThan(40);
      expect(copy.common.transferredFromTo("A", "B", "today")).toContain("B");
    }
  });

  it("materializes function-free copy before crossing client action boundaries", () => {
    for (const locale of ["en", "de", "ru"] as const) {
      const copy = questionWorkflowCopy[locale];
      expect(() => structuredClone(toLearnerQuestionActionCopy(copy.learner)))
        .not.toThrow();
      expect(() => structuredClone(toTrainerQuestionActionCopy(copy.trainer)))
        .not.toThrow();
      expect("historyCount" in toLearnerQuestionActionCopy(copy.learner))
        .toBe(false);
      expect("queueCount" in toTrainerQuestionActionCopy(copy.trainer))
        .toBe(false);
      expect("claimSuccess" in toTrainerQuestionActionCopy(copy.trainer))
        .toBe(false);
      expect("claimSuccessTitle" in toTrainerQuestionActionCopy(copy.trainer))
        .toBe(false);
    }
  });
});

describe("question action validation", () => {
  it("parses create, archive, claim, answer, and transfer forms", () => {
    const create = new FormData();
    create.set("context", `${cohortId}:${taskId}`);
    create.set("subject", "  Boundary behavior  ");
    create.set("body", "  I tested the minimum value.  ");
    create.set("idempotencyKey", "question-create:123456789");
    expect(parseCreateQuestionForm(create)).toMatchObject({
      cohortId,
      taskId,
      subject: "Boundary behavior",
      body: "I tested the minimum value.",
    });

    const archive = new FormData();
    archive.set("questionId", questionId);
    archive.set("expectedVersion", "2");
    expect(parseArchiveQuestionForm(archive)).toEqual({
      questionId,
      expectedVersion: 2,
    });

    const claim = new FormData();
    claim.set("questionId", questionId);
    claim.set("expectedVersion", "1");
    claim.set("idempotencyKey", "question-claim:123456789");
    expect(parseClaimQuestionForm(claim)).toMatchObject({
      questionId,
      expectedVersion: 1,
    });

    const answer = new FormData();
    answer.set("questionId", questionId);
    answer.set("expectedVersion", "2");
    answer.set("body", "  Consider the valid and invalid side.  ");
    answer.set("idempotencyKey", "question-answer:123456789");
    expect(parseAnswerQuestionForm(answer).body).toBe(
      "Consider the valid and invalid side.",
    );

    const transfer = new FormData();
    transfer.set("questionId", questionId);
    transfer.set("expectedVersion", "2");
    transfer.set("toTrainerId", otherTrainerId);
    transfer.set("reason", "  Specialist context  ");
    transfer.set("idempotencyKey", "question-transfer:123456789");
    expect(parseTransferQuestionForm(transfer)).toMatchObject({
      toTrainerId: otherTrainerId,
      reason: "Specialist context",
    });
  });

  it("fails closed for malformed identifiers, context, blank content, versions, and short keys", () => {
    for (const parser of [
      parseCreateQuestionForm,
      parseArchiveQuestionForm,
      parseClaimQuestionForm,
      parseAnswerQuestionForm,
      parseTransferQuestionForm,
    ]) {
      expect(() => parser(new FormData())).toThrow();
    }

    const malformed = new FormData();
    malformed.set("context", "not-a-context");
    malformed.set("subject", " ");
    malformed.set("body", " ");
    malformed.set("idempotencyKey", "short");
    expect(() => parseCreateQuestionForm(malformed)).toThrow();
  });
});
