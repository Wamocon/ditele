import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { adminContentCopy } from "./copy";
import type { AdminCourseListItem, ContentVersionProjection } from "./model";
import {
  ContentVersionDetailView,
  ContentVersionPreviewView,
  CourseListView,
} from "./views";

const ids = {
  course: "01980a20-0000-7000-8000-000000000001",
  version: "01980a22-0000-7000-8000-000000000001",
  stage: "01980a23-0000-7000-8000-000000000001",
  task: "01980a26-0000-7000-8000-000000000001",
} as const;

const course: AdminCourseListItem = {
  id: ids.course,
  slug: "practical-software-testing",
  state: "active",
  title: "Practical testing",
  summary: "Practice with evidence.",
  resolvedLocale: "en",
  usedFallback: false,
  completeLocales: ["en", "de"],
  estimatedMinutes: 480,
  updatedAt: "2026-07-18T10:00:00.000Z",
  versionCount: 1,
  latestVersion: { id: ids.version, versionNumber: 1, state: "published" },
  stageCount: 1,
  taskCount: 1,
};

const projection: ContentVersionProjection = {
  courseId: ids.course,
  courseTitle: "Practical testing",
  courseDescription: "Practice a testing workflow.",
  version: {
    id: ids.version,
    versionNumber: 1,
    state: "published",
    changeSummary: "First release",
    rowVersion: 1,
    updatedAt: "2026-07-18T10:00:00.000Z",
    publishedAt: "2026-07-18T10:00:00.000Z",
    reviewCount: 1,
    latestReview: {
      decision: "approved",
      comment: "Ready",
      createdAt: "2026-07-18T10:00:00.000Z",
      current: false,
    },
  },
  locale: "en",
  resolvedLocale: "en",
  usedFallback: false,
  role: "learner",
  stages: [{
    id: ids.stage,
    position: 0,
    title: "Analysis",
    description: "Analyze the target.",
    resolvedLocale: "en",
    tasks: [{
      id: ids.task,
      position: 0,
      title: "Login flow",
      instructions: "Design risk-based tests.",
      resolvedLocale: "en",
      kind: "practical",
      targetUrl: "https://example.invalid/target",
      expectedMinutes: 45,
      hasHint: true,
      assessmentQuestion: "Which technique applies?",
      assessmentOptions: ["Boundary analysis", "State transition"],
    }],
  }],
  issues: [],
};

describe("admin content views", () => {
  it("renders an explicit empty course state and honest mutation limitation", () => {
    render(<CourseListView courses={[]} labels={adminContentCopy.en} locale="en" page={1} total={0} totalPages={1} />);
    expect(screen.getByRole("heading", { name: "No courses available" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Content editing remains read-only" })).toBeInTheDocument();
  });

  it("renders course metrics, translation completeness, and a stable detail link", () => {
    render(<CourseListView courses={[course]} labels={adminContentCopy.en} locale="en" page={1} total={1} totalPages={1} />);
    expect(screen.getByRole("heading", { name: "Practical testing" })).toBeInTheDocument();
    expect(screen.getByText("RU · Incomplete")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open course" })).toHaveAttribute("href", `/en/admin/courses/${ids.course}`);
  });

  it("keeps course pagination in the localized URL", () => {
    render(<CourseListView courses={[course]} labels={adminContentCopy.en} locale="en" page={1} total={40} totalPages={2} />);
    expect(screen.getByRole("link", { name: "Next page" })).toHaveAttribute("href", "/en/admin/courses?page=2");
    expect(screen.getByText("Previous page")).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByText("Page 1 of 2")).toHaveAttribute("aria-current", "page");
  });

  it("renders role preview navigation and only learner-safe assessment labels", () => {
    render(<ContentVersionPreviewView labels={adminContentCopy.en} locale="en" projection={projection} />);
    expect(screen.getByRole("heading", { name: "Practical testing" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open testing target" })).toHaveAttribute("rel", "noreferrer");
    expect(screen.getByText("Boundary analysis")).toBeInTheDocument();
    expect(screen.getByText(/Which technique applies/)).toBeInTheDocument();
    expect(screen.queryByText("Trainer-only seed model answer.")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Learner" })).toHaveAttribute("aria-current", "page");
  });

  it("surfaces readiness issues in version detail", () => {
    render(
      <ContentVersionDetailView
        labels={adminContentCopy.en}
        locale="en"
        projection={{
          ...projection,
          issues: [{ code: "missing_task", path: "stages.0.tasks" }],
        }}
      />,
    );
    expect(screen.getByText("1 issue requires attention.")).toBeInTheDocument();
    expect(screen.getByText("stages.0.tasks")).toBeInTheDocument();
    expect(screen.queryAllByRole("link", { name: "Preview" })).toHaveLength(0);
    expect(screen.getByRole("link", { name: "Learner" })).toHaveAttribute("href", expect.stringContaining("role=learner"));
  });
});
