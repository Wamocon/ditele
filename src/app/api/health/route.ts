import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";

import {
  checkReadiness,
  readinessEnvironmentFromProcess,
  type ReadinessResult,
} from "@/features/operations/server/readiness";
import { correlationIdSchema } from "@/shared/api/contracts/common";

export const dynamic = "force-dynamic";

interface HealthRouteDependencies {
  readonly now: () => Date;
  readonly createCorrelationId: () => string;
  readonly readiness: () => Promise<ReadinessResult>;
}

const defaultDependencies: HealthRouteDependencies = {
  now: () => new Date(),
  createCorrelationId: () => randomUUID(),
  readiness: () => checkReadiness(readinessEnvironmentFromProcess()),
};

function responseHeaders(correlationId: string) {
  return {
    "cache-control": "no-store",
    "cross-origin-resource-policy": "same-origin",
    "x-content-type-options": "nosniff",
    "x-correlation-id": correlationId,
  };
}

function correlationId(request: Request, createCorrelationId: () => string) {
  const supplied = request.headers.get("x-correlation-id");
  const parsed = correlationIdSchema.safeParse(supplied);
  return parsed.success ? parsed.data : createCorrelationId();
}

export function createHealthHandler(
  overrides: Partial<HealthRouteDependencies> = {},
) {
  const dependencies = { ...defaultDependencies, ...overrides };

  return async function health(request: Request) {
    const requestCorrelationId = correlationId(
      request,
      dependencies.createCorrelationId,
    );
    const check = new URL(request.url).searchParams.get("check") ?? "liveness";
    const checkedAt = dependencies.now().toISOString();

    if (check !== "liveness" && check !== "readiness") {
      return NextResponse.json(
        {
          error: {
            code: "invalid_health_check",
            message_key: "operations.health.invalid_check",
            field_errors: { check: ["unsupported"] },
            correlation_id: requestCorrelationId,
            retryable: false,
          },
        },
        {
          status: 400,
          headers: responseHeaders(requestCorrelationId),
        },
      );
    }

    if (check === "liveness") {
      return NextResponse.json(
        {
          data: {
            service: "ditele-v2",
            status: "ok",
            check: "liveness",
            checked_at: checkedAt,
          },
          meta: { correlation_id: requestCorrelationId },
        },
        { headers: responseHeaders(requestCorrelationId) },
      );
    }

    const readiness = await dependencies.readiness();

    return NextResponse.json(
      {
        data: {
          service: "ditele-v2",
          status: readiness.status,
          check: "readiness",
          checked_at: checkedAt,
          dependencies: readiness.dependencies,
        },
        meta: { correlation_id: requestCorrelationId },
      },
      {
        status: readiness.status === "ok" ? 200 : 503,
        headers: responseHeaders(requestCorrelationId),
      },
    );
  };
}

export const GET = createHealthHandler();
