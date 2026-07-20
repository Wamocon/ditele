import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/shared/database/server", () => ({ createServerClient: vi.fn() }));

import { createServerClient } from "@/shared/database/server";
import type { Principal } from "@/shared/auth/types";

import {
  readAdminGroups,
  readAdminOrganizationSettings,
  readAdminUsers,
} from "./management-read-data";

const principal: Principal = {
  userId: "01980a00-0000-7000-8000-000000000004",
  sessionId: "session",
  organizationId: "01980a10-0000-7000-8000-000000000001",
  primaryRole: "organization_admin",
  roles: ["organization_admin"],
  permissions: [],
  cohortIds: [],
};

describe("administration management data authorization", () => {
  beforeEach(() => vi.mocked(createServerClient).mockReset());

  it("denies group reads before creating a database client", async () => {
    await expect(readAdminGroups(principal, "en", 1)).rejects.toMatchObject({ code: "AUTHORIZATION_DENIED" });
    expect(createServerClient).not.toHaveBeenCalled();
  });

  it("denies user reads before creating a database client", async () => {
    await expect(readAdminUsers(principal, 1)).rejects.toMatchObject({ code: "AUTHORIZATION_DENIED" });
    expect(createServerClient).not.toHaveBeenCalled();
  });

  it("denies settings reads without an active tenant scope", async () => {
    await expect(readAdminOrganizationSettings({
      ...principal,
      organizationId: null,
      permissions: ["organization.manage"],
    }, "en")).rejects.toMatchObject({ code: "AUTHORIZATION_DENIED" });
    expect(createServerClient).not.toHaveBeenCalled();
  });
});
