import { PortfolioViewModelSchema, type PortfolioViewModel } from "../model/portfolio";

export const PORTFOLIO_PREVIEW: PortfolioViewModel = PortfolioViewModelSchema.parse({
  source: "preview",
  portfolio: {
    id: "preview-portfolio",
    learnerId: "preview-learner",
    title: "QA evidence portfolio preview",
    summary: "Illustrative evidence only. This preview is not connected to learner records.",
    version: 1,
    visibility: "private",
    items: [
      {
        id: "preview-item",
        evidence: {
          id: "preview-evidence",
          title: "Boundary-value analysis evidence",
          kind: "reviewed_artifact",
          skillIds: ["test-design.boundary-values"],
          verifiedAt: "2026-07-17T08:00:00.000Z",
          reviewId: "preview-review",
        },
        caption: "Illustrative trainer-verified evidence card.",
        position: 0,
      },
    ],
    updatedAt: "2026-07-17T08:00:00.000Z",
  },
});
