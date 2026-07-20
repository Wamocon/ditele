import { describe, expect, it, vi } from "vitest";

import {
  EnrollmentError,
  requestEnrollment,
  type EnrollmentPolicyPort,
  type EnrollmentRepository,
} from "./enrollment-service";

const validResult = {
  enrollment: {
    id: "enrollment-1",
    learnerId: "learner-1",
    courseId: "course-1",
    state: "requested",
    version: 1,
    requestedAt: "2026-07-17T08:00:00.000Z",
    updatedAt: "2026-07-17T08:00:00.000Z",
  },
  deduplicated: false,
  correlationId: "correlation-1",
};

describe("requestEnrollment", () => {
  it("derives learner identity from the server principal", async () => {
    const request = vi.fn(async () => validResult);
    const policy: EnrollmentPolicyPort = {
      checkEntitlement: async () => ({ eligible: true }),
    };

    await requestEnrollment(
      { policy, repository: { request } },
      { id: "learner-1", role: "learner" },
      { courseId: "course-1", locale: "en", idempotencyKey: "request-key-0001" },
    );

    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({ learnerId: "learner-1" }),
    );
  });

  it("never reaches persistence for an unauthorized role", async () => {
    const repository: EnrollmentRepository = { request: vi.fn() };
    const policy: EnrollmentPolicyPort = { checkEntitlement: vi.fn() };

    await expect(
      requestEnrollment(
        { policy, repository },
        { id: "trainer-1", role: "trainer" },
        { courseId: "course-1", locale: "en", idempotencyKey: "request-key-0001" },
      ),
    ).rejects.toEqual(new EnrollmentError("enrollment.forbidden"));
    expect(repository.request).not.toHaveBeenCalled();
  });

  it("blocks requests when the package check fails", async () => {
    const repository: EnrollmentRepository = { request: vi.fn() };
    const policy: EnrollmentPolicyPort = {
      checkEntitlement: async () => ({ eligible: false, reason: "package_required" }),
    };

    await expect(
      requestEnrollment(
        { policy, repository },
        { id: "learner-1", role: "learner" },
        { courseId: "course-1", locale: "de", idempotencyKey: "request-key-0001" },
      ),
    ).rejects.toMatchObject({ code: "enrollment.package_required" });
  });

  it.each(["pending", "waitlisted", "unknown"])(
    "fails closed when persistence returns the non-canonical state %s",
    async (state) => {
      const repository: EnrollmentRepository = {
        request: vi.fn(async () => ({
          ...validResult,
          enrollment: { ...validResult.enrollment, state },
        })),
      };
      const policy: EnrollmentPolicyPort = {
        checkEntitlement: async () => ({ eligible: true }),
      };

      await expect(
        requestEnrollment(
          { policy, repository },
          { id: "learner-1", role: "learner" },
          {
            courseId: "course-1",
            locale: "en",
            idempotencyKey: "request-key-0001",
          },
        ),
      ).rejects.toThrow();
    },
  );
});
