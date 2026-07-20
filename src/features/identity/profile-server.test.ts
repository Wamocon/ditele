import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/shared/database/server", () => ({ createServerClient: vi.fn() }));

import { createServerClient } from "@/shared/database/server";
import type { Principal } from "@/shared/auth/types";

import { readLearnerProfile } from "./profile-server";

const principal: Principal = {
  userId: "01980a00-0000-7000-8000-000000000001",
  sessionId: "session",
  organizationId: "01980a10-0000-7000-8000-000000000001",
  primaryRole: "learner",
  roles: ["learner"],
  permissions: [],
  cohortIds: [],
};

describe("readLearnerProfile", () => {
  beforeEach(() => vi.mocked(createServerClient).mockReset());

  it("denies the read before creating a client when self-read permission is absent", async () => {
    await expect(readLearnerProfile(principal)).rejects.toMatchObject({
      code: "AUTHORIZATION_DENIED",
    });
    expect(createServerClient).not.toHaveBeenCalled();
  });

  it("denies non-learners even if they hold a self-read permission", async () => {
    await expect(readLearnerProfile({
      ...principal,
      primaryRole: "trainer",
      roles: ["trainer"],
      permissions: ["profile.read_self"],
    })).rejects.toMatchObject({ code: "AUTHORIZATION_DENIED" });
    expect(createServerClient).not.toHaveBeenCalled();
  });
});
