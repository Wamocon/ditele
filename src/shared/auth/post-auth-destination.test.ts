import { beforeEach, describe, expect, it, vi } from "vitest";

const { requirePrincipalMock } = vi.hoisted(() => ({
  requirePrincipalMock: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("./principal", () => ({ requirePrincipal: requirePrincipalMock }));

import {
  principalLandingDestination,
  resolvePostAuthenticationDestination,
  safePostAuthenticationNext,
} from "./post-auth-destination";
import type { AppRole, Principal } from "./types";

function principal(roles: AppRole[]): Principal {
  return {
    userId: "user-1",
    sessionId: "session-1",
    organizationId: null,
    primaryRole: roles[0] ?? "support",
    roles,
    permissions: [],
    cohortIds: [],
  };
}

describe("post-authentication destination", () => {
  beforeEach(() => {
    requirePrincipalMock.mockReset();
  });

  it.each([
    ["admin", "/de/admin"],
    ["content_admin", "/de/admin/courses"],
    ["organization_admin", "/de/organization"],
    ["trainer", "/de/trainer"],
    ["learner", "/de/learn"],
    ["support", "/de"],
    ["integration_admin", "/de"],
    ["dpo", "/de"],
  ] as const)("maps %s to its implemented workspace", (role, expected) => {
    expect(principalLandingDestination("de", principal([role]))).toBe(expected);
  });

  it.each([
    [
      ["learner", "content_admin", "admin"],
      "/en/admin",
    ],
    [
      ["learner", "trainer", "organization_admin", "content_admin"],
      "/en/admin/courses",
    ],
    [
      ["learner", "trainer", "organization_admin"],
      "/en/organization",
    ],
    [["learner", "trainer"], "/en/trainer"],
  ] as const)("uses explicit precedence for %j", (roles, expected) => {
    expect(
      principalLandingDestination("en", principal([...roles])),
    ).toBe(expected);
  });

  it.each([
    ["/en", "/en"],
    ["/en/learn", "/en/learn"],
    ["/en/admin/courses?state=draft#editor", "/en/admin/courses?state=draft#editor"],
    ["/en/auth/update-password", "/en/auth/update-password"],
  ])("preserves the safe same-locale next value %s", (value, expected) => {
    expect(safePostAuthenticationNext("en", value)).toBe(expected);
  });

  it.each([
    null,
    undefined,
    "",
    "https://example.com/en/learn",
    "//example.com/en/learn",
    "/de/learn",
    "/en//example.com",
    "/en/../de/admin",
    "/en/%2f%2fexample.com",
    "/en/%252f%252fexample.com",
    "/en/%252e%252e/de/admin",
    "/en/%00hidden",
    "/en\\@example.com",
    "javascript:alert(1)",
  ])("rejects an unsafe or cross-locale next value: %s", (value) => {
    expect(safePostAuthenticationNext("en", value)).toBeNull();
  });

  it("does not resolve a principal when a safe explicit next is present", async () => {
    await expect(
      resolvePostAuthenticationDestination("en", "/en/admin/courses"),
    ).resolves.toBe("/en/admin/courses");
    expect(requirePrincipalMock).not.toHaveBeenCalled();
  });

  it("uses only the server-resolved principal when next is absent or invalid", async () => {
    requirePrincipalMock.mockResolvedValue(
      principal(["learner", "trainer", "organization_admin"]),
    );

    await expect(
      resolvePostAuthenticationDestination("ru", "https://example.com/admin"),
    ).resolves.toBe("/ru/organization");
    expect(requirePrincipalMock).toHaveBeenCalledTimes(1);
  });
});
