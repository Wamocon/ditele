import type { TransitionMap } from "../common/state-machine";

export const COHORT_STATES = ["waiting", "active", "completed", "cancelled"] as const;
export type CohortState = (typeof COHORT_STATES)[number];

export const cohortTransitions = {
  waiting: ["active", "cancelled"],
  active: ["completed", "cancelled"],
  completed: [],
  cancelled: [],
} as const satisfies TransitionMap<CohortState>;

