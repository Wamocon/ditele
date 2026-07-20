import { describe, expect, it } from "vitest";

import {
  canAccessCohort,
  hasPermission,
  hasRole,
  requirePermission,
} from "@/shared/auth/authorization";
import { AuthorizationDeniedError } from "@/shared/auth/errors";
import {
  isTrustedMutationOrigin,
  requireTrustedMutationOrigin,
} from "@/shared/auth/origin";
import type { Principal } from "@/shared/auth/types";
import { validateEvidenceUpload } from "@/shared/auth/upload-policy";

const principal: Principal = {
  userId: "user-1",
  sessionId: "session-1",
  organizationId: "org-1",
  primaryRole: "trainer",
  roles: ["trainer"],
  permissions: ["submission.review"],
  cohortIds: ["cohort-1"],
};

function request(method: string, headers: HeadersInit = {}): Request {
  return new Request("https://academy.example.test/en/learn", { method, headers });
}

describe("server authorization helpers", () => {
  it("checks roles, permissions and cohort scope without browser claims", () => {
    expect(hasRole(principal, "trainer")).toBe(true);
    expect(hasRole(principal, "admin")).toBe(false);
    expect(hasPermission(principal, "submission.review")).toBe(true);
    expect(hasPermission(principal, "cohort.manage")).toBe(false);
    expect(canAccessCohort(principal, "cohort-1")).toBe(true);
    expect(canAccessCohort(principal, "cohort-2")).toBe(false);
    expect(
      canAccessCohort(
        { ...principal, permissions: [...principal.permissions, "cohort.manage"] },
        "cohort-2",
      ),
    ).toBe(true);
  });

  it("throws a typed denial when a required permission is absent", () => {
    expect(() => requirePermission(principal, "submission.review")).not.toThrow();
    expect(() => requirePermission(principal, "cohort.manage")).toThrow(
      AuthorizationDeniedError,
    );
  });
});

describe("mutation origin validation", () => {
  it("allows safe methods and same-origin or explicitly allowed mutations", () => {
    expect(isTrustedMutationOrigin(request("GET"))).toBe(true);
    expect(
      isTrustedMutationOrigin(
        request("POST", {
          origin: "https://academy.example.test",
          "sec-fetch-site": "same-origin",
        }),
      ),
    ).toBe(true);
    expect(
      isTrustedMutationOrigin(
        request("POST", {
          origin: "https://admin.example.test",
          "sec-fetch-site": "same-site",
        }),
        ["https://admin.example.test"],
      ),
    ).toBe(true);
    expect(
      isTrustedMutationOrigin(
        request("POST", { origin: "https://academy.example.test" }),
      ),
    ).toBe(true);
  });

  it("rejects missing, foreign and cross-site mutation origins", () => {
    expect(isTrustedMutationOrigin(request("POST"))).toBe(false);
    expect(
      isTrustedMutationOrigin(
        request("POST", {
          origin: "https://attacker.example",
          "sec-fetch-site": "cross-site",
        }),
      ),
    ).toBe(false);
    expect(
      isTrustedMutationOrigin(
        request("POST", {
          origin: "https://academy.example.test",
          "sec-fetch-site": "cross-site",
        }),
      ),
    ).toBe(false);
    expect(() => requireTrustedMutationOrigin(request("DELETE"))).toThrow(
      "UNTRUSTED_MUTATION_ORIGIN",
    );
    expect(() =>
      requireTrustedMutationOrigin(
        request("POST", { origin: "https://academy.example.test" }),
      ),
    ).not.toThrow();
  });
});

describe("evidence upload policy", () => {
  it("accepts a safe supported file within the configured size", () => {
    expect(
      validateEvidenceUpload({
        mimeType: "application/pdf",
        byteSize: 1024,
        fileName: "test-report.pdf",
      }),
    ).toEqual({ accepted: true, code: "accepted" });
  });

  it("rejects oversized, negative, unsupported and path-like uploads", () => {
    expect(
      validateEvidenceUpload(
        { mimeType: "text/plain", byteSize: 11, fileName: "notes.txt" },
        10,
      ).code,
    ).toBe("file_too_large");
    expect(
      validateEvidenceUpload({
        mimeType: "text/plain",
        byteSize: -1,
        fileName: "notes.txt",
      }).code,
    ).toBe("file_too_large");
    expect(
      validateEvidenceUpload({
        mimeType: "application/x-msdownload",
        byteSize: 1,
        fileName: "payload.exe",
      }).code,
    ).toBe("unsupported_type");
    for (const fileName of ["../report.pdf", "folder\\report.pdf", "report\0.pdf"]) {
      expect(
        validateEvidenceUpload({
          mimeType: "application/pdf",
          byteSize: 1,
          fileName,
        }).code,
      ).toBe("unsafe_name");
    }
  });
});
