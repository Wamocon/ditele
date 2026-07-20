import { render, screen } from "@testing-library/react";
import type { Route } from "next";
import { describe, expect, it, vi } from "vitest";

import { ArchiveQuestionForm, LearnerQuestionForm } from "./learner-question-form";
import { QuestionList } from "./question-list";
import { QuestionThreadView } from "./question-thread-view";
import {
  ClaimQuestionAction,
  TrainerQuestionActions,
} from "./trainer-question-actions";
import { questionWorkflowCopy } from "./question-workflow-copy";
import { questionActionInitialState } from "./question-workflow-validation";

const learnerId = "01980a00-0000-7000-8000-000000000001";
const trainerId = "01980a00-0000-7000-8000-000000000002";
const otherTrainerId = "01980a00-0000-7000-8000-000000000003";
const cohortId = "01980a30-0000-7000-8000-000000000001";
const taskId = "01980a26-0000-7000-8000-000000000001";
const questionId = "01980a36-0000-7000-8000-000000000001";
const action = vi.fn(async () => questionActionInitialState);
const copy = questionWorkflowCopy.en;

const summary = {
  id: questionId,
  learnerId,
  learnerName: "Ada Learner",
  cohortId,
  cohortName: "Release 0",
  taskId,
  taskTitle: "Test a login flow",
  subject: "Boundary behavior",
  state: "open" as const,
  version: 1,
  createdAt: "2026-07-18T10:00:00.000Z",
  updatedAt: "2026-07-18T10:05:00.000Z",
};

describe("question workflow views", () => {
  it("renders an explicit empty list and an unassigned linked queue row", () => {
    const props = {
      detailHref: (id: string) => `/en/learn/questions/${id}` as Route,
      emptyDescription: copy.learner.emptyDescription,
      emptyTitle: copy.learner.emptyTitle,
      formatDateTime: (value: string) => value,
      labels: copy.common,
      openLabel: copy.learner.openDetail,
    };
    const { rerender } = render(<QuestionList {...props} items={[]} />);
    expect(screen.getByRole("heading", { name: copy.learner.emptyTitle })).toBeInTheDocument();

    rerender(<QuestionList {...props} items={[summary]} />);
    expect(screen.getByRole("link", { name: /Boundary behavior/ })).toHaveAttribute(
      "href",
      `/en/learn/questions/${questionId}`,
    );
    expect(screen.getByText(copy.common.unassigned)).toBeInTheDocument();
    expect(screen.getByText("Test a login flow")).toBeInTheDocument();
  });

  it("renders task context, ordered conversation, transfer history, and the honest open state", () => {
    render(
      <QuestionThreadView
        backHref={"/en/learn/questions" as Route}
        formatDateTime={(value) => value}
        labels={copy.common}
        openExplanation={copy.learner.openExplanation}
        question={{
          ...summary,
          messages: [{
            id: "01980a37-0000-7000-8000-000000000001",
            authorId: learnerId,
            authorName: "Ada Learner",
            authorKind: "learner",
            body: "How should I choose the boundary?",
            kind: "message",
            createdAt: "2026-07-18T10:00:00.000Z",
          }, {
            id: "01980a37-0000-7000-8000-000000000002",
            authorId: trainerId,
            authorName: "Tess Trainer",
            authorKind: "trainer",
            body: "Compare both sides of the boundary.",
            kind: "answer",
            createdAt: "2026-07-18T10:05:00.000Z",
          }],
          transfers: [{
            id: "01980a38-0000-7000-8000-000000000001",
            fromTrainerId: otherTrainerId,
            fromTrainerName: "Other Trainer",
            toTrainerId: trainerId,
            toTrainerName: "Tess Trainer",
            reason: "Boundary specialist",
            createdAt: "2026-07-18T10:03:00.000Z",
          }],
        }}
      />,
    );
    expect(screen.getByRole("heading", { name: "Boundary behavior" })).toBeInTheDocument();
    expect(screen.getByText(copy.learner.openExplanation)).toBeInTheDocument();
    expect(screen.getByText("How should I choose the boundary?")).toBeInTheDocument();
    expect(screen.getByText("Compare both sides of the boundary.")).toBeInTheDocument();
    expect(screen.getByText("Boundary specialist")).toBeInTheDocument();
  });

  it("renders accessible learner create/archive forms and the missing-context state", () => {
    const { rerender } = render(
      <LearnerQuestionForm
        action={action}
        contexts={[]}
        idempotencyKey="question-create:123456789"
        labels={copy.learner}
      />,
    );
    expect(screen.getByRole("heading", { name: copy.learner.noContextTitle })).toBeInTheDocument();

    rerender(
      <LearnerQuestionForm
        action={action}
        contexts={[{
          cohortId,
          cohortName: "Release 0",
          taskId,
          taskTitle: "Test a login flow",
        }]}
        idempotencyKey="question-create:123456789"
        labels={copy.learner}
      />,
    );
    expect(screen.getByRole("combobox", { name: copy.learner.contextLabel })).toBeRequired();
    expect(screen.getByRole("textbox", { name: copy.learner.subjectLabel })).toBeRequired();
    expect(screen.getByRole("textbox", { name: copy.learner.bodyLabel })).toBeRequired();
    expect(screen.getByRole("button", { name: copy.learner.send })).toBeEnabled();

    rerender(
      <ArchiveQuestionForm
        action={action}
        expectedVersion={2}
        labels={copy.learner}
        questionId={questionId}
      />,
    );
    expect(screen.getByRole("button", { name: copy.learner.archive })).toBeEnabled();
  });

  it("renders current-owner answer and transfer forms, including no-candidate guidance", () => {
    const props = {
      answerAction: action,
      answerIdempotencyKey: "question-answer:123456789",
      expectedVersion: 2,
      labels: copy.trainer,
      questionId,
      transferAction: action,
      transferIdempotencyKey: "question-transfer:123456789",
    };
    const { rerender } = render(
      <TrainerQuestionActions
        {...props}
        candidates={[{ id: otherTrainerId, name: "Other Trainer" }]}
      />,
    );
    expect(screen.getByRole("textbox", { name: copy.trainer.answerLabel })).toBeRequired();
    expect(screen.getByRole("combobox", { name: copy.trainer.transferTarget })).toBeRequired();
    expect(screen.getByRole("option", { name: "Other Trainer" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: copy.trainer.transfer })).toBeEnabled();

    rerender(<TrainerQuestionActions {...props} candidates={[]} />);
    expect(screen.getByText(copy.trainer.noTransferTarget)).toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: copy.trainer.transferTarget })).not.toBeInTheDocument();
  });

  it("renders an explicit atomic claim action for an open question", () => {
    render(
      <ClaimQuestionAction
        action={action}
        expectedVersion={1}
        idempotencyKey="question-claim:123456789"
        labels={copy.trainer}
        questionId={questionId}
      />,
    );
    expect(screen.getByRole("heading", { name: copy.trainer.claimTitle })).toBeInTheDocument();
    expect(screen.getByText(copy.trainer.claimDescription)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: copy.trainer.claim })).toBeEnabled();
  });
});
