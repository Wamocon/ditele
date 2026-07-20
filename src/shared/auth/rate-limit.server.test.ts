import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  createServiceRoleClientMock,
  getServiceEnvironmentMock,
  headersMock,
  rpcMock,
} = vi.hoisted(() => ({
  createServiceRoleClientMock: vi.fn(),
  getServiceEnvironmentMock: vi.fn(),
  headersMock: vi.fn(),
  rpcMock: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: headersMock }));
vi.mock("@/shared/database/service-role", () => ({
  createServiceRoleClient: createServiceRoleClientMock,
}));
vi.mock("@/shared/database/environment", () => ({
  getSupabaseServiceRoleEnvironment: getServiceEnvironmentMock,
}));

import { consumeAuthenticationRateLimit } from "./rate-limit.server";

const SERVICE_ROLE_KEY = "service-role-key-with-more-than-thirty-two-bytes";

describe("authentication rate-limit server gateway", () => {
  beforeEach(() => {
    vi.stubEnv(
      "DITELE_AUTH_RATE_LIMIT_HMAC_KEY",
      "default-test-hmac-key-with-more-than-thirty-two-bytes",
    );
    headersMock.mockReset();
    headersMock.mockResolvedValue(
      new Headers({ "x-forwarded-for": "192.0.2.80" }),
    );
    rpcMock.mockReset();
    rpcMock.mockResolvedValue({ data: true, error: null });
    createServiceRoleClientMock.mockReset();
    createServiceRoleClientMock.mockReturnValue({ rpc: rpcMock });
    getServiceEnvironmentMock.mockReset();
    getServiceEnvironmentMock.mockReturnValue({
      url: "http://127.0.0.1:54321",
      serviceRoleKey: SERVICE_ROLE_KEY,
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("calls the server-only RPC with domain-separated hashes and no raw subject", async () => {
    await expect(
      consumeAuthenticationRateLimit("sign_in", "Ada@Example.TEST"),
    ).resolves.toBe(true);

    expect(rpcMock).toHaveBeenCalledTimes(1);
    expect(rpcMock).toHaveBeenCalledWith("consume_authentication_rate_limit", {
      p_operation: "sign_in",
      p_email_subject: expect.stringMatching(/^[0-9a-f]{64}$/u),
      p_client_subject: expect.stringMatching(/^[0-9a-f]{64}$/u),
    });
    expect(JSON.stringify(rpcMock.mock.calls)).not.toContain("ada@example.test");
    expect(JSON.stringify(rpcMock.mock.calls)).not.toContain("192.0.2.80");
  });

  it("honors an independent server-only HMAC key", async () => {
    vi.stubEnv(
      "DITELE_AUTH_RATE_LIMIT_HMAC_KEY",
      "independent-hmac-key-with-more-than-thirty-two-bytes",
    );

    await expect(
      consumeAuthenticationRateLimit("register", "ada@example.test"),
    ).resolves.toBe(true);

    expect(rpcMock).toHaveBeenCalledWith(
      "consume_authentication_rate_limit",
      expect.objectContaining({ p_operation: "register" }),
    );
  });

  it("derives subjects from the server-role key when no independent key is configured", async () => {
    delete process.env.DITELE_AUTH_RATE_LIMIT_HMAC_KEY;

    await expect(
      consumeAuthenticationRateLimit("sign_in", "ada@example.test"),
    ).resolves.toBe(true);
    expect(rpcMock).toHaveBeenCalledTimes(1);
  });

  it.each([
    { data: false, error: null },
    { data: null, error: { message: "database unavailable" } },
    { data: null, error: null },
  ])("fails closed for a non-allow RPC result %#", async (result) => {
    rpcMock.mockResolvedValue(result);

    await expect(
      consumeAuthenticationRateLimit("password_reset", "ada@example.test"),
    ).resolves.toBe(false);
  });

  it("fails closed without leaking an infrastructure exception", async () => {
    rpcMock.mockRejectedValue(new Error("connection failed"));

    await expect(
      consumeAuthenticationRateLimit("sign_in", "ada@example.test"),
    ).resolves.toBe(false);
  });

  it("fails closed before database access when the configured HMAC key is weak", async () => {
    vi.stubEnv("DITELE_AUTH_RATE_LIMIT_HMAC_KEY", "weak");

    await expect(
      consumeAuthenticationRateLimit("sign_in", "ada@example.test"),
    ).resolves.toBe(false);
    expect(createServiceRoleClientMock).not.toHaveBeenCalled();
  });
});
