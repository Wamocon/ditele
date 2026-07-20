import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  checkReadiness,
  readinessEnvironmentFromProcess,
  type ReadinessDependencies,
  type ReadinessEnvironment,
} from "./readiness";

const environment: ReadinessEnvironment = {
  supabaseUrl: "https://database.example.test",
  supabaseAnonKey: "public-anon-key",
  aiProvider: "disabled",
  labProvider: "disabled",
  integrationProvider: "disabled",
};

function dependencies(
  overrides: Partial<ReadinessDependencies> = {},
): ReadinessDependencies {
  return {
    fetch: vi.fn(async () => ({ ok: true })),
    now: vi.fn().mockReturnValueOnce(100).mockReturnValueOnce(127),
    scheduleTimeout: vi.fn(() => "timer-1"),
    cancelTimeout: vi.fn(),
    timeoutMs: 1_500,
    ...overrides,
  };
}

describe("operations readiness", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  it("probes the public catalog through the anonymous boundary", async () => {
    const suite = dependencies();

    const value = await checkReadiness(environment, suite);

    expect(value).toEqual({
      status: "ok",
      dependencies: {
        database: { status: "ready", latency_ms: 27 },
        optional: {
          ai: { status: "disabled" },
          labs: { status: "disabled" },
          integrations: { status: "disabled" },
        },
      },
    });
    expect(suite.fetch).toHaveBeenCalledWith(
      "https://database.example.test/rest/v1/courses?select=id&limit=1",
      expect.objectContaining({
        method: "GET",
        cache: "no-store",
        credentials: "omit",
        redirect: "error",
        headers: {
          accept: "application/json",
          apikey: "public-anon-key",
          authorization: "Bearer public-anon-key",
        },
        signal: expect.any(AbortSignal),
      }),
    );
    expect(suite.scheduleTimeout).toHaveBeenCalledWith(expect.any(Function), 1_500);
    expect(suite.cancelTimeout).toHaveBeenCalledWith("timer-1");
  });

  it("degrades on non-successful or thrown dependency responses without exposing details", async () => {
    const nonSuccessful = await checkReadiness(
      environment,
      dependencies({ fetch: vi.fn(async () => ({ ok: false })) }),
    );
    const thrown = await checkReadiness(
      environment,
      dependencies({
        fetch: vi.fn(async () => {
          throw new Error("postgres://admin:secret@internal/db");
        }),
      }),
    );

    expect(nonSuccessful.dependencies.database.status).toBe("unavailable");
    expect(thrown.dependencies.database.status).toBe("unavailable");
    expect(JSON.stringify({ nonSuccessful, thrown })).not.toMatch(
      /secret|internal|postgres|database\.example/u,
    );
  });

  it("aborts and returns a bounded timeout result even when fetch remains pending", async () => {
    let timeoutCallback: (() => void) | undefined;
    const suite = dependencies({
      fetch: vi.fn(() => new Promise<never>(() => undefined)),
      now: vi.fn().mockReturnValueOnce(5_000).mockReturnValueOnce(6_500),
      scheduleTimeout: vi.fn((callback) => {
        timeoutCallback = callback;
        return "timeout-timer";
      }),
    });

    const pending = checkReadiness(environment, suite);
    await Promise.resolve();
    expect(timeoutCallback).toBeTypeOf("function");
    timeoutCallback?.();

    await expect(pending).resolves.toMatchObject({
      status: "degraded",
      dependencies: { database: { status: "timeout", latency_ms: 1_500 } },
    });
    const init = vi.mocked(suite.fetch).mock.calls[0]?.[1];
    expect(init?.signal?.aborted).toBe(true);
    expect(suite.cancelTimeout).toHaveBeenCalledWith("timeout-timer");
  });

  it.each([
    ["missing URL", { ...environment, supabaseUrl: undefined }],
    ["unsupported URL", { ...environment, supabaseUrl: "file:///tmp/database" }],
    ["URL credentials", { ...environment, supabaseUrl: "https://user:pass@database.example.test" }],
    ["missing key", { ...environment, supabaseAnonKey: undefined }],
    ["unsafe key", { ...environment, supabaseAnonKey: "public\nsecret" }],
  ])("fails closed for %s before calling the network", async (_label, invalidEnvironment) => {
    const suite = dependencies();

    await expect(checkReadiness(invalidEnvironment, suite)).resolves.toEqual({
      status: "degraded",
      dependencies: {
        database: { status: "invalid_configuration", latency_ms: null },
        optional: {
          ai: { status: "disabled" },
          labs: { status: "disabled" },
          integrations: { status: "disabled" },
        },
      },
    });
    expect(suite.fetch).not.toHaveBeenCalled();
    expect(suite.scheduleTimeout).not.toHaveBeenCalled();
  });

  it("clamps reported latency and never lets optional providers fail core readiness", async () => {
    const negative = await checkReadiness(
      { ...environment, aiProvider: "configured", labProvider: "local" },
      dependencies({ now: vi.fn().mockReturnValueOnce(100).mockReturnValueOnce(50) }),
    );
    const excessive = await checkReadiness(
      environment,
      dependencies({ now: vi.fn().mockReturnValueOnce(0).mockReturnValueOnce(90_000) }),
    );

    expect(negative).toMatchObject({
      status: "ok",
      dependencies: {
        database: { latency_ms: 0 },
        optional: {
          ai: { status: "not_checked" },
          labs: { status: "not_checked" },
          integrations: { status: "disabled" },
        },
      },
    });
    expect(excessive.dependencies.database.latency_ms).toBe(60_000);
  });

  it("reads only public and provider-mode environment values", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://supabase.example.test");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-fallback");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "publishable-preferred");
    vi.stubEnv("DITELE_AI_PROVIDER", "disabled");
    vi.stubEnv("DITELE_LAB_PROVIDER", "disabled");
    vi.stubEnv("DITELE_INTEGRATION_PROVIDER", "disabled");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "must-never-be-read");

    expect(readinessEnvironmentFromProcess()).toEqual({
      supabaseUrl: "https://supabase.example.test",
      supabaseAnonKey: "publishable-preferred",
      aiProvider: "disabled",
      labProvider: "disabled",
      integrationProvider: "disabled",
    });
  });
});
