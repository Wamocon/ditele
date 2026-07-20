import { describe, expect, it } from "vitest";

import { adminMemberDetailCopy } from "./admin-member-detail-copy";

describe("admin member detail copy", () => {
  it.each(["en", "de", "ru"] as const)(
    "provides complete localized lifecycle and empty-state copy for %s",
    (locale) => {
      const copy = adminMemberDetailCopy[locale];
      expect(copy.title.trim()).not.toBe("");
      expect(copy.profileUnavailableDescription.trim()).not.toBe("");
      expect(copy.noAssignments.trim()).not.toBe("");
      expect(copy.noEnrollments.trim()).not.toBe("");
      expect(copy.noCertificates.trim()).not.toBe("");
      expect(Object.keys(copy.membershipStates).toSorted()).toEqual([
        "active",
        "invited",
        "removed",
        "suspended",
      ]);
      expect(Object.keys(copy.enrollmentStates).toSorted()).toEqual([
        "approved",
        "assigned",
        "cancelled",
        "completed",
        "rejected",
        "requested",
      ]);
      expect(Object.keys(copy.certificateStates).toSorted()).toEqual([
        "available",
        "eligible",
        "expired",
        "issued",
        "revoked",
      ]);
      expect(copy.readOnlyDescription.toLowerCase()).toMatch(
        /audit|аудир/,
      );
    },
  );

  it("does not claim that unsupported mutations or downloads are available", () => {
    expect(adminMemberDetailCopy.en.readOnlyDescription).toMatch(
      /require separate audited command workflows/i,
    );
    expect(adminMemberDetailCopy.en.minimizedDescription).toMatch(
      /certificate files are not exposed/i,
    );
  });
});
