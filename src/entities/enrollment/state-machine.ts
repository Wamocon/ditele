import type { TransitionMap } from "../common/state-machine";

export const ENROLLMENT_STATES = [
  "requested",
  "approved",
  "rejected",
  "assigned",
  "cancelled",
  "completed",
] as const;
export type EnrollmentState = (typeof ENROLLMENT_STATES)[number];

export const enrollmentTransitions = {
  requested: ["approved", "rejected", "cancelled"],
  approved: ["assigned", "cancelled"],
  rejected: [],
  assigned: ["completed", "cancelled"],
  cancelled: [],
  completed: [],
} as const satisfies TransitionMap<EnrollmentState>;

