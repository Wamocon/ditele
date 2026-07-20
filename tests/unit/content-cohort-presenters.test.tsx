import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CohortWorkspace } from "@/features/cohorts/components/cohort-workspace";
import type { Cohort, CohortMember } from "@/features/cohorts/model";
import { CourseEditorOverview } from "@/features/content/components/course-editor-overview";
import type {
  ContentTaskDefinition,
  ContentValidationIssue,
  CourseContentVersion,
} from "@/features/content/model";

afterEach(cleanup);

const timestamp = "2026-07-18T08:00:00.000Z";

const editorLabels = {
  title: "Course editor",
  version: (version: number) => `Version ${version}`,
  locales: "Languages",
  complete: "Complete",
  incomplete: "Incomplete",
  stages: "Stages",
  tasks: (count: number) => `${count} tasks`,
  checklist: "Publishing checklist",
  checklistPassed: "Ready to continue",
  checklistFailed: (count: number) => `${count} issues block publishing`,
  submitForReview: "Submit for review",
  publish: "Publish",
  preview: "Preview",
  states: { draft: "Draft", in_review: "In review", published: "Published", archived: "Archived" },
  localeNames: { en: "English", de: "German", ru: "Russian" },
} as const;

const task: ContentTaskDefinition = {
  id: "task-1",
  title: { en: "", de: "", ru: "Анализ границ" },
  description: { en: "Test the documented limits", de: "Grenzen testen", ru: "Проверить границы" },
  expectedAnswer: { en: "Evidence-based report", de: "Bericht", ru: "Отчёт" },
  hint: { en: "Check either side", de: "Beide Seiten", ru: "Обе стороны" },
  beforeMediaIds: [],
  afterMediaIds: [],
  bugCategoryIds: [],
  skillIds: ["skill-1"],
  prerequisiteTaskIds: [],
  position: 1,
};

const content: CourseContentVersion = {
  id: "content-1",
  organizationId: "org-1",
  courseId: "course-1",
  versionNumber: 3,
  revision: 7,
  state: "draft",
  metadata: {
    name: { en: "Testing foundations", de: "Testgrundlagen", ru: "Основы тестирования" },
    description: { en: "Practical testing", de: "Praktisches Testen", ru: "Практическое тестирование" },
  },
  stages: [{
    id: "stage-1",
    title: { en: "", de: "Grundlagen", ru: "Основы" },
    position: 1,
    startMediaIds: [],
    endMediaIds: [],
    tasks: [task],
  }],
  media: [],
  bugCategories: [],
  prerequisiteCourseIds: [],
  createdBy: "admin-1",
  createdAt: timestamp,
  updatedAt: timestamp,
};

describe("CourseEditorOverview", () => {
  it("allows a complete draft to enter review and exposes localized content in preview order", () => {
    render(
      <CourseEditorOverview
        content={content}
        issues={[]}
        labels={editorLabels}
        previewHref="/en/admin/courses/course-1/preview"
        publishAction={vi.fn()}
        submitForReviewAction={vi.fn()}
      />,
    );

    expect(screen.getByRole("heading", { name: "Course editor" })).toBeInTheDocument();
    expect(screen.getByText("Draft")).toHaveClass("badge");
    expect(screen.getAllByText("Complete")).toHaveLength(3);
    expect(screen.getByText((_, element) => element?.tagName === "STRONG" && element.textContent === "1. Grundlagen")).toBeInTheDocument();
    expect(screen.getByText("Анализ границ")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Ready to continue" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Submit for review" })).toBeEnabled();
    expect(screen.getByRole("link", { name: "Preview" })).toHaveAttribute("href", "/en/admin/courses/course-1/preview");
    expect(document.querySelector('input[name="expectedRevision"]')).toHaveValue("7");
  });

  it("blocks publishing while review validation has missing and locale-specific content", () => {
    const issues: ContentValidationIssue[] = [
      { code: "missing_translation", path: "metadata.name.ru", locale: "ru", message: "Russian name is required" },
      { code: "media_not_ready", path: "media.video-1", message: "Video processing has not completed" },
    ];
    render(
      <CourseEditorOverview
        content={{
          ...content,
          state: "in_review",
          metadata: {
            name: { ...content.metadata.name, de: "", ru: "" },
            description: { ...content.metadata.description, en: "", ru: "" },
          },
        }}
        issues={issues}
        labels={editorLabels}
        previewHref="/en/preview"
        publishAction={vi.fn()}
        submitForReviewAction={vi.fn()}
      />,
    );

    expect(screen.getByText("In review")).toHaveClass("badge--warning");
    expect(screen.getAllByText("Incomplete")).toHaveLength(3);
    expect(screen.getByText("2 issues block publishing")).toBeInTheDocument();
    expect(screen.getByText("Russian name is required")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Publish" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Submit for review" })).not.toBeInTheDocument();
  });

  it("renders immutable published status without mutation controls", () => {
    render(
      <CourseEditorOverview
        content={{ ...content, state: "published" }}
        issues={[]}
        labels={editorLabels}
        previewHref="/en/preview"
        publishAction={vi.fn()}
        submitForReviewAction={vi.fn()}
      />,
    );
    expect(screen.getByText("Published")).toHaveClass("badge--success");
    expect(screen.queryByRole("button", { name: "Publish" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Submit for review" })).not.toBeInTheDocument();
  });
});

const cohortLabels = {
  course: "Course",
  progressionMode: "Progression",
  learners: "Learners",
  trainers: "Trainers",
  members: "Members",
  schedule: "Schedule",
  noMembers: "No active members",
  noMembersDescription: "Assign learners and trainers before starting.",
  noSchedule: "No task dates",
  noScheduleDescription: "Tasks have no activation overrides.",
  taskId: "Task",
  activateAt: "Activate at",
  saveDate: "Save date",
  start: "Start cohort",
  complete: "Complete cohort",
  states: { waiting: "Waiting", active: "Active", completed: "Completed" },
  modes: { legacy_date: "Scheduled dates", learning_path: "Learning path" },
  memberRoles: { learner: "Learner", trainer: "Trainer" },
} as const;

const baseCohort: Cohort = {
  id: "cohort-1",
  organizationId: "org-1",
  courseId: "course-1",
  courseVersionId: "content-1",
  name: { en: "July cohort", de: "Juli-Gruppe", ru: "Июльская группа" },
  state: "waiting",
  progressionMode: "legacy_date",
  version: 4,
  members: [],
  taskActivations: [],
  createdAt: timestamp,
  updatedAt: timestamp,
};

describe("CohortWorkspace", () => {
  it("shows waiting cohort prerequisites and submits a compare-and-set start command", () => {
    render(
      <CohortWorkspace
        changeScheduleAction={vi.fn()}
        changeStateAction={vi.fn()}
        cohort={baseCohort}
        displayName="July cohort"
        formatDateTime={(value) => value}
        labels={cohortLabels}
      />,
    );
    expect(screen.getByText("Waiting")).toHaveClass("badge--warning");
    expect(screen.getByRole("heading", { name: "No active members" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "No task dates" })).toBeInTheDocument();
    const start = screen.getByRole("button", { name: "Start cohort" });
    expect(start).toHaveAttribute("name", "toState");
    expect(start).toHaveAttribute("value", "active");
    expect(document.querySelector('input[name="expectedVersion"]')).toHaveValue("4");
  });

  it("counts only active members and exposes authorized schedule and completion controls", () => {
    const members: CohortMember[] = [
      { userId: "learner-1", displayName: "Ada Learner", role: "learner", status: "active", joinedAt: timestamp, completedTaskCount: 2 },
      { userId: "trainer-1", displayName: "Toni Trainer", role: "trainer", status: "active", joinedAt: timestamp, completedTaskCount: 0 },
      { userId: "learner-removed", displayName: "Removed learner", role: "learner", status: "removed", joinedAt: timestamp, removedAt: timestamp, completedTaskCount: 0 },
    ];
    render(
      <CohortWorkspace
        changeScheduleAction={vi.fn()}
        changeStateAction={vi.fn()}
        cohort={{
          ...baseCohort,
          state: "active",
          progressionMode: "learning_path",
          members,
          taskActivations: [{ taskId: "task-1", activateAt: timestamp, updatedAt: timestamp, updatedBy: "trainer-1" }],
        }}
        displayName="July cohort"
        formatDateTime={() => "18 Jul 2026, 10:00"}
        labels={cohortLabels}
      />,
    );

    expect(screen.getByText("Active")).toHaveClass("badge--success");
    expect(screen.getByText("Learning path")).toBeInTheDocument();
    const facts = screen.getByText("Progression").closest("dl");
    expect(facts).not.toBeNull();
    expect(within(facts as HTMLElement).getByText("Learners").nextElementSibling).toHaveTextContent("1");
    expect(within(facts as HTMLElement).getByText("Trainers").nextElementSibling).toHaveTextContent("1");
    expect(screen.getByText("Ada Learner")).toBeInTheDocument();
    expect(screen.queryByText("Removed learner")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Complete cohort" })).toHaveAttribute("value", "completed");
    expect(screen.getByLabelText("Activate at")).toHaveValue("2026-07-18T08:00");
    expect(screen.getByText("18 Jul 2026, 10:00")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save date" })).toBeEnabled();
  });

  it("renders a completed cohort as terminal and neutral", () => {
    render(
      <CohortWorkspace
        changeScheduleAction={vi.fn()}
        changeStateAction={vi.fn()}
        cohort={{ ...baseCohort, state: "completed" }}
        displayName="July cohort"
        formatDateTime={String}
        labels={cohortLabels}
      />,
    );
    expect(screen.getByText("Completed")).toHaveClass("badge");
    expect(screen.queryByRole("button", { name: "Start cohort" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Complete cohort" })).not.toBeInTheDocument();
  });
});
