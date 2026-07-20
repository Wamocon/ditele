import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { AdminVersionSummary, ContentArchiveImpactResult } from "../../../model";
import { ContentLifecyclePanel } from "./lifecycle-panel";

const ids = {
  course: "01980a20-0000-7000-8000-000000000001",
  version: "01980a22-0000-7000-8000-000000000001",
};

const actions = {
  archive: vi.fn(async () => ({ status: "idle" as const, message: "" })),
  publish: vi.fn(async () => ({ status: "idle" as const, message: "" })),
  review: vi.fn(async () => ({ status: "idle" as const, message: "" })),
  submit: vi.fn(async () => ({ status: "idle" as const, message: "" })),
};

const keys = {
  archive: "content-archive:stable-0001",
  publish: "content-publish:stable-0001",
  review: "content-review:stable-0001",
  submit: "content-submit:stable-0001",
};

function version(
  state: AdminVersionSummary["state"],
  latestReview: AdminVersionSummary["latestReview"] = null,
): AdminVersionSummary {
  return {
    id: ids.version,
    versionNumber: 2,
    state,
    changeSummary: "Safer task instructions",
    rowVersion: 4,
    updatedAt: "2026-07-18T10:00:00.000Z",
    publishedAt: state === "published" || state === "archived"
      ? "2026-07-18T10:00:00.000Z"
      : null,
    reviewCount: latestReview ? 1 : 0,
    latestReview,
  };
}

const impact: ContentArchiveImpactResult = {
  status: "ready",
  impact: {
    content_version_id: ids.version,
    course_id: ids.course,
    row_version: 4,
    snapshot_sha256: "b".repeat(64),
    task_count: 3,
    task_schedule_count: 2,
    attempt_count: 7,
    open_attempt_count: 1,
    submission_count: 5,
    fingerprint: "a".repeat(64),
  },
};

function renderPanel({
  canManage = true,
  canPublish = true,
  contentVersion = version("draft"),
  currentImpact = null,
  notice = null,
}: {
  canManage?: boolean;
  canPublish?: boolean;
  contentVersion?: AdminVersionSummary;
  currentImpact?: ContentArchiveImpactResult | null;
  notice?: "stale" | "submitted" | null;
} = {}) {
  return render(
    <ContentLifecyclePanel
      actions={actions}
      canManage={canManage}
      canPublish={canPublish}
      courseId={ids.course}
      impact={currentImpact}
      keys={keys}
      locale="en"
      notice={notice}
      version={contentVersion}
    />,
  );
}

describe("content lifecycle panel", () => {
  it("offers only the audited review submission command for an authorized draft", () => {
    renderPanel();
    expect(screen.getByRole("heading", { name: "Submit for review" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Submit for review" })).toBeInTheDocument();
    expect(document.querySelector('input[name="expectedVersion"]')).toHaveValue("4");
    expect(document.querySelector('input[name="idempotencyKey"]')).toHaveValue(keys.submit);
    expect(screen.queryByRole("button", { name: "Publish version" })).not.toBeInTheDocument();
  });

  it("requires a decision and comment and exposes publish only for the current approval", () => {
    renderPanel({
      contentVersion: version("in_review", {
        decision: "approved",
        comment: "The complete graph is ready.",
        createdAt: "2026-07-18T10:00:00.000Z",
        current: true,
      }),
    });
    expect(screen.getByRole("combobox", { name: "Decision" })).toBeRequired();
    expect(screen.getByRole("textbox", { name: "Review comment" })).toBeRequired();
    expect(screen.getByRole("button", { name: "Record decision" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Publish version" })).toBeInTheDocument();
    expect(screen.getByText(/This approval matches the current immutable review graph\./)).toBeInTheDocument();
  });

  it("withholds publication until the latest review is a current approval", () => {
    renderPanel({
      contentVersion: version("in_review", {
        decision: "approved",
        comment: "Approval belongs to the previous revision.",
        createdAt: "2026-07-18T10:00:00.000Z",
        current: false,
      }),
    });
    expect(screen.getByRole("heading", { name: "Current approval required" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Publish version" })).not.toBeInTheDocument();
  });

  it("shows exact archive impact and requires reason plus explicit confirmation", () => {
    renderPanel({ contentVersion: version("published"), currentImpact: impact });
    expect(screen.getByRole("heading", { name: "Current archive impact" })).toBeInTheDocument();
    expect(screen.getByText("a".repeat(64))).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Archive reason" })).toBeRequired();
    expect(screen.getByRole("checkbox", { name: "I reviewed these exact impact counts and fingerprint." })).toBeRequired();
    expect(screen.getByRole("button", { name: "Archive version" })).toBeInTheDocument();
    expect(screen.getByText("7")).toBeInTheDocument();
    expect(screen.getByText("1")).toBeInTheDocument();
  });

  it("fails closed when impact cannot be verified and when permission is absent", () => {
    const { rerender } = renderPanel({
      contentVersion: version("published"),
      currentImpact: { status: "failed" },
    });
    expect(screen.getByRole("heading", { name: "Archive impact unavailable" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Archive version" })).not.toBeInTheDocument();

    rerender(
      <ContentLifecyclePanel
        actions={actions}
        canManage
        canPublish={false}
        courseId={ids.course}
        impact={null}
        keys={keys}
        locale="en"
        notice={null}
        version={version("in_review")}
      />,
    );
    expect(screen.getByRole("heading", { name: "No lifecycle command is available" })).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("renders server-owned stale and archived notices without mutation controls", () => {
    renderPanel({ contentVersion: version("archived"), notice: "stale" });
    expect(screen.getByRole("heading", { name: "Version changed" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Archived version" })).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
