import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const {
  consumeAuthenticationRateLimitMock,
  createServerClientMock,
  redirectMock,
  requirePrincipalMock,
} =
  vi.hoisted(() => ({
    consumeAuthenticationRateLimitMock: vi.fn(),
    createServerClientMock: vi.fn(),
    redirectMock: vi.fn(),
    requirePrincipalMock: vi.fn(),
  }));

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ redirect: redirectMock }));
vi.mock("@/shared/database/server", () => ({
  createServerClient: createServerClientMock,
}));
vi.mock("@/shared/auth/principal", () => ({
  requirePrincipal: requirePrincipalMock,
}));
vi.mock("@/shared/auth/rate-limit.server", () => ({
  consumeAuthenticationRateLimit: consumeAuthenticationRateLimitMock,
}));

import { AuthenticationRequiredError } from "@/shared/auth/errors";
import type { AppRole, Principal } from "@/shared/auth/types";

import {
  registerAction,
  requestPasswordResetAction,
  signInAction,
  signOutAction,
  updatePasswordAction,
} from "./actions";

const previousOrigin = process.env.DITELE_APP_ORIGIN;

function formData(values: Record<string, string>): FormData {
  const data = new FormData();
  for (const [name, value] of Object.entries(values)) data.set(name, value);
  return data;
}

function signInForm(next?: string): FormData {
  return formData({
    locale: "en",
    email: "learner@example.test",
    password: "123123123",
    ...(next === undefined ? {} : { next }),
  });
}

function registrationForm(next?: string): FormData {
  return formData({
    locale: "en",
    name: "Ada Learner",
    email: "learner@example.test",
    password: "Correct-Password-123!",
    ...(next === undefined ? {} : { next }),
  });
}

function passwordResetForm(email = "learner@example.test"): FormData {
  return formData({ locale: "en", email });
}

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

function authClient({
  signInError = null,
  signUpError = null,
  signUpSession = null,
  resetError = null,
  updateError = null,
  signOutError = null,
}: {
  signInError?: unknown;
  signUpError?: unknown;
  signUpSession?: object | null;
  resetError?: unknown;
  updateError?: unknown;
  signOutError?: unknown;
} = {}) {
  return {
    auth: {
      signInWithPassword: vi.fn(async () => ({
        data: {
          user: { user_metadata: { role: "admin" } },
          session: signInError ? null : {},
        },
        error: signInError,
      })),
      signUp: vi.fn(async () => ({
        data: {
          user: { user_metadata: { role: "admin" } },
          session: signUpSession,
        },
        error: signUpError,
      })),
      resetPasswordForEmail: vi.fn(async () => ({
        data: {},
        error: resetError,
      })),
      updateUser: vi.fn(async () => ({ data: {}, error: updateError })),
      signOut: vi.fn(async () => ({ error: signOutError })),
    },
  };
}

async function expectRedirect(
  operation: Promise<void>,
  destination: string,
): Promise<void> {
  await expect(operation).rejects.toThrow(`REDIRECT:${destination}`);
  expect(redirectMock).toHaveBeenLastCalledWith(destination);
}

describe("authentication actions", () => {
  beforeEach(() => {
    process.env.DITELE_APP_ORIGIN = "https://app.example.test";
    createServerClientMock.mockReset();
    consumeAuthenticationRateLimitMock.mockReset();
    consumeAuthenticationRateLimitMock.mockResolvedValue(true);
    redirectMock.mockReset();
    requirePrincipalMock.mockReset();
    redirectMock.mockImplementation((destination: string) => {
      throw new Error(`REDIRECT:${destination}`);
    });
  });

  afterAll(() => {
    if (previousOrigin === undefined) delete process.env.DITELE_APP_ORIGIN;
    else process.env.DITELE_APP_ORIGIN = previousOrigin;
  });

  it("lands password sign-in from the server principal, never auth metadata", async () => {
    const client = authClient();
    createServerClientMock.mockResolvedValue(client);
    requirePrincipalMock.mockResolvedValue(principal(["learner"]));

    await expectRedirect(signInAction(signInForm()), "/en/learn");
    expect(requirePrincipalMock).toHaveBeenCalledTimes(1);
    expect(client.auth.signInWithPassword).toHaveBeenCalledWith({
      email: "learner@example.test",
      password: "123123123",
    });
    expect(consumeAuthenticationRateLimitMock).toHaveBeenCalledWith(
      "sign_in",
      "learner@example.test",
    );
  });

  it("preserves a safe explicit next after password sign-in", async () => {
    createServerClientMock.mockResolvedValue(authClient());

    await expectRedirect(
      signInAction(signInForm("/en/admin/courses?state=draft")),
      "/en/admin/courses?state=draft",
    );
    expect(requirePrincipalMock).not.toHaveBeenCalled();
  });

  it("rejects an unsafe next and falls back to the principal destination", async () => {
    createServerClientMock.mockResolvedValue(authClient());
    requirePrincipalMock.mockResolvedValue(principal(["organization_admin"]));

    await expectRedirect(
      signInAction(signInForm("https://example.com/admin")),
      "/en/organization",
    );
    expect(requirePrincipalMock).toHaveBeenCalledTimes(1);
  });

  it("does not resolve a principal when password sign-in fails", async () => {
    createServerClientMock.mockResolvedValue(
      authClient({ signInError: new Error("invalid credentials") }),
    );

    await expectRedirect(
      signInAction(signInForm()),
      "/en/auth/login?error=invalid",
    );
    expect(requirePrincipalMock).not.toHaveBeenCalled();
  });

  it("distinguishes a retryable authentication outage from invalid credentials", async () => {
    createServerClientMock.mockResolvedValue(
      authClient({
        signInError: {
          name: "AuthRetryableFetchError",
          status: 502,
          message: "gateway unavailable",
        },
      }),
    );

    await expectRedirect(
      signInAction(signInForm()),
      "/en/auth/login?error=unavailable",
    );
    expect(requirePrincipalMock).not.toHaveBeenCalled();
  });

  it("fails closed when sign-in succeeds but no active principal resolves", async () => {
    createServerClientMock.mockResolvedValue(authClient());
    requirePrincipalMock.mockRejectedValue(new AuthenticationRequiredError());

    await expectRedirect(
      signInAction(signInForm()),
      "/en/auth/login?error=invalid",
    );
  });

  it("uses the server principal for an immediate registration session", async () => {
    const client = authClient({ signUpSession: {} });
    createServerClientMock.mockResolvedValue(client);
    requirePrincipalMock.mockResolvedValue(principal(["trainer"]));

    await expectRedirect(registerAction(registrationForm()), "/en/trainer");
    expect(requirePrincipalMock).toHaveBeenCalledTimes(1);
  });

  it("does not resolve a principal when registration fails", async () => {
    createServerClientMock.mockResolvedValue(
      authClient({ signUpError: new Error("registration unavailable") }),
    );

    await expectRedirect(
      registerAction(registrationForm()),
      "/en/auth/register?error=invalid",
    );
    expect(requirePrincipalMock).not.toHaveBeenCalled();
  });

  it.each([
    {
      action: signInAction,
      form: () => signInForm(),
      operation: "sign_in",
      destination: "/en/auth/login?error=throttled",
    },
    {
      action: registerAction,
      form: () => registrationForm(),
      operation: "register",
      destination: "/en/auth/register?error=throttled",
    },
    {
      action: requestPasswordResetAction,
      form: () => passwordResetForm(),
      operation: "password_reset",
      destination: "/en/auth/reset-password?error=throttled",
    },
  ])(
    "denies $operation generically before creating an auth client",
    async ({ action, form, operation, destination }) => {
      consumeAuthenticationRateLimitMock.mockResolvedValue(false);

      await expectRedirect(action(form()), destination);

      expect(consumeAuthenticationRateLimitMock).toHaveBeenCalledWith(
        operation,
        "learner@example.test",
      );
      expect(createServerClientMock).not.toHaveBeenCalled();
    },
  );

  it("throttles malformed sign-in input before returning generic validation", async () => {
    const malformed = formData({ locale: "en", email: "not-an-email" });

    await expectRedirect(
      signInAction(malformed),
      "/en/auth/login?error=invalid",
    );

    expect(consumeAuthenticationRateLimitMock).toHaveBeenCalledWith(
      "sign_in",
      "not-an-email",
    );
    expect(createServerClientMock).not.toHaveBeenCalled();
  });

  it("preserves an explicit next for an immediate registration session", async () => {
    createServerClientMock.mockResolvedValue(authClient({ signUpSession: {} }));

    await expectRedirect(
      registerAction(registrationForm("/en/catalog/testing-foundations")),
      "/en/catalog/testing-foundations",
    );
    expect(requirePrincipalMock).not.toHaveBeenCalled();
  });

  it("directs a confirmation-required new learner to the learner callback flow", async () => {
    const client = authClient({ signUpSession: null });
    createServerClientMock.mockResolvedValue(client);

    await expectRedirect(
      registerAction(registrationForm()),
      "/en/auth/login?status=check-email",
    );
    expect(client.auth.signUp).toHaveBeenCalledWith(
      expect.objectContaining({
        options: expect.objectContaining({
          emailRedirectTo:
            "https://app.example.test/en/auth/callback?next=%2Fen%2Flearn",
        }),
      }),
    );
    expect(requirePrincipalMock).not.toHaveBeenCalled();
  });

  it("preserves a safe explicit next in the email confirmation callback", async () => {
    const client = authClient({ signUpSession: null });
    createServerClientMock.mockResolvedValue(client);

    await expectRedirect(
      registerAction(registrationForm("/en/learn/questions?open=1")),
      "/en/auth/login?status=check-email",
    );
    expect(client.auth.signUp).toHaveBeenCalledWith(
      expect.objectContaining({
        options: expect.objectContaining({
          emailRedirectTo:
            "https://app.example.test/en/auth/callback?next=%2Fen%2Flearn%2Fquestions%3Fopen%3D1",
        }),
      }),
    );
  });

  it("replaces an unsafe registration next with the learner confirmation flow", async () => {
    const client = authClient({ signUpSession: null });
    createServerClientMock.mockResolvedValue(client);

    await expectRedirect(
      registerAction(registrationForm("//example.com/admin")),
      "/en/auth/login?status=check-email",
    );
    expect(client.auth.signUp).toHaveBeenCalledWith(
      expect.objectContaining({
        options: expect.objectContaining({
          emailRedirectTo:
            "https://app.example.test/en/auth/callback?next=%2Fen%2Flearn",
        }),
      }),
    );
  });

  it("requests password recovery through the shared throttle and never enumerates provider errors", async () => {
    const client = authClient({ resetError: new Error("unknown account") });
    createServerClientMock.mockResolvedValue(client);

    await expectRedirect(
      requestPasswordResetAction(passwordResetForm()),
      "/en/auth/login?status=reset-sent",
    );

    expect(consumeAuthenticationRateLimitMock).toHaveBeenCalledWith(
      "password_reset",
      "learner@example.test",
    );
    expect(client.auth.resetPasswordForEmail).toHaveBeenCalledWith(
      "learner@example.test",
      {
        redirectTo:
          "https://app.example.test/en/auth/callback?next=/en/auth/update-password",
      },
    );
  });

  it("updates a recovery password, revokes every refresh session, and requires a fresh sign-in", async () => {
    const client = authClient();
    createServerClientMock.mockResolvedValue(client);

    await expectRedirect(
      updatePasswordAction(
        formData({
          locale: "de",
          password: "Correct-Password-123!",
        }),
      ),
      "/de/auth/login?status=password-updated",
    );

    expect(client.auth.updateUser).toHaveBeenCalledWith({
      password: "Correct-Password-123!",
    });
    expect(client.auth.signOut).toHaveBeenCalledWith({ scope: "global" });
  });

  it("does not touch the provider for an invalid new password", async () => {
    await expectRedirect(
      updatePasswordAction(
        formData({ locale: "en", password: "too-short" }),
      ),
      "/en/auth/update-password?error=invalid",
    );

    expect(createServerClientMock).not.toHaveBeenCalled();
  });

  it("does not revoke sessions when the password update fails", async () => {
    const client = authClient({ updateError: new Error("expired recovery") });
    createServerClientMock.mockResolvedValue(client);

    await expectRedirect(
      updatePasswordAction(
        formData({
          locale: "en",
          password: "Correct-Password-123!",
        }),
      ),
      "/en/auth/update-password?error=invalid",
    );

    expect(client.auth.signOut).not.toHaveBeenCalled();
  });

  it("signs out only the current session and preserves a valid locale", async () => {
    const client = authClient();
    createServerClientMock.mockResolvedValue(client);

    await expectRedirect(
      signOutAction(formData({ locale: "ru" })),
      "/ru",
    );

    expect(client.auth.signOut).toHaveBeenCalledWith({ scope: "local" });
  });

  it("falls back to English after sign-out when the submitted locale is invalid", async () => {
    const client = authClient({ signOutError: new Error("provider unavailable") });
    createServerClientMock.mockResolvedValue(client);

    await expectRedirect(
      signOutAction(formData({ locale: "fr" })),
      "/en",
    );
    expect(client.auth.signOut).toHaveBeenCalledWith({ scope: "local" });
  });
});
