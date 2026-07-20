import { NextResponse } from "next/server";

import {
  resolvePrivateEvidenceDownload,
  type PrivateEvidenceDownloadResolution,
} from "@/features/tasks/server/private-evidence-upload";

export const dynamic = "force-dynamic";

interface PrivateEvidenceDownloadRouteDependencies {
  readonly resolveDownload: (
    input: unknown,
  ) => Promise<PrivateEvidenceDownloadResolution>;
}

const defaultDependencies: PrivateEvidenceDownloadRouteDependencies = {
  resolveDownload: resolvePrivateEvidenceDownload,
};

function securityHeaders() {
  return {
    "cache-control": "private, no-store, max-age=0",
    "content-security-policy": "default-src 'none'; frame-ancestors 'none'",
    "cross-origin-resource-policy": "same-origin",
    "referrer-policy": "no-referrer",
    "x-content-type-options": "nosniff",
  };
}

function errorResponse(
  status: 401 | 404 | 503,
  code: "authentication_required" | "not_found" | "temporarily_unavailable",
) {
  return NextResponse.json(
    { error: { code } },
    {
      status,
      headers: {
        ...securityHeaders(),
        ...(status === 503 ? { "retry-after": "5" } : {}),
      },
    },
  );
}

export function createPrivateEvidenceDownloadHandler(
  overrides: Partial<PrivateEvidenceDownloadRouteDependencies> = {},
) {
  const dependencies = { ...defaultDependencies, ...overrides };

  return async function downloadPrivateEvidence(
    _request: Request,
    context: { params: Promise<{ evidenceId: string }> },
  ) {
    let resolution: PrivateEvidenceDownloadResolution;
    try {
      const { evidenceId } = await context.params;
      resolution = await dependencies.resolveDownload({ evidenceId });
    } catch {
      return errorResponse(503, "temporarily_unavailable");
    }

    switch (resolution.status) {
      case "authentication_required":
        return errorResponse(401, "authentication_required");
      case "not_found":
        return errorResponse(404, "not_found");
      case "temporarily_unavailable":
        return errorResponse(503, "temporarily_unavailable");
      case "ready":
        return NextResponse.redirect(resolution.signedUrl, {
          status: 307,
          headers: securityHeaders(),
        });
    }
  };
}

export const GET = createPrivateEvidenceDownloadHandler();
