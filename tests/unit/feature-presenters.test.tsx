import { cleanup, render, screen, within } from "@testing-library/react";
import type { Route } from "next";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ImpersonationBanner } from "@/features/administration/components/impersonation-banner";
import { OperationsOverview } from "@/features/administration/components/operations-overview";
import type {
  EnrollmentApplication,
  ExportJob,
  ImpersonationSession,
  SupportIssue,
} from "@/features/administration/model";
import { AnalyticsOverview } from "@/features/analytics/components/analytics-overview";
import { CourseCatalog } from "@/features/catalog/components/course-catalog";
import { CourseDetail } from "@/features/catalog/components/course-detail";
import type { CatalogCourseDetail, CatalogPage } from "@/features/catalog/model/catalog";
import { CertificateVerificationPanel } from "@/features/certification/components/certificate-verification";
import { EnrollmentStatus } from "@/features/enrollment/components/enrollment-status";
import type { Enrollment } from "@/features/enrollment/model/enrollment";
import { GamificationSummary } from "@/features/gamification/components/gamification-summary";
import { IntegrationHealthPanel } from "@/features/integrations/components/integration-health";
import { LearnerDashboard } from "@/features/learning/components/learner-dashboard";
import type { LearnerDashboard as LearnerDashboardModel } from "@/features/learning/model/learner-dashboard";
import { QuestionThread } from "@/features/mentoring/components/question-thread";
import type { QuestionThread as QuestionThreadModel } from "@/features/mentoring/model/question";
import { NotificationList } from "@/features/notifications/components/notification-list";
import type { Notification } from "@/features/notifications/model";
import { OrganizationMembers } from "@/features/organizations/components/organization-members";
import type { OrganizationMembership } from "@/features/organizations/model";
import { PortfolioView } from "@/features/portfolio/components/portfolio-view";
import type { PortfolioViewModel } from "@/features/portfolio/model/portfolio";
import { PrivacyRequestStatus } from "@/features/privacy/components/privacy-request-status";
import type { PrivacyRequest } from "@/features/privacy/model";
import { ReviewQueue } from "@/features/review/components/review-queue";
import type { ReviewQueueItem } from "@/features/review/model";

afterEach(cleanup);

const timestamp = "2026-07-18T08:00:00.000Z";

describe("administration presenters", () => {
  const operationLabels = {
    title: "Operations",
    applications: "Applications",
    issues: "Issues",
    exports: "Exports",
    emptyTitle: "Nothing waiting",
    emptyDescription: "All operational queues are clear.",
    applicationStates: { pending: "Pending", accepted: "Accepted", rejected: "Rejected" },
    issueStates: { open: "Open", in_progress: "In progress", resolved: "Resolved", closed: "Closed" },
    exportStates: { queued: "Queued", running: "Running", ready: "Ready", failed: "Failed", expired: "Expired" },
  } as const;

  it("renders the empty operations state and every operational severity", () => {
    const { rerender } = render(
      <OperationsOverview applications={[]} exports={[]} issues={[]} labels={operationLabels} />,
    );
    expect(screen.getByRole("heading", { name: "Nothing waiting" })).toBeInTheDocument();

    const applications: EnrollmentApplication[] = ["pending", "accepted", "rejected"].map((state, index) => ({
      id: `application-${index}`,
      organizationId: "org-1",
      learnerId: `learner-${index}`,
      courseId: "course-1",
      state: state as EnrollmentApplication["state"],
      version: 1,
    }));
    const issues: SupportIssue[] = ["open", "resolved", "closed"].map((state, index) => ({
      id: `issue-${index}`,
      organizationId: "org-1",
      state: state as SupportIssue["state"],
      version: 1,
    }));
    const exports: ExportJob[] = ["queued", "ready", "failed"].map((state, index) => ({
      id: `export-${index}`,
      organizationId: "org-1",
      kind: index === 0 ? "learners" : "reviews",
      state: state as ExportJob["state"],
      requestedBy: "admin-1",
      createdAt: timestamp,
    }));

    rerender(
      <OperationsOverview applications={applications} exports={exports} issues={issues} labels={operationLabels} />,
    );
    expect(screen.getByRole("heading", { name: "Operations" })).toBeInTheDocument();
    expect(screen.getByText("Accepted")).toHaveClass("badge--success");
    expect(screen.getByText("Rejected")).toHaveClass("badge--danger");
    expect(screen.getByText("Open")).toHaveClass("badge--warning");
    expect(screen.getByText("Ready")).toHaveClass("badge--success");
    expect(screen.getByText("Failed")).toHaveClass("badge--danger");
  });

  it("shows active impersonation context but suppresses ended sessions", () => {
    const session: ImpersonationSession = {
      id: "impersonation-1",
      administratorId: "admin-1",
      administratorSessionId: "session-1",
      organizationId: "org-1",
      target: {
        userId: "learner-1",
        organizationId: "org-1",
        displayName: "Ada Learner",
        role: "learner",
        active: true,
      },
      reason: "Support investigation",
      state: "active",
      startedAt: timestamp,
      expiresAt: "2026-07-18T09:00:00.000Z",
    };
    const labels = {
      active: (name: string, role: string) => `Viewing ${name} as ${role}`,
      reason: "Reason",
      expiresAt: "Expires",
      end: "End role view",
      roles: { learner: "Learner", trainer: "Trainer", organization_admin: "Organization admin" },
    } as const;
    const { rerender } = render(
      <ImpersonationBanner
        endAction={vi.fn()}
        formatDateTime={(value) => `formatted:${value}`}
        labels={labels}
        session={session}
      />,
    );
    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("Viewing Ada Learner as Learner");
    expect(status).toHaveTextContent("Support investigation");
    expect(screen.getByRole("button", { name: "End role view" })).toBeEnabled();
    expect(document.querySelector('input[name="impersonationSessionId"]')).toHaveValue("impersonation-1");

    rerender(<ImpersonationBanner endAction={vi.fn()} formatDateTime={String} labels={labels} session={{ ...session, state: "ended" }} />);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});

describe("public and learner presenters", () => {
  const catalogLabels = {
    heading: "Courses",
    introduction: "Choose a practical testing course.",
    searchLabel: "Search",
    searchButton: "Find",
    emptyTitle: "No courses",
    emptyDescription: "Try another search.",
    duration: "Duration",
    practicalTasks: "Practical tasks",
    durationValue: (minutes: number) => `${minutes} minutes`,
    taskCountValue: (count: number) => `${count} tasks`,
    availability: { open: "Open", request_required: "Request", waitlist: "Waitlist", closed: "Closed" },
  } as const;

  const course = {
    id: "course-1",
    slug: "testing-foundations",
    version: 1,
    title: { en: "Testing foundations", de: "Testgrundlagen" },
    summary: { en: "Practice core techniques", de: "Kerntechniken üben" },
    durationMinutes: 90,
    taskCount: 4,
    availability: "request_required",
    tags: ["foundation"],
    publishedAt: timestamp,
  } satisfies CatalogPage["items"][number];

  it("renders localized catalog results and a useful no-results state", () => {
    const page: CatalogPage = { items: [course], page: 1, pageSize: 12, total: 1 };
    const { rerender } = render(
      <CourseCatalog
        catalog={page}
        courseHref={(slug) => `/de/catalog/${slug}` as Route}
        labels={catalogLabels}
        locale="de"
        search="grenze"
      />,
    );
    expect(screen.getByRole("searchbox", { name: "Search" })).toHaveValue("grenze");
    expect(screen.getByRole("link", { name: "Testgrundlagen" })).toHaveAttribute("href", "/de/catalog/testing-foundations");
    expect(screen.getByText("90 minutes")).toBeInTheDocument();
    expect(screen.getByText("4 tasks")).toBeInTheDocument();

    rerender(
      <CourseCatalog
        catalog={{ items: [], page: 1, pageSize: 12, total: 0 }}
        courseHref={() => "/en/catalog/none" as Route}
        labels={catalogLabels}
        locale="en"
      />,
    );
    expect(screen.getByRole("heading", { name: "No courses" })).toBeInTheDocument();
  });

  it("renders localized course detail, enrollment path, and outcomes", () => {
    const detail: CatalogCourseDetail = {
      ...course,
      description: { en: "A complete practical introduction", de: "Eine praktische Einführung" },
      learningOutcomes: [
        { en: "Design boundary tests", de: "Grenzwerttests entwerfen" },
        { en: "Report evidence" },
      ],
      prerequisites: [],
    };
    render(
      <CourseDetail
        catalogHref={"/de/catalog" as Route}
        course={detail}
        enrollmentHref={"/de/learn/enroll/course-1" as Route}
        labels={{
          backToCatalog: "Back",
          requestEnrollment: "Request enrollment",
          about: "About",
          outcomes: "Outcomes",
          availability: catalogLabels.availability,
        }}
        locale="de"
      />,
    );
    expect(screen.getByRole("heading", { name: "Testgrundlagen", level: 1 })).toBeInTheDocument();
    expect(screen.getByText("Eine praktische Einführung")).toBeInTheDocument();
    expect(screen.getByText("Report evidence")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Request enrollment" })).toHaveAttribute("href", "/de/learn/enroll/course-1");
  });

  it("renders next action, populated progress, and each empty dashboard section", () => {
    const dashboard: LearnerDashboardModel = {
      activeCourses: [{
        id: "enrollment-1",
        courseId: "course-1",
        groupId: "group-1",
        title: "Testing foundations",
        state: "active",
        progressionMode: "legacy_schedule",
        completedActivities: 2,
        totalActivities: 5,
      }],
      completedCourses: [],
      requestedCourses: [],
      nextAction: {
        activityId: "task-1",
        courseId: "course-1",
        title: "Boundary analysis",
        state: "available",
        reason: "Your next scheduled task is ready.",
        href: "/en/learn/tasks/task-1",
      },
    };
    const labels = {
      heading: "Learning dashboard",
      nextAction: "Next action",
      continueLearning: "Continue",
      noAction: "No action is available.",
      activeCourses: "Active courses",
      completedCourses: "Completed courses",
      requestedCourses: "Requested courses",
      awaitingAssignment: "Awaiting assignment.",
      emptySection: "No courses here.",
      progression: {
        legacy_schedule: "Scheduled",
        manual_path: "Flexible",
        competency_path: "Competency based",
      },
      progress: (completed: number, total: number) => `${completed} of ${total}`,
    } as const;
    const { rerender } = render(
      <LearnerDashboard
        courseHref={(item) => `/en/learn/courses/${item.courseId}` as Route}
        dashboard={dashboard}
        labels={labels}
        nextActionHref={(action) => action.href as Route}
      />,
    );
    expect(screen.getByRole("link", { name: "Continue" })).toHaveAttribute("href", "/en/learn/tasks/task-1");
    expect(
      screen.getByRole("progressbar", {
        name: "Testing foundations: 2 of 5",
      }),
    ).toHaveAttribute("max", "5");
    expect(screen.getAllByText("No courses here.")).toHaveLength(2);

    rerender(
      <LearnerDashboard
        courseHref={() => "/en/learn" as Route}
        dashboard={{ ...dashboard, activeCourses: [], nextAction: null }}
        labels={labels}
        nextActionHref={() => "/en/learn" as Route}
      />,
    );
    expect(screen.getByRole("status")).toHaveTextContent("No action is available.");
    expect(screen.getAllByText("No courses here.")).toHaveLength(3);
  });
});

describe("status presenters", () => {
  it("renders certificate verification variants without leaking stale details", () => {
    const labels = { title: "Certificate verification", valid: "Valid", revoked: "Revoked", expired: "Expired", not_found: "Not found" };
    const { rerender } = render(
      <CertificateVerificationPanel
        labels={labels}
        result={{ status: "valid", certificateId: "cert-1", courseTitle: "Testing foundations", issuedAt: timestamp, expiresAt: null }}
      />,
    );
    expect(screen.getByText("Valid")).toHaveClass("badge--success");
    expect(screen.getByText("Testing foundations")).toBeInTheDocument();

    rerender(<CertificateVerificationPanel labels={labels} result={{ status: "revoked", certificateId: "cert-1" }} />);
    expect(screen.getByText("Revoked")).toHaveClass("badge--danger");
    expect(screen.queryByText("Testing foundations")).not.toBeInTheDocument();

    rerender(<CertificateVerificationPanel labels={labels} result={{ status: "not_found" }} />);
    expect(screen.getByRole("heading", { name: "Certificate verification" })).toBeInTheDocument();
    expect(screen.getByText("Not found")).toBeInTheDocument();
  });

  it("maps every enrollment state to its accessible status and optional decision reason", () => {
    const states = {
      requested: { name: "Requested", description: "Waiting for review" },
      approved: { name: "Approved", description: "Approved for assignment" },
      rejected: { name: "Rejected", description: "Not approved" },
      assigned: { name: "Assigned", description: "Ready to learn" },
      cancelled: { name: "Cancelled", description: "Request cancelled" },
      completed: { name: "Completed", description: "Course completed" },
    } as const;
    const enrollment: Enrollment = {
      id: "enrollment-1",
      learnerId: "learner-1",
      courseId: "course-1",
      state: "rejected",
      version: 2,
      requestedAt: timestamp,
      updatedAt: timestamp,
      decisionReason: "Prerequisite missing",
    };
    const { rerender } = render(
      <EnrollmentStatus enrollment={enrollment} labels={{ heading: "Enrollment", reason: "Reason", states }} />,
    );
    expect(screen.getByText("Rejected")).toHaveClass("badge--danger");
    expect(screen.getByText(/Prerequisite missing/)).toBeInTheDocument();

    for (const state of ["requested", "approved", "assigned", "cancelled", "completed"] as const) {
      rerender(
        <EnrollmentStatus
          enrollment={{ ...enrollment, state, decisionReason: undefined }}
          labels={{ heading: "Enrollment", reason: "Reason", states }}
        />,
      );
      expect(screen.getByRole("status")).toHaveTextContent(states[state].description);
      expect(screen.queryByText("Prerequisite missing")).not.toBeInTheDocument();
    }
  });

  it("distinguishes unavailable and populated analytics, rewards, and integration health", () => {
    const { rerender } = render(
      <AnalyticsOverview
        available={false}
        labels={{ title: "Analytics", unavailableTitle: "Analytics unavailable", unavailableDescription: "No consent" }}
        metrics={[]}
      />,
    );
    expect(screen.getByRole("heading", { name: "Analytics unavailable" })).toBeInTheDocument();
    rerender(
      <AnalyticsOverview
        available
        labels={{ title: "Analytics", unavailableTitle: "Analytics unavailable", unavailableDescription: "No consent" }}
        metrics={[{ key: "completion", definition: "Completion rate", value: 72, calculatedAt: timestamp }]}
      />,
    );
    expect(screen.getByText("72")).toBeInTheDocument();

    rerender(
      <GamificationSummary
        badges={[]}
        enabled={false}
        entries={[]}
        labels={{ title: "Progress rewards", unavailableTitle: "Rewards off", unavailableDescription: "Not enabled", xp: (value) => `${value} XP` }}
      />,
    );
    expect(screen.getByRole("heading", { name: "Rewards off" })).toBeInTheDocument();
    rerender(
      <GamificationSummary
        badges={[{ id: "badge-1", title: "Boundary specialist", skillId: "skill-1", minimumXp: 100 }]}
        enabled
        entries={[{ id: "xp-1", learnerId: "learner-1", skillId: "skill-1", sourceEventId: "event-1", eventType: "review.accepted", amount: 25, awardedAt: timestamp }]}
        labels={{ title: "Progress rewards", unavailableTitle: "Rewards off", unavailableDescription: "Not enabled", xp: (value) => `${value} XP` }}
      />,
    );
    expect(screen.getByText("25 XP")).toBeInTheDocument();
    expect(screen.getByText("Boundary specialist")).toHaveClass("badge--success");

    const healthLabels = {
      title: "Integration health",
      unavailableTitle: "No integration",
      unavailableDescription: "Configure a provider.",
      statuses: { healthy: "Healthy", degraded: "Degraded", unavailable: "Unavailable", not_configured: "Not configured" },
      pending: (value: number) => `${value} pending`,
      deadLetters: (value: number) => `${value} dead letters`,
    } as const;
    rerender(<IntegrationHealthPanel health={null} labels={healthLabels} />);
    expect(screen.getByRole("heading", { name: "No integration" })).toBeInTheDocument();
    for (const status of ["healthy", "degraded", "unavailable", "not_configured"] as const) {
      rerender(
        <IntegrationHealthPanel
          health={{ connectionId: "connection-1", status, pendingCount: 2, deadLetterCount: 1, oldestPendingAt: null, checkedAt: timestamp }}
          labels={healthLabels}
        />,
      );
      expect(screen.getByText(healthLabels.statuses[status])).toBeInTheDocument();
    }
  });
});

describe("mentoring, notification, tenant, portfolio, and privacy presenters", () => {
  const questionLabels = {
    heading: "Question",
    created: "Created",
    learner: "Learner",
    trainer: "Trainer",
    empty: "No messages yet",
    conversation: "Conversation",
    assignmentHistory: "Assignment history",
    states: { open: "Open", assigned: "Assigned", transferred: "Transferred", answered: "Answered", archived: "Archived" },
    transfer: (state: "pending" | "accepted" | "failed", createdAt: string, reason?: string) => `${state} ${createdAt} ${reason ?? ""}`,
  } as const;
  const thread: QuestionThreadModel = {
    id: "question-1",
    taskId: "task-1",
    learnerId: "learner-1",
    groupId: "group-1",
    state: "answered",
    version: 3,
    assignedTrainerId: "trainer-2",
    createdAt: timestamp,
    updatedAt: timestamp,
    answeredAt: timestamp,
    messages: [
      { id: "message-1", author: { id: "learner-1", kind: "learner" }, body: "How should I select boundaries?", createdAt: timestamp },
      { id: "message-2", author: { id: "trainer-2", kind: "trainer" }, body: "Start from the equivalence partitions.", createdAt: timestamp },
    ],
    transferHistory: [{ id: "transfer-1", fromTrainerId: "trainer-1", toTrainerId: "trainer-2", reason: "Specialist review", state: "accepted", createdAt: timestamp }],
    history: [],
  };

  it("renders both conversation authors and transfer history, plus a genuine empty thread", () => {
    const { rerender } = render(<QuestionThread labels={questionLabels} thread={thread} />);
    const conversation = screen.getByRole("list", { name: "Conversation" });
    expect(within(conversation).getByRole("heading", { name: "Learner" })).toBeInTheDocument();
    expect(within(conversation).getByRole("heading", { name: "Trainer" })).toBeInTheDocument();
    expect(screen.getByText(/Specialist review/)).toBeInTheDocument();
    expect(screen.getByText("Answered")).toHaveClass("badge--success");

    rerender(<QuestionThread labels={questionLabels} thread={{ ...thread, state: "open", messages: [], transferHistory: [] }} />);
    expect(screen.getByRole("status")).toHaveTextContent("No messages yet");
    expect(screen.queryByText("Assignment history")).not.toBeInTheDocument();
  });

  it("distinguishes unread notifications and the empty inbox", () => {
    const notifications: Notification[] = [
      { id: "notification-1", recipientId: "learner-1", organizationId: "org-1", type: "question_answered", titleKey: "question.ready", bodyKey: "question.body", targetPath: "/en/learn/questions", readAt: null, createdAt: timestamp, sourceEventId: "event-1" },
      { id: "notification-2", recipientId: "learner-1", organizationId: "org-1", type: "certificate_issued", titleKey: "certificate.ready", bodyKey: "certificate.body", targetPath: "/en/learn/certificates", readAt: timestamp, createdAt: timestamp, sourceEventId: "event-2" },
    ];
    const labels = { title: "Notifications", emptyTitle: "All caught up", emptyDescription: "No notifications", unread: "Unread", resolveTitle: (key: string) => `title:${key}` };
    const { rerender } = render(<NotificationList labels={labels} notifications={notifications} />);
    expect(screen.getByText("Unread")).toHaveClass("badge--warning");
    expect(screen.getByText("title:certificate.ready")).toBeInTheDocument();
    rerender(<NotificationList labels={labels} notifications={[]} />);
    expect(screen.getByRole("heading", { name: "All caught up" })).toBeInTheDocument();
  });

  it("enforces the organization-members forbidden view and maps membership states", () => {
    const memberships: OrganizationMembership[] = ["active", "suspended", "removed"].map((state, index) => ({
      id: `membership-${index}`,
      organizationId: "org-1",
      userId: `user-${index}`,
      role: "member",
      state: state as OrganizationMembership["state"],
      version: 1,
    }));
    const labels = {
      title: "Members",
      forbiddenTitle: "Access denied",
      forbiddenDescription: "Organization administration is required.",
      states: { invited: "Invited", active: "Active", suspended: "Suspended", removed: "Removed" },
    } as const;
    const { rerender } = render(<OrganizationMembers authorized={false} labels={labels} memberships={memberships} />);
    expect(screen.getByRole("heading", { name: "Access denied" })).toBeInTheDocument();
    rerender(<OrganizationMembers authorized labels={labels} memberships={memberships} />);
    expect(screen.getByText("Active")).toHaveClass("badge--success");
    expect(screen.getByText("Suspended")).toHaveClass("badge--warning");
    expect(screen.getByText("Removed")).toHaveClass("badge");
  });

  it("orders verified portfolio evidence and identifies preview and empty modes", () => {
    const model: PortfolioViewModel = {
      source: "preview",
      portfolio: {
        id: "portfolio-1",
        learnerId: "learner-1",
        title: "Ada's QA portfolio",
        summary: "Verified practical testing evidence",
        version: 1,
        visibility: "unlisted",
        updatedAt: timestamp,
        items: [
          { id: "item-2", position: 2, caption: "Second", evidence: { id: "evidence-2", title: "API report", kind: "reviewed_artifact", skillIds: ["api"], verifiedAt: timestamp } },
          { id: "item-1", position: 1, caption: "First", evidence: { id: "evidence-1", title: "Boundary report", kind: "submission", skillIds: ["boundary"], verifiedAt: timestamp } },
        ],
      },
    };
    const labels = { previewTitle: "Preview", previewDescription: "Not publicly shared", evidenceHeading: "Evidence", emptyTitle: "No evidence", emptyDescription: "Accepted work appears here", verified: "Verified", skills: "Skills", visibility: { private: "Private", unlisted: "Unlisted", public: "Public" } };
    const { rerender } = render(<PortfolioView labels={labels} model={model} />);
    expect(screen.getByRole("heading", { name: "Preview" })).toBeInTheDocument();
    const items = screen.getAllByRole("listitem");
    expect(items[0]).toHaveTextContent("Boundary report");
    expect(items[1]).toHaveTextContent("API report");
    expect(screen.getAllByText("Verified")).toHaveLength(2);

    rerender(<PortfolioView labels={labels} model={{ ...model, source: "live", portfolio: { ...model.portfolio, items: [] } }} />);
    expect(screen.queryByRole("heading", { name: "Preview" })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "No evidence" })).toBeInTheDocument();
  });

  it("renders privacy request absence and terminal status tones", () => {
    const labels = { emptyTitle: "No privacy request", emptyDescription: "Create one when needed", title: "Privacy request", states: { requested: "Requested", processing: "Processing", completed: "Completed", rejected: "Rejected", cancelled: "Cancelled" } } as const;
    const { rerender } = render(<PrivacyRequestStatus labels={labels} request={null} />);
    expect(screen.getByRole("heading", { name: "No privacy request" })).toBeInTheDocument();
    const request: PrivacyRequest = { id: "privacy-1", subjectId: "learner-1", organizationId: null, type: "export", state: "rejected", version: 1, requestedAt: timestamp, completedAt: null, failureCode: "provider_timeout", idempotencyKey: "privacy-export-0001" };
    rerender(<PrivacyRequestStatus labels={labels} request={request} />);
    expect(screen.getByText("Rejected")).toHaveClass("badge--danger");
    rerender(<PrivacyRequestStatus labels={labels} request={{ ...request, state: "completed" }} />);
    expect(screen.getByText("Completed")).toHaveClass("badge--success");
    rerender(<PrivacyRequestStatus labels={labels} request={{ ...request, state: "processing" }} />);
    expect(screen.getByText("Processing")).toHaveClass("badge");
  });
});

describe("trainer queue presenter", () => {
  const labels = {
    title: "Review queue",
    itemCount: (count: number) => `${count} items`,
    learner: "Learner",
    task: "Task",
    group: "Group",
    submittedAt: "Submitted",
    status: "Status",
    open: "Open review",
    emptyTitle: "Queue clear",
    emptyDescription: "No submissions need review.",
    states: { submitted: "Submitted", resubmitted: "Resubmitted" },
    ownership: { assigned: "Assigned", transferred: "Transferred" },
  } as const;

  it("renders desktop/mobile queue projections for assigned and transferred submissions", () => {
    const items: ReviewQueueItem[] = [
      { id: "submission-1", groupId: "group-1", groupName: "July cohort", learnerName: "Ada", taskTitle: "Boundary analysis", state: "submitted", version: 1, submittedAt: timestamp, assignedTrainerId: "trainer-1" },
      { id: "submission-2", groupId: "group-1", groupName: "July cohort", learnerName: "Linus", taskTitle: "API evidence", state: "resubmitted", version: 2, submittedAt: timestamp, assignedTrainerId: "trainer-2", transfer: { id: "transfer-1", fromTrainerId: "trainer-1", toTrainerId: "trainer-2", status: "accepted", createdAt: timestamp } },
    ];
    const { rerender } = render(
      <ReviewQueue formatDateTime={() => "18 Jul 2026"} items={items} labels={labels} reviewHref={(id) => `/en/trainer/submissions/${id}`} />,
    );
    expect(screen.getByRole("heading", { name: "Review queue" })).toBeInTheDocument();
    expect(screen.getAllByText("Transferred")).toHaveLength(2);
    expect(screen.getAllByText("Resubmitted")[0]).toHaveClass("badge--warning");
    expect(screen.getAllByRole("link", { name: "Open review" })[0]).toHaveAttribute("href", "/en/trainer/submissions/submission-1");

    rerender(<ReviewQueue formatDateTime={String} items={[]} labels={labels} reviewHref={String} />);
    expect(screen.getByRole("heading", { name: "Queue clear" })).toBeInTheDocument();
  });
});
