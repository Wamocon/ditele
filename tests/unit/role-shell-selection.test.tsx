import { createElement, isValidElement } from "react";

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const {
  createServerClientMock,
  getMessagesMock,
  getPrincipalMock,
} = vi.hoisted(() => ({
  createServerClientMock: vi.fn(),
  getMessagesMock: vi.fn(),
  getPrincipalMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
}));

vi.mock("@/app/[locale]/auth/actions", () => ({
  signOutAction: vi.fn(),
}));

vi.mock("@/app/[locale]/_data/principal", () => ({
  getPrincipal: getPrincipalMock,
}));

vi.mock("@/shared/database/server", () => ({
  createServerClient: createServerClientMock,
}));

vi.mock("@/shared/i18n/get-messages", async (importOriginal) => {
  const original = await importOriginal<
    typeof import("@/shared/i18n/get-messages")
  >();
  return {
    ...original,
    getMessages: getMessagesMock,
  };
});

import {
  RoleShell,
  resolveShellRole,
} from "@/app/[locale]/_components/role-shell";
import type { AppRole, Principal } from "@/shared/auth/types";
import deMessages from "@/shared/i18n/messages/de.json";
import enMessages from "@/shared/i18n/messages/en.json";
import ruMessages from "@/shared/i18n/messages/ru.json";
import type { ShellRole } from "@/shared/ui/app-shell";

function principalWithRoles(roles: readonly [AppRole, ...AppRole[]]): Principal {
  return {
    userId: "01980a20-0000-7000-8000-000000000001",
    sessionId: "session-role-shell",
    organizationId: null,
    primaryRole: roles[0],
    roles,
    permissions: [],
    cohortIds: [],
  };
}

function renderedShellRole(element: unknown): ShellRole {
  if (!isValidElement<{ role: ShellRole }>(element)) {
    throw new Error("RoleShell did not return a React element");
  }
  return element.props.role;
}

beforeEach(() => {
  vi.clearAllMocks();

  const profileQuery = {
    select: vi.fn(),
    eq: vi.fn(),
    maybeSingle: vi.fn().mockResolvedValue({
      data: { display_name: "Content Manager" },
    }),
  };
  profileQuery.select.mockReturnValue(profileQuery);
  profileQuery.eq.mockReturnValue(profileQuery);
  createServerClientMock.mockResolvedValue({
    from: vi.fn().mockReturnValue(profileQuery),
  });
  getMessagesMock.mockResolvedValue(enMessages);
});

describe("RoleShell role selection", () => {
  it("provides the approved localized content-administrator role labels", () => {
    expect(enMessages.roles.contentAdmin).toBe("Content administrator");
    expect(deMessages.roles.contentAdmin).toBe("Inhaltsadministration");
    expect(ruMessages.roles.contentAdmin).toBe("Администратор контента");
  });

  it("derives the restricted content-administrator shell for a content-only principal", async () => {
    getPrincipalMock.mockResolvedValue(principalWithRoles(["content_admin"]));

    const element = await RoleShell({
      activeHref: "/en/admin/courses",
      allowedRoles: ["admin", "content_admin"],
      breadcrumb: "Administration",
      children: createElement("p", null, "Course editor"),
      locale: "en",
      shellRole: "admin",
    });

    expect(renderedShellRole(element)).toBe("contentAdmin");
  });

  it("keeps the platform-administrator shell for a multi-role principal that includes admin", async () => {
    getPrincipalMock.mockResolvedValue(
      principalWithRoles(["content_admin", "admin"]),
    );

    const element = await RoleShell({
      activeHref: "/en/admin",
      allowedRoles: ["admin", "content_admin"],
      breadcrumb: "Administration",
      children: createElement("p", null, "Admin overview"),
      locale: "en",
      shellRole: "admin",
    });

    expect(renderedShellRole(element)).toBe("admin");
  });

  it("does not reinterpret non-admin route perspectives", () => {
    expect(resolveShellRole("trainer", ["content_admin"])).toBe("trainer");
    expect(resolveShellRole("organizationAdmin", ["content_admin"])).toBe(
      "organizationAdmin",
    );
  });
});
