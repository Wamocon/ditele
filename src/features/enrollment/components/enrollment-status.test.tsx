import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { EnrollmentStatus, type EnrollmentStatusLabels } from "./enrollment-status";

const labels: EnrollmentStatusLabels = {
  heading: "Enrollment status",
  reason: "Decision reason",
  states: {
    requested: { name: "Requested", description: "Waiting for review." },
    approved: { name: "Approved", description: "Ready for assignment." },
    rejected: { name: "Rejected", description: "The request was rejected." },
    assigned: { name: "Assigned", description: "Learning access is active." },
    cancelled: { name: "Cancelled", description: "The request was cancelled." },
    completed: { name: "Completed", description: "The course is complete." },
  },
};

describe("EnrollmentStatus", () => {
  it("renders the canonical completed state as a successful terminal outcome", () => {
    render(
      <EnrollmentStatus
        enrollment={{
          id: "enrollment-1",
          learnerId: "learner-1",
          courseId: "course-1",
          state: "completed",
          version: 3,
          requestedAt: "2026-07-17T08:00:00.000Z",
          updatedAt: "2026-07-20T08:00:00.000Z",
        }}
        labels={labels}
      />,
    );

    expect(screen.getByRole("heading", { name: labels.heading })).toBeVisible();
    expect(screen.getByText("Completed")).toHaveClass("badge--success");
    expect(screen.getByRole("status")).toHaveTextContent("The course is complete.");
  });
});
