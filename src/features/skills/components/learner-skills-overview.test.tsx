import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  LearnerSkillsOverview,
  type LearnerSkillsOverviewLabels,
} from "./learner-skills-overview";

const labels: LearnerSkillsOverviewLabels = {
  title: "Skills and mastery",
  description: "Recorded from reviewed work.",
  activeSkills: "Active skills",
  masteryRecords: "Mastery records",
  emptyTitle: "No active skills",
  emptyDescription: "No skill definitions are available.",
  descriptionUnavailable: "No description.",
  masteryRecorded: "Mastery recorded",
  masteryNotRecorded: "No mastery recorded",
  masteryScore: "Recorded mastery",
  updated: "Updated",
  taxonomyVersion: "Taxonomy version",
  prerequisites: "Prerequisites",
  prerequisitesUnavailable: "Prerequisites unavailable.",
  noVisiblePrerequisites: "No visible prerequisites.",
};

describe("LearnerSkillsOverview", () => {
  it("renders exact mastery without inventing a target or an unrecorded score", () => {
    render(
      <LearnerSkillsOverview
        collection={{
          prerequisiteRelationshipsVisible: false,
          skills: [
            {
              id: "01980a2a-0000-7000-8000-000000000001",
              code: "analysis",
              title: "Risk analysis",
              description: "Analyze product risk.",
              taxonomyVersion: 1,
              mastery: {
                basisPoints: 7_625,
                ruleVersion: 1,
                updatedAt: "2026-07-18T10:00:00.000Z",
              },
              prerequisites: [],
            },
            {
              id: "01980a2a-0000-7000-8000-000000000002",
              code: "design",
              title: "Test design",
              description: "",
              taxonomyVersion: 1,
              mastery: null,
              prerequisites: [],
            },
          ],
        }}
        formatDateTime={(value) => value}
        formatPercent={(value) => `${value / 100}%`}
        labels={labels}
      />,
    );

    expect(screen.getByRole("progressbar", { name: "Recorded mastery: 76.25%" }))
      .toHaveAttribute("value", "7625");
    expect(screen.getAllByText("No mastery recorded")).toHaveLength(2);
    expect(screen.getAllByText("Prerequisites unavailable.")).toHaveLength(2);
    expect(screen.queryByText(/target/i)).not.toBeInTheDocument();
  });

  it("renders the active-definition empty state", () => {
    render(
      <LearnerSkillsOverview
        collection={{ skills: [], prerequisiteRelationshipsVisible: false }}
        formatDateTime={String}
        formatPercent={String}
        labels={labels}
      />,
    );
    expect(screen.getByRole("heading", { name: "No active skills" }))
      .toBeInTheDocument();
  });
});
