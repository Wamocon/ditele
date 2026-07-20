import {
  EnrollmentRequestInputSchema,
  EnrollmentRequestResultSchema,
  EntitlementDecisionSchema,
  type EnrollmentRequestInput,
  type EnrollmentRequestResult,
  type EntitlementDecision,
} from "../model/enrollment";

export interface EnrollmentPrincipal {
  id: string;
  role: "guest" | "learner" | "trainer" | "admin" | "organization_admin";
}

export interface EnrollmentPolicyPort {
  checkEntitlement(actorId: string, courseId: string): Promise<unknown>;
}

export interface EnrollmentRepository {
  request(input: EnrollmentRequestInput & { learnerId: string }): Promise<unknown>;
}

export class EnrollmentError extends Error {
  constructor(
    readonly code:
      | "enrollment.authentication_required"
      | "enrollment.forbidden"
      | "enrollment.package_required"
      | "enrollment.package_expired"
      | "enrollment.course_closed",
  ) {
    super(code);
    this.name = "EnrollmentError";
  }
}

function assertLearner(principal: EnrollmentPrincipal | null): asserts principal is EnrollmentPrincipal {
  if (!principal) {
    throw new EnrollmentError("enrollment.authentication_required");
  }
  if (principal.role !== "learner") {
    throw new EnrollmentError("enrollment.forbidden");
  }
}

function assertEligible(
  decision: EntitlementDecision,
): asserts decision is Extract<EntitlementDecision, { eligible: true }> {
  if (!decision.eligible) {
    throw new EnrollmentError(`enrollment.${decision.reason}`);
  }
}

export async function requestEnrollment(
  dependencies: {
    policy: EnrollmentPolicyPort;
    repository: EnrollmentRepository;
  },
  principal: EnrollmentPrincipal | null,
  input: unknown,
): Promise<EnrollmentRequestResult> {
  assertLearner(principal);
  const request = EnrollmentRequestInputSchema.parse(input);
  const entitlement = EntitlementDecisionSchema.parse(
    await dependencies.policy.checkEntitlement(principal.id, request.courseId),
  );
  assertEligible(entitlement);

  const result = await dependencies.repository.request({
    ...request,
    learnerId: principal.id,
  });

  return EnrollmentRequestResultSchema.parse(result);
}
