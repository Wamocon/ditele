import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { ReadinessResult } from "@/features/operations/server/readiness";

import { createHealthHandler } from "./route";

const acceptedCorrelationId = "0198f43b-5000-7ed2-82cd-24c70ad74d90";
const generatedCorrelationId = "0198f43b-5001-7ed2-82cd-24c70ad74d90";
const checkedAt = new Date("2026-07-18T10:30:00.000Z");

const ready: ReadinessResult = {
  status: "ok",
  dependencies: {
    database: { status: "ready", latency_ms: 12 },
    optional: {
      ai: { status: "disabled" },
      labs: { status: "disabled" },
      integrations: { status: "disabled" },
    },
  },
};

function request(path = "/api/health", correlationId?: string) {
  return new Request(
    `https://app.example.test${path}`,
    correlationId ? { headers: { "x-correlation-id": correlationId } } : {},
  );
}

function handler(readiness = vi.fn(async () => ready)) {
  return {
    readiness,
    GET: createHealthHandler({
      readiness,
      now: () => checkedAt,
      createCorrelationId: () => generatedCorrelationId,
    }),
  };
}

describe("health route", () => {
  it.each(["/api/health", "/api/health?check=liveness"])(
    "serves cheap liveness for %s without touching dependencies",
    async (path) => {
      const suite = handler();

      const response = await suite.GET(request(path));

      expect(response.status).toBe(200);
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(response.headers.get("cross-origin-resource-policy")).toBe("same-origin");
      expect(response.headers.get("x-correlation-id")).toBe(generatedCorrelationId);
      await expect(response.json()).resolves.toEqual({
        data: {
          service: "ditele-v2",
          status: "ok",
          check: "liveness",
          checked_at: "2026-07-18T10:30:00.000Z",
        },
        meta: { correlation_id: generatedCorrelationId },
      });
      expect(suite.readiness).not.toHaveBeenCalled();
    },
  );

  it("returns allow-listed readiness data and preserves a valid correlation ID", async () => {
    const suite = handler();

    const response = await suite.GET(
      request("/api/health?check=readiness", acceptedCorrelationId),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("cross-origin-resource-policy")).toBe("same-origin");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("access-control-allow-origin")).toBeNull();
    expect(response.headers.get("x-correlation-id")).toBe(acceptedCorrelationId);
    await expect(response.json()).resolves.toEqual({
      data: {
        service: "ditele-v2",
        status: "ok",
        check: "readiness",
        checked_at: "2026-07-18T10:30:00.000Z",
        dependencies: ready.dependencies,
      },
      meta: { correlation_id: acceptedCorrelationId },
    });
    expect(suite.readiness).toHaveBeenCalledTimes(1);
  });

  it.each(["timeout", "unavailable", "invalid_configuration"] as const)(
    "returns 503 when database readiness is %s",
    async (databaseStatus) => {
      const degraded: ReadinessResult = {
        ...ready,
        status: "degraded",
        dependencies: {
          ...ready.dependencies,
          database: {
            status: databaseStatus,
            latency_ms: databaseStatus === "invalid_configuration" ? null : 1_500,
          },
        },
      };
      const suite = handler(vi.fn(async () => degraded));

      const response = await suite.GET(request("/api/health?check=readiness"));

      expect(response.status).toBe(503);
      expect(response.headers.get("cache-control")).toBe("no-store");
      await expect(response.json()).resolves.toMatchObject({
        data: {
          status: "degraded",
          dependencies: { database: { status: databaseStatus } },
        },
      });
    },
  );

  it("rejects an unsupported check without probing dependencies", async () => {
    const suite = handler();

    const response = await suite.GET(request("/api/health?check=database-details"));

    expect(response.status).toBe(400);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "invalid_health_check",
        message_key: "operations.health.invalid_check",
        field_errors: { check: ["unsupported"] },
        correlation_id: generatedCorrelationId,
        retryable: false,
      },
    });
    expect(suite.readiness).not.toHaveBeenCalled();
  });

  it.each([
    "not-a-uuid",
    "../../service-role-key",
    "00000000-0000-0000-0000-000000000000 extra",
  ])("replaces unsafe correlation input without reflecting it: %s", async (unsafe) => {
    const suite = handler();

    const response = await suite.GET(request("/api/health", unsafe));
    const body = await response.text();

    expect(response.headers.get("x-correlation-id")).toBe(generatedCorrelationId);
    expect(body).toContain(generatedCorrelationId);
    expect(body).not.toContain(unsafe);
  });

  it("never serializes provider failures or credentials", async () => {
    const degraded: ReadinessResult = {
      ...ready,
      status: "degraded",
      dependencies: {
        ...ready.dependencies,
        database: { status: "unavailable", latency_ms: 8 },
      },
    };
    const suite = handler(
      vi.fn(async () => {
        void "postgres://admin:secret@internal/database";
        return degraded;
      }),
    );

    const response = await suite.GET(request("/api/health?check=readiness"));
    const body = await response.text();

    expect(body).not.toMatch(/secret|internal|postgres|admin/u);
    expect(body).toContain('"status":"unavailable"');
  });
});
