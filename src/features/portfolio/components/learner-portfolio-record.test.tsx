import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  LearnerPortfolioRecordView,
  type LearnerPortfolioRecordLabels,
} from "./learner-portfolio-record";

const labels: LearnerPortfolioRecordLabels = {
  title: "My evidence portfolio",
  description: "Practical testing evidence.",
  portfolioMissingTitle: "No portfolio record yet",
  portfolioMissingDescription: "No portfolio exists.",
  evidenceHeading: "Portfolio evidence",
  evidenceCount: "Evidence items",
  verifiedCount: "Verified",
  emptyEvidenceTitle: "No evidence selected",
  emptyEvidenceDescription: "The portfolio has no evidence.",
  visibility: { private: "Private", organization: "Organization", public: "Public" },
  verification: {
    verified: "Verified evidence",
    recorded: "Recorded evidence",
    unavailable: "Details unavailable",
  },
  evidenceKinds: {
    submission: "Submission",
    lab: "Lab evidence",
    upload: "Uploaded evidence",
    review: "Trainer review",
    placement: "Placement assessment",
    external: "External evidence",
  },
  evidenceDetailsUnavailable: "Evidence details are not available",
  reflection: "Reflection",
  captured: "Captured",
  updated: "Updated",
};

describe("LearnerPortfolioRecordView", () => {
  it("distinguishes verified and merely recorded evidence", () => {
    render(
      <LearnerPortfolioRecordView
        formatDateTime={(value) => value}
        labels={labels}
        portfolio={{
          id: "01980a42-0000-7000-8000-000000000001",
          title: "QA evidence",
          summary: "Reviewed practice.",
          visibility: "organization",
          version: 1,
          updatedAt: "2026-07-18T10:00:00.000Z",
          items: [
            {
              id: "01980a43-0000-7000-8000-000000000001",
              title: "Accepted review",
              kind: "review",
              capturedAt: "2026-07-18T09:00:00.000Z",
              reflection: "Useful feedback.",
              position: 0,
              verification: "verified",
            },
            {
              id: "01980a43-0000-7000-8000-000000000002",
              title: "Draft submission",
              kind: "submission",
              capturedAt: "2026-07-18T08:00:00.000Z",
              reflection: "",
              position: 1,
              verification: "recorded",
            },
          ],
        }}
      />,
    );

    expect(screen.getByText("Verified evidence")).toBeInTheDocument();
    expect(screen.getByText("Recorded evidence")).toBeInTheDocument();
    expect(screen.getByText("Organization")).toBeInTheDocument();
  });

  it("renders distinct missing-portfolio and empty-evidence states", () => {
    const { rerender } = render(
      <LearnerPortfolioRecordView
        formatDateTime={String}
        labels={labels}
        portfolio={null}
      />,
    );
    expect(screen.getByRole("heading", { name: "No portfolio record yet" }))
      .toBeInTheDocument();

    rerender(
      <LearnerPortfolioRecordView
        formatDateTime={String}
        labels={labels}
        portfolio={{
          id: "01980a42-0000-7000-8000-000000000001",
          title: "QA evidence",
          summary: "",
          visibility: "private",
          version: 1,
          updatedAt: "2026-07-18T10:00:00.000Z",
          items: [],
        }}
      />,
    );
    expect(screen.getByRole("heading", { name: "No evidence selected" }))
      .toBeInTheDocument();
  });
});
