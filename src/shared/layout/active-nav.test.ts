import { describe, expect, it } from "vitest";
import { activeNavHref } from "./active-nav";

/** The trainer nav, locale-prefixed, in nav-config.ts order. */
const TRAINER = [
  "/de/trainer",
  "/de/trainer/submissions",
  "/de/trainer/questions",
  "/de/trainer/groups",
  "/de/trainer/progress",
  "/de/trainer/history",
  "/de/trainer/questions/archive",
  "/de/trainer/profile",
];

describe("activeNavHref", () => {
  it("selects only the deepest entry, not every ancestor", () => {
    // The reported bug: "Übersicht" (/de/trainer) stayed lit on the reviews
    // page because it is a prefix of it.
    expect(activeNavHref("/de/trainer/submissions", TRAINER)).toBe("/de/trainer/submissions");
  });

  it("selects the section root only on the section root itself", () => {
    expect(activeNavHref("/de/trainer", TRAINER)).toBe("/de/trainer");
  });

  it("prefers the more specific of two nested entries", () => {
    // /trainer/questions is also a nav entry and also a prefix here.
    expect(activeNavHref("/de/trainer/questions/archive", TRAINER)).toBe(
      "/de/trainer/questions/archive"
    );
  });

  it("keeps the section tab lit on a detail route that is not itself a nav entry", () => {
    expect(activeNavHref("/de/trainer/submissions/abc-123", TRAINER)).toBe(
      "/de/trainer/submissions"
    );
  });

  it("does not match a sibling that merely shares a name prefix", () => {
    // "/de/trainer/groups-archive" must not resolve to "/de/trainer/groups";
    // only whole path segments count.
    expect(activeNavHref("/de/trainer/groups-archive", TRAINER)).toBe("/de/trainer");
  });

  it("ignores a trailing slash", () => {
    expect(activeNavHref("/de/trainer/submissions/", TRAINER)).toBe("/de/trainer/submissions");
  });

  it("returns null when the URL is outside the navigation", () => {
    expect(activeNavHref("/de/catalog", TRAINER)).toBeNull();
  });

  it("handles the public nav, whose root entry is the bare locale", () => {
    const publicNav = ["/de", "/de/catalog", "/de/about", "/de/faq"];
    expect(activeNavHref("/de", publicNav)).toBe("/de");
    expect(activeNavHref("/de/catalog", publicNav)).toBe("/de/catalog");
    expect(activeNavHref("/de/catalog/practical-testing", publicNav)).toBe("/de/catalog");
  });

  it("returns an entry referentially equal to the one passed in", () => {
    // Callers compare with === against the href they built themselves.
    const entry = TRAINER[1];
    expect(activeNavHref("/de/trainer/submissions", TRAINER)).toBe(entry);
  });

  it("is stable when given no candidates", () => {
    expect(activeNavHref("/de/trainer", [])).toBeNull();
  });
});
