import { describe, expect, it } from "vitest";

import {
  InvalidStateTransitionError,
  assertTransition,
  canTransition,
} from "@/entities/common/state-machine";
import {
  UnknownLegacyStateError,
  mapLegacyCohortState,
  mapLegacyQuestionState,
  mapLegacySubmissionState,
} from "@/entities/common/legacy-state-mapper";
import { cohortTransitions } from "@/entities/cohort/state-machine";
import { submissionTransitions } from "@/entities/submission/state-machine";

describe("named domain state machines", () => {
  it("allows only declared cohort transitions", () => {
    expect(canTransition(cohortTransitions, "waiting", "active")).toBe(true);
    expect(canTransition(cohortTransitions, "completed", "active")).toBe(false);
    expect(() =>
      assertTransition("cohort", cohortTransitions, "completed", "active"),
    ).toThrow(InvalidStateTransitionError);
  });

  it("models revision and resubmission explicitly", () => {
    expect(
      canTransition(submissionTransitions, "submitted", "revision_required"),
    ).toBe(true);
    expect(
      canTransition(submissionTransitions, "revision_required", "resubmitted"),
    ).toBe(true);
    expect(canTransition(submissionTransitions, "accepted", "resubmitted")).toBe(
      false,
    );
  });
});

describe("legacy numeric compatibility boundary", () => {
  it("maps verified legacy values to canonical names", () => {
    expect(mapLegacyCohortState(null)).toBe("waiting");
    expect(mapLegacyCohortState(1)).toBe("active");
    expect(mapLegacySubmissionState(2)).toBe("revision_required");
    expect(mapLegacyQuestionState(false, true)).toBe("assigned");
  });

  it("fails closed for unknown legacy states", () => {
    expect(() => mapLegacyCohortState(7)).toThrow(UnknownLegacyStateError);
    expect(() => mapLegacySubmissionState("1")).toThrow(
      UnknownLegacyStateError,
    );
  });
});

