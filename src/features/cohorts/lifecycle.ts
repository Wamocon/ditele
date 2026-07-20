import { CohortError } from "./errors";
import type { Cohort, CohortState } from "./model";

const ALLOWED_TRANSITIONS: Readonly<Record<CohortState, readonly CohortState[]>> = {
  waiting: ["active"],
  active: ["completed"],
  completed: [],
};

export function assertCohortTransition(cohort: Cohort, toState: CohortState): void {
  if (!ALLOWED_TRANSITIONS[cohort.state].includes(toState)) {
    throw new CohortError(
      "COHORT_INVALID_TRANSITION",
      `Cohort cannot transition from ${cohort.state} to ${toState}.`,
    );
  }

  if (toState === "active") {
    const activeTrainers = cohort.members.filter(
      (member) => member.role === "trainer" && member.status === "active",
    );
    const activeLearners = cohort.members.filter(
      (member) => member.role === "learner" && member.status === "active",
    );
    if (activeTrainers.length === 0 || activeLearners.length === 0) {
      throw new CohortError(
        "COHORT_INVALID_TRANSITION",
        "A cohort needs at least one trainer and learner before it can start.",
      );
    }
  }
}
