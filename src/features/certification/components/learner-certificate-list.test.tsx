import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  LearnerCertificateList,
  type LearnerCertificateListLabels,
} from "./learner-certificate-list";

const labels: LearnerCertificateListLabels = {
  title: "Certificates",
  description: "Certificate records.",
  emptyTitle: "No certificate records",
  emptyDescription: "Nothing is recorded yet.",
  states: {
    eligible: "Eligible",
    issued: "Issued",
    available: "Available",
    revoked: "Revoked",
    expired: "Expired",
  },
  stateDescriptions: {
    eligible: "Eligibility recorded.",
    issued: "Issued, awaiting availability.",
    available: "Issued and available.",
    revoked: "No longer valid.",
    expired: "Expired.",
  },
  types: {
    course_completion: "Course completion certificate",
    exam: "Assessment certificate",
    competency: "Competency certificate",
  },
  issued: "Issued",
  recorded: "Recorded",
  available: "Available since",
  expires: "Expires",
  revoked: "Revoked",
  downloadUnavailable: "Controlled download is unavailable.",
};

describe("LearnerCertificateList", () => {
  it("renders a safe read-only certificate without a fake download action", () => {
    render(
      <LearnerCertificateList
        certificates={[{
          id: "01980a50-0000-7000-8000-000000000001",
          state: "available",
          type: "course_completion",
          courseTitle: "Practical testing",
          issuedAt: "2026-07-17T10:00:00.000Z",
          availableAt: "2026-07-18T10:00:00.000Z",
          expiresAt: null,
          revokedAt: null,
          createdAt: "2026-07-17T09:00:00.000Z",
        }]}
        formatDate={(value) => value}
        labels={labels}
      />,
    );

    expect(screen.getByRole("heading", { name: "Practical testing" }))
      .toBeInTheDocument();
    expect(screen.getByText("Controlled download is unavailable."))
      .toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("renders an explicit empty state", () => {
    render(
      <LearnerCertificateList
        certificates={[]}
        formatDate={String}
        labels={labels}
      />,
    );
    expect(screen.getByRole("heading", { name: "No certificate records" }))
      .toBeInTheDocument();
  });
});
