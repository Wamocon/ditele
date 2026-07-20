import { describe, expect, it } from "vitest";

import { adminLandingForRoles } from "./landing";

describe("adminLandingForRoles", () => {
  it("keeps administrators on operations and routes pure content administrators to content", () => {
    expect(adminLandingForRoles(["admin", "content_admin"])).toBe("/admin");
    expect(adminLandingForRoles(["content_admin"])).toBe("/admin/courses");
    expect(adminLandingForRoles(["learner"])).toBeNull();
  });
});
