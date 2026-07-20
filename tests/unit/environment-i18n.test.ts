import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { getPublicEnvironment } from "@/shared/config/env";
import { getServerEnvironment } from "@/shared/config/server-env";
import {
  getSupabaseServerEnvironment,
  getSupabaseServiceRoleEnvironment,
} from "@/shared/database/environment";
import type { Locale } from "@/shared/i18n/config";
import { getMessages } from "@/shared/i18n/get-messages";

afterEach(() => {
  vi.unstubAllEnvs();
});

function publicEnvironment() {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:56721");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "local-anon-key");
}

describe("environment boundaries", () => {
  it("parses public configuration and rejects invalid URLs", () => {
    publicEnvironment();
    expect(getPublicEnvironment()).toEqual({
      NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:56721",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "local-anon-key",
    });
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "not a URL");
    expect(() => getPublicEnvironment()).toThrow();
  });

  it("applies safe disabled provider defaults and rejects unsupported server modes", () => {
    publicEnvironment();
    vi.stubEnv("DITELE_APP_ORIGIN", "http://localhost:3000");
    expect(getServerEnvironment()).toMatchObject({
      DITELE_DATA_MODE: "supabase",
      DITELE_AI_PROVIDER: "disabled",
      DITELE_LAB_PROVIDER: "disabled",
      DITELE_INTEGRATION_PROVIDER: "disabled",
    });
    vi.stubEnv("DITELE_DATA_MODE", "untrusted-provider");
    expect(() => getServerEnvironment()).toThrow();
  });

  it("prefers the publishable key and falls back explicitly to the legacy anonymous key", () => {
    publicEnvironment();
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "publishable-key");
    expect(getSupabaseServerEnvironment()).toEqual({
      url: "http://127.0.0.1:56721",
      publishableKey: "publishable-key",
    });

    delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    expect(getSupabaseServerEnvironment()).toEqual({
      url: "http://127.0.0.1:56721",
      publishableKey: "local-anon-key",
    });
  });

  it("fails closed when server or privileged credentials are absent", () => {
    publicEnvironment();
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    expect(() => getSupabaseServerEnvironment()).toThrow("Missing required server environment variable: NEXT_PUBLIC_SUPABASE_URL");

    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:56721");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    expect(() => getSupabaseServiceRoleEnvironment()).toThrow("Missing required server environment variable: SUPABASE_SERVICE_ROLE_KEY");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "server-only-local-role");
    expect(getSupabaseServiceRoleEnvironment()).toEqual({
      url: "http://127.0.0.1:56721",
      serviceRoleKey: "server-only-local-role",
    });
  });
});

describe("localized message loading", () => {
  it("loads the selected locale and falls back to English if a loader is unavailable", async () => {
    await expect(getMessages("de")).resolves.toMatchObject({ common: { signIn: "Anmelden" } });
    await expect(getMessages("unsupported" as Locale)).resolves.toMatchObject({ common: { signIn: "Sign in" } });
  });
});
