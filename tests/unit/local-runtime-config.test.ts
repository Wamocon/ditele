import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

function read(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("local runtime safety configuration", () => {
  it("keeps known local credentials out of generic linked seed configuration", () => {
    const config = read("supabase/config.toml");
    const seedSection = config.match(/\[db\.seed\]([\s\S]*?)(?=\n\[|$)/u)?.[1];
    const scripts = JSON.parse(read("package.json")) as {
      scripts: Record<string, string>;
    };

    expect(seedSection).toBeDefined();
    expect(seedSection).toMatch(/enabled\s*=\s*false/u);
    expect(seedSection).not.toContain("sql_paths");
    expect(scripts.scripts["db:reset"]).toContain("db reset --local");
    for (const seed of [
      "seed.sql",
      "seed_assessments.sql",
      "seed_cleanup.sql",
      "seed_role_accounts.sql",
    ]) {
      expect(scripts.scripts["db:reset"]).toContain(seed);
    }
  });

  it("uses the isolated DiTeLe origin consistently in checked-in defaults", () => {
    expect(read(".env.example")).toContain(
      "DITELE_APP_ORIGIN=http://127.0.0.1:3100",
    );
    expect(read("supabase/config.toml")).toContain(
      'site_url = "http://127.0.0.1:3100"',
    );
    expect(read("playwright.config.ts")).toContain(
      '"http://127.0.0.1:3100"',
    );
    expect(read("e2e/helpers/runtime.ts")).toContain(
      '"http://127.0.0.1:3100"',
    );
    expect(read("src/app/[locale]/auth/actions.ts")).not.toContain(
      "localhost:3000",
    );
  });

  it("documents and generates a dedicated server-only auth throttle HMAC key", () => {
    expect(read(".env.example")).toContain(
      "DITELE_AUTH_RATE_LIMIT_HMAC_KEY=",
    );
    const generator = read("scripts/configure-local-env.mjs");
    expect(generator).toContain('randomBytes(32).toString("hex")');
    expect(generator).toContain(
      "DITELE_AUTH_RATE_LIMIT_HMAC_KEY=${authenticationRateLimitHmacKey}",
    );
  });
});
