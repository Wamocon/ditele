import { render, screen, within } from "@testing-library/react";
import type { Route } from "next";
import { describe, expect, it } from "vitest";

import { LearnerDashboard, type LearnerDashboardLabels } from "./learner-dashboard";

const labels: LearnerDashboardLabels = {
  heading: "My learning",
  nextAction: "Next action",
  continueLearning: "Continue",
  noAction: "Nothing available",
  activeCourses: "Active courses",
  completedCourses: "Completed courses",
  requestedCourses: "Requested courses",
  awaitingAssignment: "Awaiting assignment.",
  emptySection: "Nothing here",
  progression: {
    legacy_schedule: "Scheduled",
    manual_path: "Flexible",
    competency_path: "Competency",
  },
  progress: (completed, total) => `${completed} of ${total} completed`,
};

describe("LearnerDashboard", () => {
  it("links assigned and completed courses but keeps requests non-actionable", () => {
    render(
      <LearnerDashboard
        courseHref={(course) => `/en/learn/courses/${course.courseId}` as Route}
        dashboard={{
          activeCourses: [{
            id: "enrollment-active",
            courseId: "course-active",
            groupId: "cohort-active",
            title: "Active testing",
            state: "active",
            progressionMode: "legacy_schedule",
            completedActivities: 1,
            totalActivities: 3,
          }],
          completedCourses: [{
            id: "enrollment-completed",
            courseId: "course-completed",
            groupId: "cohort-completed",
            title: "Completed testing",
            state: "completed",
            progressionMode: "legacy_schedule",
            completedActivities: 3,
            totalActivities: 3,
          }],
          requestedCourses: [{
            id: "enrollment-requested",
            courseId: "course-requested",
            title: "Requested testing",
            state: "requested",
            progressionMode: "legacy_schedule",
            completedActivities: 0,
            totalActivities: 0,
          }],
          nextAction: null,
        }}
        labels={labels}
        nextActionHref={(action) => action.href as Route}
      />,
    );

    expect(screen.getByRole("link", { name: "Active testing" })).toHaveAttribute(
      "href", "/en/learn/courses/course-active",
    );
    expect(screen.getByRole("link", { name: "Completed testing" })).toHaveAttribute(
      "href", "/en/learn/courses/course-completed",
    );
    const requestedSection = screen.getByRole("region", {
      name: "Requested courses",
    });
    expect(within(requestedSection).getByText("Requested testing")).toBeInTheDocument();
    expect(within(requestedSection).queryByRole("link")).not.toBeInTheDocument();
    expect(within(requestedSection).queryByText("Scheduled")).not.toBeInTheDocument();
    expect(within(requestedSection).getByRole("status")).toHaveTextContent(
      "Awaiting assignment.",
    );
  });
});
