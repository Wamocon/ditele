import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { PrivateEvidenceDownloadResolution } from "@/features/tasks/server/private-evidence-upload";

import { createPrivateEvidenceDownloadHandler } from "./route";

const evidenceId = "66666666-6666-4666-8666-666666666666";
const privateTarget =
  "https://project.supabase.co/storage/v1/object/sign/task-evidence-private/" +
  "11111111-1111-4111-8111-111111111111/" +
  "22222222-2222-4222-8222-222222222222/" +
  "33333333-3333-4333-8333-333333333333/" +
  "44444444-4444-4444-8444-444444444444" +
  "?token=signed&download=report.pdf";

function call(
  resolveDownload: (
    input: unknown,
  ) => Promise<PrivateEvidenceDownloadResolution>,
  requestedEvidenceId = evidenceId,
) {
  const GET = createPrivateEvidenceDownloadHandler({
    resolveDownload,
  });
  return GET(new Request(`https://app.example.test/api/evidence/${requestedEvidenceId}/download`), {
    params: Promise.resolve({ evidenceId: requestedEvidenceId }),
  });
}

function expectSecureHeaders(response: Response) {
  expect(response.headers.get("cache-control")).toBe(
    "private, no-store, max-age=0",
  );
  expect(response.headers.get("referrer-policy")).toBe("no-referrer");
  expect(response.headers.get("x-content-type-options")).toBe("nosniff");
  expect(response.headers.get("cross-origin-resource-policy")).toBe(
    "same-origin",
  );
  expect(response.headers.get("content-security-policy")).toContain(
    "default-src 'none'",
  );
}

describe("private evidence download route", () => {
  it("redirects to the controlled attachment target with non-cacheable headers", async () => {
    const resolveDownload = vi.fn(async () => ({
      status: "ready" as const,
      signedUrl: privateTarget,
    }));

    const response = await call(resolveDownload);

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(privateTarget);
    expectSecureHeaders(response);
    expect(resolveDownload).toHaveBeenCalledWith({ evidenceId });
  });

  it.each([
    ["authentication_required", 401],
    ["not_found", 404],
    ["temporarily_unavailable", 503],
  ] as const)("maps %s without exposing a storage target", async (status, code) => {
    const response = await call(vi.fn(async () => ({ status })));
    const body = await response.text();

    expect(response.status).toBe(code);
    expectSecureHeaders(response);
    expect(body).toBe(`{"error":{"code":"${status}"}}`);
    expect(body).not.toMatch(/object_key|sha256|supabase|token/iu);
    expect(response.headers.get("location")).toBeNull();
    expect(response.headers.get("retry-after")).toBe(
      code === 503 ? "5" : null,
    );
  });

  it("fails closed and hides unexpected provider errors", async () => {
    const response = await call(
      vi.fn(async () => {
        throw new Error(
          "https://internal.example.test/private/key?token=service-secret",
        );
      }),
    );
    const body = await response.text();

    expect(response.status).toBe(503);
    expectSecureHeaders(response);
    expect(body).toBe('{"error":{"code":"temporarily_unavailable"}}');
    expect(body).not.toMatch(/internal|private|service-secret|token/iu);
  });
});
