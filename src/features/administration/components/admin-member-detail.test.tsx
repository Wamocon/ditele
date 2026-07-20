import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { adminMemberDetailCopy } from "../admin-member-detail-copy";
import type { AdminMemberDetail } from "../admin-member-detail-model";
import { AdminMemberDetailView } from "./admin-member-detail";

const userId = "01980a00-0000-7000-8000-000000000001";
const cohortId = "01980a30-0000-7000-8000-000000000001";

const learnerDetail: AdminMemberDetail = {
  membership: {
    state: "active",
    joinedAt: "2026-07-17T08:00:00.000Z",
    validUntil: null,
    createdAt: "2026-07-16T08:00:00.000Z",
  },
  profile: {
    visible: true,
    displayName: "Lena Learner",
    locale: "de",
    timezone: "Europe/Berlin",
    state: "active",
  },
  roles: [
    { code: "learner", scope: "organization" },
    { code: "learner", scope: "cohort" },
  ],
  assignments: [{
    cohortId,
    cohortName: "Release group",
    cohortState: "active",
    courseTitle: "Practical testing",
    courseTitleLocale: "en",
    courseTitleUsesFallback: false,
    role: "learner",
    membershipState: "active",
    assignedAt: "2026-07-17T08:00:00.000Z",
    attemptTotal: 2,
    activeAttemptTotal: 1,
    acceptedAttemptTotal: 1,
    lastActivityAt: "2026-07-18T10:00:00.000Z",
  }],
  hasLearnerContext: true,
  learnerProgress: {
    attemptTotal: 2,
    activeAttemptTotal: 1,
    acceptedAttemptTotal: 1,
    lastActivityAt: "2026-07-18T10:00:00.000Z",
  },
  enrollments: [{
    id: "01980a33-0000-7000-8000-000000000001",
    courseTitle: "Practical testing",
    courseTitleLocale: "en",
    courseTitleUsesFallback: false,
    cohortId,
    state: "assigned",
    updatedAt: "2026-07-17T09:00:00.000Z",
    completedAt: null,
  }],
  certificates: [{
    id: "01980a39-0000-7000-8000-000000000001",
    courseTitle: "Practical testing",
    courseTitleLocale: "en",
    courseTitleUsesFallback: false,
    state: "available",
    type: "course_completion",
    recordedAt: "2026-07-18T11:00:00.000Z",
    issuedAt: "2026-07-18T11:00:00.000Z",
    availableAt: "2026-07-18T12:00:00.000Z",
    expiresAt: null,
    revokedAt: null,
  }],
};

describe("admin member detail view", () => {
  it("renders minimized learner context and no unsupported account or certificate commands", () => {
    const view = render(
      <AdminMemberDetailView
        detail={learnerDetail}
        labels={adminMemberDetailCopy.en}
        locale="en"
      />,
    );

    expect(screen.getByRole("heading", { level: 1, name: "Lena Learner" })).toBeInTheDocument();
    expect(screen.getByText("Privacy-minimized administration view")).toBeInTheDocument();
    expect(screen.getByText("Learner · Organization scope")).toBeInTheDocument();
    expect(screen.getByText("Learner · Group scope")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Learner context" })).toBeInTheDocument();
    expect(screen.getByText("Course completion")).toBeInTheDocument();
    expect(screen.getAllByText("Available").length).toBeGreaterThan(0);
    expect(
      screen.getByRole("link", { name: "Open group workspace" }),
    ).toHaveAttribute("href", `/en/admin/groups/${cohortId}`);
    expect(
      screen.getByRole("link", { name: /back to users/i }),
    ).toHaveAttribute("href", "/en/admin/users");

    expect(view.container).not.toHaveTextContent(userId);
    expect(view.container).not.toHaveTextContent("lena@example.test");
    expect(view.container).not.toHaveTextContent("+49 000 000000");
    expect(view.container).not.toHaveTextContent("password-hash");
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /download/i })).not.toBeInTheDocument();
  });

  it("does not fabricate learner progress for a trainer-only member", () => {
    const learnerAssignment = learnerDetail.assignments[0];
    if (!learnerAssignment) throw new Error("expected learner assignment fixture");
    render(
      <AdminMemberDetailView
        detail={{
          ...learnerDetail,
          roles: [{ code: "trainer", scope: "organization" }],
          assignments: [{
            ...learnerAssignment,
            role: "trainer",
            attemptTotal: 0,
            activeAttemptTotal: 0,
            acceptedAttemptTotal: 0,
            lastActivityAt: null,
          }],
          hasLearnerContext: false,
          learnerProgress: {
            attemptTotal: 0,
            activeAttemptTotal: 0,
            acceptedAttemptTotal: 0,
            lastActivityAt: null,
          },
          enrollments: [],
          certificates: [],
        }}
        labels={adminMemberDetailCopy.en}
        locale="en"
      />,
    );

    expect(screen.getByText("Trainer · Organization scope")).toBeInTheDocument();
    expect(screen.getByText("Trainer assignment")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Learner context" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Recorded learning progress" })).not.toBeInTheDocument();
  });

  it.each(["en", "de", "ru"] as const)(
    "renders localized honest empty and restricted states in %s",
    (locale) => {
      const labels = adminMemberDetailCopy[locale];
      const view = render(
        <AdminMemberDetailView
          detail={{
            ...learnerDetail,
            membership: { ...learnerDetail.membership, state: "removed" },
            profile: {
              visible: false,
              displayName: null,
              locale: null,
              timezone: null,
              state: null,
            },
            roles: [],
            assignments: [],
            hasLearnerContext: true,
            learnerProgress: {
              attemptTotal: 0,
              activeAttemptTotal: 0,
              acceptedAttemptTotal: 0,
              lastActivityAt: null,
            },
            enrollments: [],
            certificates: [],
          }}
          labels={labels}
          locale={locale}
        />,
      );

      expect(
        screen.getByRole("heading", { level: 1, name: labels.displayNameUnavailable }),
      ).toBeInTheDocument();
      expect(screen.getByText(labels.profileUnavailableDescription)).toBeInTheDocument();
      expect(screen.getByText(labels.noAssignments)).toBeInTheDocument();
      expect(screen.getByText(labels.noEnrollments)).toBeInTheDocument();
      expect(screen.getByText(labels.noCertificates)).toBeInTheDocument();
      expect(view.container).not.toHaveTextContent(userId);

      const profileSection = screen.getByRole("heading", { name: labels.profile }).closest("section");
      expect(profileSection).not.toBeNull();
      if (profileSection) {
        expect(within(profileSection).queryByText(userId)).not.toBeInTheDocument();
      }
    },
  );
});
