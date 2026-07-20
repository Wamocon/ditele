import { describe, expect, it } from "vitest";

import {
  isCompletedNextServerActionResponse,
  isExpectedNextTransportAbort,
} from "../../e2e/helpers/runtime";

const appOrigin = "http://127.0.0.1:3100";

function abort(
  overrides: Partial<Parameters<typeof isExpectedNextTransportAbort>[0]> = {},
): Parameters<typeof isExpectedNextTransportAbort>[0] {
  return {
    errorText: "net::ERR_ABORTED",
    headers: {},
    method: "GET",
    receivedCompletedServerActionResponse: false,
    resourceType: "fetch",
    url: `${appOrigin}/en/learn`,
    ...overrides,
  };
}

describe("expected Next.js transport aborts", () => {
  it("ignores only a same-origin Next RSC GET fetch with a non-empty marker", () => {
    expect(
      isExpectedNextTransportAbort(
        abort({
          headers: { rsc: "1" },
          url: `${appOrigin}/en/learn?_rsc=route-payload`,
        }),
        appOrigin,
      ),
    ).toBe(true);
  });

  it("retains malformed, cross-origin, non-fetch, and non-RSC GET failures", () => {
    for (const candidate of [
      abort({ url: "not-a-url" }),
      abort({
        headers: { rsc: "1" },
        url: "https://attacker.example/en/learn?_rsc=route-payload",
      }),
      abort({
        headers: { rsc: "1" },
        resourceType: "document",
        url: `${appOrigin}/en/learn?_rsc=route-payload`,
      }),
      abort({ url: `${appOrigin}/en/learn?_rsc=route-payload` }),
      abort({
        headers: { rsc: "1" },
        url: `${appOrigin}/en/learn?_rsc=`,
      }),
      abort({ headers: { rsc: "1" } }),
      abort({
        errorText: "net::ERR_CONNECTION_REFUSED",
        headers: { rsc: "1" },
        url: `${appOrigin}/en/learn?_rsc=route-payload`,
      }),
    ]) {
      expect(isExpectedNextTransportAbort(candidate, appOrigin)).toBe(false);
    }
  });

  it("ignores an aborted server action only after its Next redirect arrived", () => {
    expect(
      isExpectedNextTransportAbort(
        abort({
          headers: {
            accept: "text/x-component",
            "next-action": "action-hash",
          },
          method: "POST",
          receivedCompletedServerActionResponse: true,
          url: `${appOrigin}/en/auth/login`,
        }),
        appOrigin,
      ),
    ).toBe(true);
  });

  it("retains server-action aborts without every redirect signature", () => {
    const serverAction = abort({
      headers: {
        accept: "text/x-component",
        "next-action": "action-hash",
      },
      method: "POST",
      receivedCompletedServerActionResponse: true,
      url: `${appOrigin}/en/auth/login`,
    });

    for (const candidate of [
      { ...serverAction, receivedCompletedServerActionResponse: false },
      { ...serverAction, headers: { accept: "text/x-component" } },
      { ...serverAction, headers: { "next-action": "action-hash" } },
      { ...serverAction, resourceType: "document" },
      { ...serverAction, url: "https://attacker.example/en/auth/login" },
      { ...serverAction, errorText: "net::ERR_FAILED" },
    ]) {
      expect(isExpectedNextTransportAbort(candidate, appOrigin)).toBe(false);
    }
  });

  it("preserves the path-scoped same-origin development-font exception", () => {
    expect(
      isExpectedNextTransportAbort(
        abort({
          resourceType: "stylesheet",
          url: `${appOrigin}/__nextjs_font/inter-latin.woff2`,
        }),
        appOrigin,
      ),
    ).toBe(true);
    expect(
      isExpectedNextTransportAbort(
        abort({ url: "https://attacker.example/__nextjs_font/inter.woff2" }),
        appOrigin,
      ),
    ).toBe(false);
  });
});

describe("completed Next server-action responses", () => {
  it("recognizes the exact completed mutation and redirect signatures", () => {
    expect(
      isCompletedNextServerActionResponse(200, {
        "content-type": "text/x-component",
        "x-action-revalidated": "1",
      }),
    ).toBe(true);
    expect(
      isCompletedNextServerActionResponse(200, {
        "content-type": "text/x-component; charset=utf-8",
        "x-action-revalidated": "1",
      }),
    ).toBe(true);
    expect(
      isCompletedNextServerActionResponse(303, {
        "content-type": "text/x-component",
        "x-action-redirect": "/en/learn;push",
      }),
    ).toBe(true);
  });

  it("does not treat an incomplete or non-RSC response as completion", () => {
    for (const [status, headers] of [
      [200, { "content-type": "text/x-component" }],
      [200, { "x-action-revalidated": "1" }],
      [200, { "content-type": "application/json", "x-action-revalidated": "1" }],
      [201, { "content-type": "text/x-component", "x-action-revalidated": "1" }],
      [303, { "content-type": "text/x-component" }],
      [500, { "content-type": "text/x-component", "x-action-revalidated": "1" }],
    ] as const) {
      expect(
        isCompletedNextServerActionResponse(status, headers),
      ).toBe(false);
    }
  });
});
