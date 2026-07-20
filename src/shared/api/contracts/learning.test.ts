import { describe, expect, it } from "vitest";

import {
  enrollmentApiStateSchema,
  enrollmentSchema,
} from "./learning";

const uuid = "01980a20-0000-7000-8000-000000000001";
const enrollment = {
  id: uuid,
  courseId: uuid,
  cohortId: null,
  state: "requested",
  version: 1,
  createdAt: "2026-07-17T08:00:00.000Z",
  updatedAt: "2026-07-17T08:00:00.000Z",
};

describe("canonical enrollment API state contract", () => {
  it("exposes exactly the Version 2 database states", () => {
    expect(enrollmentApiStateSchema.options).toEqual([
      "requested",
      "approved",
      "rejected",
      "assigned",
      "cancelled",
      "completed",
    ]);
    expect(enrollmentSchema.parse(enrollment).state).toBe("requested");
  });

  it.each(["pending", "waitlisted", "declined", "unknown"])(
    "fails closed for the non-canonical state %s",
    (state) => {
      expect(enrollmentApiStateSchema.safeParse(state).success).toBe(false);
      expect(enrollmentSchema.safeParse({ ...enrollment, state }).success).toBe(false);
    },
  );
});
