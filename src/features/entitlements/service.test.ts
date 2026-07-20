import { describe, expect, it } from "vitest";

import { resolveEntitlement } from "./service";

const productPackage = { id: "package-1", code: "pro", title: "Professional", state: "active" as const, capabilities: ["labs.access" as const, "ai.coach" as const] };
const grant = { id: "grant-1", subjectId: null, organizationId: "org-1", packageId: "package-1", capability: "labs.access" as const, validFrom: "2026-01-01T00:00:00.000Z", validUntil: null };
const now = new Date("2026-07-17T12:00:00.000Z");

describe("entitlements", () => {
  it("resolves an active organization grant", () => {
    expect(resolveEntitlement({ subjectId: "learner-1", organizationId: "org-1", feature: "labs.access", now }, [grant], [productPackage])).toEqual({ allowed: true, grantId: "grant-1", packageId: "package-1" });
  });

  it("does not leak grants across tenants", () => {
    expect(resolveEntitlement({ subjectId: "learner-1", organizationId: "org-2", feature: "labs.access", now }, [grant], [productPackage])).toEqual({ allowed: false, reason: "not_entitled" });
  });

  it("reports unavailable preview packages honestly", () => {
    expect(resolveEntitlement({ subjectId: "learner-1", organizationId: "org-1", feature: "labs.access", now }, [grant], [{ ...productPackage, state: "draft" }])).toEqual({ allowed: false, reason: "package_unavailable" });
  });

  it("reports expired grants", () => {
    expect(resolveEntitlement({ subjectId: "learner-1", organizationId: "org-1", feature: "labs.access", now }, [{ ...grant, validUntil: "2026-07-01T00:00:00.000Z" }], [productPackage])).toEqual({ allowed: false, reason: "expired" });
  });

  it("requires tenant scope even for a subject-specific grant", () => {
    expect(resolveEntitlement(
      { subjectId: "learner-1", organizationId: "org-2", feature: "labs.access", now },
      [{ ...grant, subjectId: "learner-1" }],
      [productPackage],
    )).toEqual({ allowed: false, reason: "not_entitled" });
  });
});
