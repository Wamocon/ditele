import { describe, expect, it } from "vitest";

import {
  closeParentDisclosure,
  resolveActiveNavigationHref,
} from "./app-shell-nav-link";

describe("resolveActiveNavigationHref", () => {
  const hrefs = [
    "/en/learn",
    "/en/learn/questions",
    "/en/learn/skills",
    "/en/learn/portfolio",
  ];

  it("selects the longest matching navigation boundary for nested routes", () => {
    expect(resolveActiveNavigationHref("/en/learn/questions/01980a", hrefs)).toBe(
      "/en/learn/questions",
    );
  });

  it("falls back to the workspace root for task and course detail routes", () => {
    expect(resolveActiveNavigationHref("/en/learn/tasks/01980a", hrefs)).toBe(
      "/en/learn",
    );
  });

  it("does not match a shared text prefix without a route boundary", () => {
    expect(resolveActiveNavigationHref("/en/learning", hrefs)).toBeUndefined();
  });

  it("normalizes trailing slashes deterministically", () => {
    expect(resolveActiveNavigationHref("/en/learn/skills/", hrefs)).toBe(
      "/en/learn/skills",
    );
  });
});

describe("closeParentDisclosure", () => {
  it("closes the mobile disclosure after a navigation link is activated", () => {
    const disclosure = document.createElement("details");
    const link = document.createElement("a");
    disclosure.open = true;
    disclosure.append(link);

    closeParentDisclosure(link);

    expect(disclosure.open).toBe(false);
  });

  it("does nothing for a desktop navigation link outside a disclosure", () => {
    const link = document.createElement("a");
    expect(() => closeParentDisclosure(link)).not.toThrow();
  });
});
