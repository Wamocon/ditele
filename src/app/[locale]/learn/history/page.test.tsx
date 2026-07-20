import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  canRenderProtectedPage: vi.fn(),
  getPrincipal: vi.fn(),
  readLearnerHistory: vi.fn(),
  resolveLearnerHistorySnapshot: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));

vi.mock("next/navigation", () => ({ notFound: mocks.notFound }));
vi.mock("@/app/[locale]/_data/principal", () => ({
  canRenderProtectedPage: mocks.canRenderProtectedPage,
  getPrincipal: mocks.getPrincipal,
}));
vi.mock("@/features/learning/server/learner-history-data", () => ({
  readLearnerHistory: mocks.readLearnerHistory,
  resolveLearnerHistorySnapshot: mocks.resolveLearnerHistorySnapshot,
}));

import type { Principal } from "@/shared/auth/types";

import LearnerHistoryPage from "./page";

const principal: Principal = {
  userId: "01980a00-0000-7000-8000-000000000001",
  sessionId: "session",
  organizationId: "01980a10-0000-7000-8000-000000000001",
  primaryRole: "learner",
  roles: ["learner"],
  permissions: ["cohort.read", "learning.submit"],
  cohortIds: ["01980a30-0000-7000-8000-000000000001"],
};

describe("LearnerHistoryPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.canRenderProtectedPage.mockResolvedValue(true);
    mocks.getPrincipal.mockResolvedValue(principal);
    mocks.resolveLearnerHistorySnapshot.mockImplementation(
      (value?: string) => value ?? "2026-07-18T12:00:00.000Z",
    );
    mocks.readLearnerHistory.mockResolvedValue({
      items: [{
        id: "question_answered:01980a37-0000-7000-8000-000000000001",
        kind: "question_answered",
        occurredAt: "2026-07-17T11:00:00.000Z",
        courseTitle: "Practical testing",
        taskTitle: "Analyze login",
        ordinal: null,
        target: {
          type: "question",
          id: "01980a37-0000-7000-8000-000000000001",
        },
      }],
      page: 1,
      hasPreviousPage: false,
      hasNextPage: false,
      snapshotAt: "2026-07-18T12:00:00.000Z",
    });
  });

  it("role-gates before resolving the principal or reading history", async () => {
    mocks.canRenderProtectedPage.mockResolvedValue(false);
    const result = await LearnerHistoryPage({
      params: Promise.resolve({ locale: "en" }),
      searchParams: Promise.resolve({}),
    });

    expect(result).toBeNull();
    expect(mocks.canRenderProtectedPage).toHaveBeenCalledWith(
      "en",
      "/en/learn/history",
      ["learner"],
    );
    expect(mocks.getPrincipal).not.toHaveBeenCalled();
    expect(mocks.readLearnerHistory).not.toHaveBeenCalled();
  });

  it("renders a localized forbidden state before data access", async () => {
    mocks.getPrincipal.mockResolvedValue({
      ...principal,
      permissions: ["learning.submit"],
    });
    render(await LearnerHistoryPage({
      params: Promise.resolve({ locale: "de" }),
      searchParams: Promise.resolve({}),
    }));

    expect(
      screen.getByRole("heading", { name: "Kein Zugriff auf den Lernverlauf" }),
    ).toBeInTheDocument();
    expect(mocks.readLearnerHistory).not.toHaveBeenCalled();
  });

  it("renders localized real events and routes only to authorized related surfaces", async () => {
    render(await LearnerHistoryPage({
      params: Promise.resolve({ locale: "en" }),
      searchParams: Promise.resolve({}),
    }));

    expect(
      screen.getByRole("heading", { name: "Learning history" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Question answered")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Open related record" }),
    ).toHaveAttribute(
      "href",
      "/en/learn/questions/01980a37-0000-7000-8000-000000000001",
    );
    expect(mocks.readLearnerHistory).toHaveBeenCalledWith(
      principal,
      "en",
      1,
      "2026-07-18T12:00:00.000Z",
    );
  });

  it("rejects invalid locale, arrays, out-of-range pages, and page two without a snapshot", async () => {
    await expect(LearnerHistoryPage({
      params: Promise.resolve({ locale: "fr" }),
      searchParams: Promise.resolve({}),
    })).rejects.toThrow("NEXT_NOT_FOUND");
    await expect(LearnerHistoryPage({
      params: Promise.resolve({ locale: "en" }),
      searchParams: Promise.resolve({ page: ["1", "2"] }),
    })).rejects.toThrow("NEXT_NOT_FOUND");
    await expect(LearnerHistoryPage({
      params: Promise.resolve({ locale: "en" }),
      searchParams: Promise.resolve({ page: "26" }),
    })).rejects.toThrow("NEXT_NOT_FOUND");
    await expect(LearnerHistoryPage({
      params: Promise.resolve({ locale: "en" }),
      searchParams: Promise.resolve({ page: "2" }),
    })).rejects.toThrow("NEXT_NOT_FOUND");
    expect(mocks.readLearnerHistory).not.toHaveBeenCalled();
  });

  it("rejects an empty non-first page as stale or out of range", async () => {
    mocks.readLearnerHistory.mockResolvedValue({
      items: [],
      page: 2,
      hasPreviousPage: true,
      hasNextPage: false,
      snapshotAt: "2026-07-18T12:00:00.000Z",
    });

    await expect(LearnerHistoryPage({
      params: Promise.resolve({ locale: "en" }),
      searchParams: Promise.resolve({
        page: "2",
        snapshot: "2026-07-18T12:00:00.000Z",
      }),
    })).rejects.toThrow("NEXT_NOT_FOUND");
  });
});
