import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { reviewDetailCopy } from "@/app/[locale]/trainer/submissions/[submissionId]/copy";

import type { ReviewSubmission } from "../model";
import { ReviewWorkbench } from "./review-workbench";
import { ReviewedPanel } from "@/app/[locale]/trainer/submissions/[submissionId]/reviewed-panel";

const submission: ReviewSubmission = {
  id: "01980a37-0000-7000-8000-000000000001",
  organizationId: "01980a10-0000-7000-8000-000000000001",
  taskId: "01980a26-0000-7000-8000-000000000001",
  learnerId: "01980a11-0000-7000-8000-000000000001",
  groupId: "01980a30-0000-7000-8000-000000000001",
  attemptNumber: 1,
  state: "submitted",
  version: 1,
  createdAt: "2026-07-17T08:00:00.000Z",
  updatedAt: "2026-07-17T09:00:00.000Z",
  submittedAt: "2026-07-17T09:00:00.000Z",
  learnerName: "Seed Learner",
  groupName: "Release 0",
  taskTitle: "Review the login flow",
  answerText: "The password error needs a programmatic label.",
  selectedAnswerIds: [],
  evidence: [],
  hintUsage: [],
  solvingDurationSeconds: 600,
  immutableSnapshot: {
    taskVersionId: "01980a22-0000-7000-8000-000000000001",
    answerText: "The password error needs a programmatic label.",
    selectedAnswerIds: [],
    evidence: [],
    hintUsage: [],
    solvingDurationSeconds: 600,
  },
  reviewHistory: [],
  rubric: {
    id: "01980a2b-0000-7000-8000-000000000001",
    version: 1,
    title: "Practical review",
    acceptanceThresholdPercent: 0,
    criteria: [{
      id: "01980a2c-0000-7000-8000-000000000001",
      title: "Evidence quality",
      description: "evidence_quality",
      maxScore: 10,
      weight: 1,
      required: true,
    }],
  },
};

const commonProps = {
  submission,
  labels: reviewDetailCopy.en.workbench,
  decisionAction: vi.fn(),
  transferAction: vi.fn(),
  transferIdempotencyKey: "submission-transfer:test-0001",
  formatDateTime: (value: string) => value,
  formatDuration: (value: number) => `${value} seconds`,
};

describe("ReviewWorkbench", () => {
  it("keeps review decisions available while hiding an unusable transfer form", () => {
    render(<ReviewWorkbench {...commonProps} availableTrainers={[]} />);

    expect(screen.getByRole("button", { name: "Accept submission" })).toBeInTheDocument();
    expect(
      screen.queryByRole("combobox", { name: reviewDetailCopy.en.workbench.transferTo }),
    ).not.toBeInTheDocument();
  });

  it("renders the transfer controls only when a valid target is available", () => {
    render(
      <ReviewWorkbench
        {...commonProps}
        availableTrainers={[{
          id: "01980a12-0000-7000-8000-000000000002",
          name: "Second Trainer",
        }]}
      />,
    );

    expect(
      screen.getByRole("combobox", { name: reviewDetailCopy.en.workbench.transferTo }),
    ).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Second Trainer" })).toBeInTheDocument();
    expect(document.querySelector('input[name="idempotencyKey"]')).toHaveValue(
      "submission-transfer:test-0001",
    );
  });

  it("renders a withdrawn submission as a named non-reviewable terminal record", () => {
    render(<ReviewedPanel locale="en" submission={{ ...submission, state: "withdrawn" }} />);

    expect(screen.getByText("Withdrawn", { exact: true })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Accept submission" })).not.toBeInTheDocument();
  });
});
