import { describe, expect, it } from "vitest";

import {
  CERTIFICATE_STATES,
  certificateTransitions,
} from "@/entities/certificate/state-machine";
import { COHORT_STATES, cohortTransitions } from "@/entities/cohort/state-machine";
import {
  InvalidStateTransitionError,
  assertTransition,
  canTransition,
} from "@/entities/common/state-machine";
import {
  UnknownLegacyStateError,
  assertCanonicalCertificateState,
  mapLegacyCertificateType,
  mapLegacyCohortState,
  mapLegacyQuestionState,
  mapLegacySubmissionState,
} from "@/entities/common/legacy-state-mapper";
import {
  CONTENT_VERSION_STATES,
  contentVersionTransitions,
} from "@/entities/content/state-machine";
import {
  ENROLLMENT_STATES,
  enrollmentTransitions,
} from "@/entities/enrollment/state-machine";
import {
  DELIVERY_STATES,
  deliveryTransitions,
} from "@/entities/integration/state-machine";
import { LAB_SESSION_STATES, labSessionTransitions } from "@/entities/lab/state-machine";
import { PRIVACY_REQUEST_STATES, privacyRequestTransitions } from "@/entities/privacy/state-machine";
import { QUESTION_STATES, questionTransitions } from "@/entities/question/state-machine";
import {
  SUBMISSION_STATES,
  submissionTransitions,
} from "@/entities/submission/state-machine";

describe("canonical state machines", () => {
  it("exposes every named lifecycle and its permitted forward transitions", () => {
    expect(CERTIFICATE_STATES).toEqual(["eligible", "issued", "available", "revoked", "expired"]);
    expect(COHORT_STATES).toEqual(["waiting", "active", "completed", "cancelled"]);
    expect(CONTENT_VERSION_STATES).toEqual(["draft", "in_review", "published", "archived"]);
    expect(ENROLLMENT_STATES).toContain("assigned");
    expect(DELIVERY_STATES).toContain("dead_letter");
    expect(LAB_SESSION_STATES).toContain("destroyed");
    expect(PRIVACY_REQUEST_STATES).toEqual(["requested", "processing", "completed", "rejected", "cancelled"]);
    expect(QUESTION_STATES).toContain("transferred");
    expect(SUBMISSION_STATES).toContain("revision_required");

    expect(certificateTransitions.issued).toEqual(["available", "revoked"]);
    expect(cohortTransitions.waiting).toEqual(["active", "cancelled"]);
    expect(contentVersionTransitions.in_review).toContain("published");
    expect(enrollmentTransitions.approved).toContain("assigned");
    expect(deliveryTransitions.dead_letter).toEqual(["retry_scheduled"]);
    expect(labSessionTransitions.active).toContain("validating");
    expect(privacyRequestTransitions.requested).toEqual(["processing", "rejected", "cancelled"]);
    expect(questionTransitions.transferred).toContain("answered");
    expect(submissionTransitions.revision_required).toEqual(["resubmitted"]);
  });

  it("accepts declared transitions and rejects invalid or terminal transitions", () => {
    expect(canTransition(cohortTransitions, "waiting", "active")).toBe(true);
    expect(canTransition(cohortTransitions, "completed", "active")).toBe(false);
    expect(() => assertTransition("cohort", cohortTransitions, "active", "completed")).not.toThrow();
    expect(() => assertTransition("cohort", cohortTransitions, "completed", "active")).toThrow(
      InvalidStateTransitionError,
    );

    try {
      assertTransition("cohort", cohortTransitions, "completed", "active");
    } catch (error) {
      expect(error).toMatchObject({
        name: "InvalidStateTransitionError",
        machine: "cohort",
        from: "completed",
        to: "active",
      });
    }
  });
});

describe("legacy status compatibility boundary", () => {
  it("maps every verified legacy numeric and nullable state", () => {
    expect(mapLegacyCohortState(null)).toBe("waiting");
    expect(mapLegacyCohortState(1)).toBe("active");
    expect(mapLegacyCohortState(0)).toBe("completed");

    expect(mapLegacySubmissionState(undefined)).toBe("draft");
    expect(mapLegacySubmissionState(null)).toBe("draft");
    expect(mapLegacySubmissionState(0)).toBe("submitted");
    expect(mapLegacySubmissionState(1)).toBe("accepted");
    expect(mapLegacySubmissionState(2)).toBe("revision_required");

    expect(mapLegacyQuestionState(true, false)).toBe("answered");
    expect(mapLegacyQuestionState(false, true)).toBe("assigned");
    expect(mapLegacyQuestionState(false, false)).toBe("open");
    expect(mapLegacyCertificateType(0)).toBe("course_completion");
    expect(mapLegacyCertificateType(1)).toBe("exam");
    expect(assertCanonicalCertificateState("available")).toBe("available");
  });

  it.each([
    ["cohort", () => mapLegacyCohortState(3)],
    ["submission", () => mapLegacySubmissionState(3)],
    ["question", () => mapLegacyQuestionState(null, false)],
    ["certificate type", () => mapLegacyCertificateType(2)],
    ["certificate state", () => assertCanonicalCertificateState("unknown")],
  ])("fails closed for an unknown %s value", (_label, operation) => {
    expect(operation).toThrow(UnknownLegacyStateError);
  });
});
