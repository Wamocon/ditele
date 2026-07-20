import { describe, expect, it } from "vitest";

import {
  EnrollmentSchema,
  EnrollmentStateSchema,
  canTransitionEnrollment,
  type EnrollmentState,
} from "./enrollment";

const enrollment = {
  id: "enrollment-1",
  learnerId: "learner-1",
  courseId: "course-1",
  state: "requested",
  version: 1,
  requestedAt: "2026-07-17T08:00:00.000Z",
  updatedAt: "2026-07-17T08:00:00.000Z",
};

const expectedTransitions: Readonly<
  Record<EnrollmentState, readonly EnrollmentState[]>
> = {
  requested: ["approved", "rejected", "cancelled"],
  approved: ["assigned", "cancelled"],
  rejected: [],
  assigned: ["completed", "cancelled"],
  cancelled: [],
  completed: [],
};

describe("enrollment state machine", () => {
  it("matches every canonical database state", () => {
    expect(EnrollmentStateSchema.options).toEqual([
      "requested",
      "approved",
      "rejected",
      "assigned",
      "cancelled",
      "completed",
    ]);
    expect(EnrollmentSchema.parse(enrollment).state).toBe("requested");
  });

  it("matches the complete database transition graph without extra edges", () => {
    for (const from of EnrollmentStateSchema.options) {
      for (const to of EnrollmentStateSchema.options) {
        expect(canTransitionEnrollment(from, to), `${from} -> ${to}`).toBe(
          expectedTransitions[from].includes(to),
        );
      }
    }
  });

  it("keeps terminal decisions terminal", () => {
    expect(canTransitionEnrollment("completed", "requested")).toBe(false);
    expect(canTransitionEnrollment("rejected", "approved")).toBe(false);
    expect(canTransitionEnrollment("cancelled", "requested")).toBe(false);
  });

  it.each(["pending", "waitlisted", "declined", "unknown"])(
    "rejects the non-canonical state %s",
    (state) => {
      expect(EnrollmentStateSchema.safeParse(state).success).toBe(false);
      expect(EnrollmentSchema.safeParse({ ...enrollment, state }).success).toBe(false);
    },
  );
});
