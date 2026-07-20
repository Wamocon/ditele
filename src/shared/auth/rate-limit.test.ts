import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  authenticationRateLimitClientSubject,
  createAuthenticationRateLimitSubjects,
  normalizeAuthenticationRateLimitEmail,
} from "./rate-limit";

const HMAC_KEY = "test-rate-limit-key-with-at-least-32-bytes";

describe("authentication rate-limit subject minimization", () => {
  it("normalizes case, whitespace, and compatibility characters", () => {
    expect(
      normalizeAuthenticationRateLimitEmail("  ＡDA@Example.TEST  "),
    ).toBe("ada@example.test");
    expect(normalizeAuthenticationRateLimitEmail(null)).toBe("invalid");
    expect(normalizeAuthenticationRateLimitEmail("missing-at-sign")).toBe(
      "invalid",
    );
    expect(
      normalizeAuthenticationRateLimitEmail(`${"a".repeat(250)}@test.invalid`),
    ).toBe("invalid");
  });

  it("selects only a bounded valid client address in trusted-header order", () => {
    expect(
      authenticationRateLimitClientSubject(
        new Headers({
          "cf-connecting-ip": "2001:db8::5",
          "x-forwarded-for": "192.0.2.10, 198.51.100.2",
          "x-real-ip": "192.0.2.20",
        }),
      ),
    ).toBe("2001:db8::5");
    expect(
      authenticationRateLimitClientSubject(
        new Headers({ "x-forwarded-for": "192.0.2.10, 198.51.100.2" }),
      ),
    ).toBe("192.0.2.10");
    expect(
      authenticationRateLimitClientSubject(
        new Headers({ "x-forwarded-for": "attacker-controlled-value" }),
      ),
    ).toBe("unavailable");
    expect(
      authenticationRateLimitClientSubject(
        new Headers({ "x-forwarded-for": "1".repeat(1025) }),
      ),
    ).toBe("unavailable");
  });

  it("creates deterministic domain-separated HMAC digests without raw subjects", () => {
    const first = createAuthenticationRateLimitSubjects({
      email: "Ada@Example.TEST",
      requestHeaders: new Headers({ "x-real-ip": "192.0.2.42" }),
      hmacKey: HMAC_KEY,
    });
    const equivalent = createAuthenticationRateLimitSubjects({
      email: " ada@example.test ",
      requestHeaders: new Headers({ "x-real-ip": "192.0.2.42" }),
      hmacKey: HMAC_KEY,
    });

    expect(first).toEqual(equivalent);
    expect(first.emailSubject).toMatch(/^[0-9a-f]{64}$/u);
    expect(first.clientSubject).toMatch(/^[0-9a-f]{64}$/u);
    expect(first.emailSubject).not.toBe(first.clientSubject);
    expect(JSON.stringify(first)).not.toContain("ada@example.test");
    expect(JSON.stringify(first)).not.toContain("192.0.2.42");
  });

  it("rejects weak or unexpectedly large HMAC keys", () => {
    expect(() =>
      createAuthenticationRateLimitSubjects({
        email: "ada@example.test",
        requestHeaders: new Headers(),
        hmacKey: "too-short",
      }),
    ).toThrow("Invalid authentication rate-limit HMAC key");
    expect(() =>
      createAuthenticationRateLimitSubjects({
        email: "ada@example.test",
        requestHeaders: new Headers(),
        hmacKey: "x".repeat(4097),
      }),
    ).toThrow("Invalid authentication rate-limit HMAC key");
  });
});
