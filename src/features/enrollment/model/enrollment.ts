import { z } from "zod";

import { canTransition } from "@/entities/common/state-machine";
import {
  ENROLLMENT_STATES,
  enrollmentTransitions,
} from "@/entities/enrollment/state-machine";

/** The canonical Version 2 enrollment states persisted by PostgreSQL. */
export const EnrollmentStateSchema = z.enum(ENROLLMENT_STATES);

export type EnrollmentState = z.infer<typeof EnrollmentStateSchema>;

export const EntitlementDecisionSchema = z.discriminatedUnion("eligible", [
  z.object({ eligible: z.literal(true), packageId: z.string().min(1).optional() }),
  z.object({
    eligible: z.literal(false),
    reason: z.enum(["package_required", "package_expired", "course_closed"]),
  }),
]);

export type EntitlementDecision = z.infer<typeof EntitlementDecisionSchema>;

export const EnrollmentRequestInputSchema = z.object({
  courseId: z.string().min(1),
  locale: z.enum(["en", "de", "ru"]),
  idempotencyKey: z.string().trim().min(12).max(128),
});

export type EnrollmentRequestInput = z.infer<typeof EnrollmentRequestInputSchema>;

export const EnrollmentSchema = z.object({
  id: z.string().min(1),
  learnerId: z.string().min(1),
  courseId: z.string().min(1),
  state: EnrollmentStateSchema,
  version: z.number().int().positive(),
  requestedAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  decisionReason: z.string().trim().min(1).max(600).optional(),
  groupId: z.string().min(1).optional(),
  learningPathId: z.string().min(1).optional(),
});

export type Enrollment = z.infer<typeof EnrollmentSchema>;

export const EnrollmentRequestResultSchema = z.object({
  enrollment: EnrollmentSchema,
  deduplicated: z.boolean(),
  correlationId: z.string().min(1),
});

export type EnrollmentRequestResult = z.infer<typeof EnrollmentRequestResultSchema>;

export function canTransitionEnrollment(
  from: EnrollmentState,
  to: EnrollmentState,
): boolean {
  return canTransition(enrollmentTransitions, from, to);
}
