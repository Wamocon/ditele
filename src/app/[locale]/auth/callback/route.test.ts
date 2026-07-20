import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const {
  createServerClientMock,
  getServerEnvironmentMock,
  requirePrincipalMock,
} = vi.hoisted(() => ({
  createServerClientMock: vi.fn(),
  getServerEnvironmentMock: vi.fn(),
  requirePrincipalMock: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/shared/database/server", () => ({
  createServerClient: createServerClientMock,
}));
vi.mock("@/shared/config/server-env", () => ({
  getServerEnvironment: getServerEnvironmentMock,
}));
vi.mock("@/shared/auth/principal", () => ({
  requirePrincipal: requirePrincipalMock,
}));

import { AuthenticationRequiredError } from "@/shared/auth/errors";
import type { AppRole, Principal } from "@/shared/auth/types";

import { GET } from "./route";

function principal(roles: AppRole[]): Principal {
  return {
    userId: "user-1",
    sessionId: "session-1",
    organizationId: roles.includes("organization_admin") ? "org-1" : null,
    primaryRole: roles[0] ?? "support",
    roles,
    permissions: [],
    cohortIds: [],
  };
}

function authClient(error: unknown = null) {
  return {
    auth: {
      exchangeCodeForSession: vi.fn(async () => ({
        data: {
          session: {
            user: { user_metadata: { role: "organization_admin" } },
          },
        },
        error,
      })),
    },
  };
}

function callbackRequest(path: string): NextRequest {
  return new NextRequest(`https://edge-internal.example.test${path}`);
}

async function callCallback(path: string, locale = "en") {
  return GET(callbackRequest(path), {
    params: Promise.resolve({ locale }),
  });
}

describe("authentication callback", () => {
  beforeEach(() => {
    createServerClientMock.mockReset();
    getServerEnvironmentMock.mockReset();
    getServerEnvironmentMock.mockReturnValue({
      DITELE_APP_ORIGIN: "https://app.example.test",
    });
    requirePrincipalMock.mockReset();
  });

  it("uses the server principal after a successful code exchange", async () => {
    const client = authClient();
    createServerClientMock.mockResolvedValue(client);
    requirePrincipalMock.mockResolvedValue(principal(["trainer"]));

    const response = await callCallback("/de/auth/callback?code=valid", "de");

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://app.example.test/de/trainer",
    );
    expect(client.auth.exchangeCodeForSession).toHaveBeenCalledWith("valid");
    expect(requirePrincipalMock).toHaveBeenCalledTimes(1);
  });

  it("keeps recovery redirects on the configured canonical host", async () => {
    createServerClientMock.mockResolvedValue(authClient());

    const response = await callCallback(
      "/en/auth/callback?code=valid&next=%2Fen%2Fauth%2Fupdate-password",
    );

    expect(response.headers.get("location")).toBe(
      "https://app.example.test/en/auth/update-password",
    );
    expect(response.headers.get("location")).not.toContain(
      "edge-internal.example.test",
    );
  });

  it("preserves a safe explicit next without resolving a role", async () => {
    createServerClientMock.mockResolvedValue(authClient());

    const response = await callCallback(
      "/en/auth/callback?code=valid&next=%2Fen%2Flearn%2Fquestions%3Fopen%3D1",
    );

    expect(response.headers.get("location")).toBe(
      "https://app.example.test/en/learn/questions?open=1",
    );
    expect(requirePrincipalMock).not.toHaveBeenCalled();
  });

  it("rejects an unsafe next and uses principal precedence", async () => {
    createServerClientMock.mockResolvedValue(authClient());
    requirePrincipalMock.mockResolvedValue(
      principal(["learner", "trainer", "organization_admin", "admin"]),
    );

    const response = await callCallback(
      "/en/auth/callback?code=valid&next=https%3A%2F%2Fexample.com%2Fadmin",
    );

    expect(response.headers.get("location")).toBe(
      "https://app.example.test/en/admin",
    );
    expect(requirePrincipalMock).toHaveBeenCalledTimes(1);
  });

  it("never trusts the exchanged session user metadata for a destination", async () => {
    createServerClientMock.mockResolvedValue(authClient());
    requirePrincipalMock.mockResolvedValue(principal(["learner"]));

    const response = await callCallback("/en/auth/callback?code=valid");

    expect(response.headers.get("location")).toBe(
      "https://app.example.test/en/learn",
    );
  });

  it("returns to login when code exchange fails", async () => {
    createServerClientMock.mockResolvedValue(
      authClient(new Error("expired code")),
    );

    const response = await callCallback("/ru/auth/callback?code=expired", "ru");

    expect(response.headers.get("location")).toBe(
      "https://app.example.test/ru/auth/login?error=invalid",
    );
    expect(requirePrincipalMock).not.toHaveBeenCalled();
  });

  it("fails closed when the exchanged session has no active principal", async () => {
    createServerClientMock.mockResolvedValue(authClient());
    requirePrincipalMock.mockRejectedValue(new AuthenticationRequiredError());

    const response = await callCallback("/en/auth/callback?code=valid");

    expect(response.headers.get("location")).toBe(
      "https://app.example.test/en/auth/login?error=invalid",
    );
  });

  it("rejects missing codes and invalid locales before role resolution", async () => {
    const missingCode = await callCallback("/en/auth/callback");
    expect(missingCode.headers.get("location")).toBe(
      "https://app.example.test/en/auth/login?error=invalid",
    );

    const invalidLocale = await callCallback(
      "/fr/auth/callback?code=valid",
      "fr",
    );
    expect(invalidLocale.headers.get("location")).toBe(
      "https://app.example.test/en/auth/login?error=invalid",
    );
    expect(createServerClientMock).not.toHaveBeenCalled();
    expect(requirePrincipalMock).not.toHaveBeenCalled();
  });
});
