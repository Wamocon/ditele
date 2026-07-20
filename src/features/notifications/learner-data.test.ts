import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/shared/database/server", () => ({ createServerClient: vi.fn() }));

import { createServerClient } from "@/shared/database/server";
import type { Principal } from "@/shared/auth/types";

import {
  readLearnerNotificationCenter,
  resolveLearnerNotificationSnapshot,
} from "./learner-data";

const trainer: Principal = {
  userId: "01980a00-0000-7000-8000-000000000002",
  sessionId: "session",
  organizationId: "01980a10-0000-7000-8000-000000000001",
  primaryRole: "trainer",
  roles: ["trainer"],
  permissions: [],
  cohortIds: [],
};

describe("readLearnerNotificationCenter", () => {
  beforeEach(() => vi.mocked(createServerClient).mockReset());

  it("rejects non-learners before opening a database client", async () => {
    await expect(readLearnerNotificationCenter(trainer, 1)).rejects.toMatchObject({
      code: "AUTHORIZATION_DENIED",
    });
    expect(createServerClient).not.toHaveBeenCalled();
  });

  it("rejects invalid pagination before opening a database client", async () => {
    await expect(readLearnerNotificationCenter({
      ...trainer,
      primaryRole: "learner",
      roles: ["learner"],
    }, 0)).rejects.toThrow();
    expect(createServerClient).not.toHaveBeenCalled();
  });

  it("canonicalizes a stable snapshot and rejects invalid or materially future boundaries", () => {
    const now = new Date("2026-07-18T12:00:00.000Z");
    expect(resolveLearnerNotificationSnapshot(undefined, now))
      .toBe("2026-07-18T12:00:00.000Z");
    expect(resolveLearnerNotificationSnapshot(
      "2026-07-18T11:00:00+00:00",
      now,
    )).toBe("2026-07-18T11:00:00.000Z");
    expect(() => resolveLearnerNotificationSnapshot("not-a-date", now))
      .toThrow();
    expect(() => resolveLearnerNotificationSnapshot(
      "2026-07-18T12:06:00.000Z",
      now,
    )).toThrow("notifications.snapshot_is_in_the_future");
  });
});
