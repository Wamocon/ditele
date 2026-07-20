import { z } from "zod";

import { CohortError } from "./errors";
import { assertCohortTransition } from "./lifecycle";
import type {
  Cohort,
  CohortAuditRequest,
  CohortCommandPort,
  CohortEffects,
  CohortPermission,
  CohortPrincipal,
  CohortState,
} from "./model";

const baseSchema = z.object({
  cohortId: z.string().min(1),
  expectedVersion: z.number().int().nonnegative(),
  idempotencyKey: z.string().min(8).max(200),
  correlationId: z.string().min(8).max(200),
});
const stateSchema = baseSchema.extend({ toState: z.enum(["waiting", "active", "completed"]) });
const scheduleSchema = baseSchema.extend({
  taskId: z.string().min(1),
  activateAt: z.string().datetime({ offset: true }),
});
const duplicateSchema = baseSchema.extend({
  newName: z.object({
    en: z.string().trim().min(1).max(200),
    de: z.string().trim().min(1).max(200),
    ru: z.string().trim().min(1).max(200),
  }),
  includeTrainers: z.boolean(),
  includeLearners: z.boolean(),
});
const membershipSchema = baseSchema.extend({
  userId: z.string().min(1),
  role: z.enum(["learner", "trainer"]),
  operation: z.enum(["assign", "remove"]),
  impactFingerprint: z.string().min(8).max(500).optional(),
});

export interface CohortServiceOptions {
  readonly learningPathEnabled: boolean;
}

function assertPermission(
  principal: CohortPrincipal,
  cohort: Cohort,
  permission: CohortPermission,
): void {
  const inOrganization = principal.organizationId === cohort.organizationId;
  const inResourceScope = principal.role === "admin"
    || principal.assignedCohortIds.includes(cohort.id);
  if (!inOrganization || !inResourceScope || !principal.permissions.includes(permission)) {
    throw new CohortError(
      "COHORT_FORBIDDEN",
      "The current user is not authorized for this cohort resource.",
    );
  }
}

function assertVersion(cohort: Cohort, expectedVersion: number): void {
  if (cohort.version !== expectedVersion) {
    throw new CohortError(
      "COHORT_VERSION_CONFLICT",
      "The cohort changed after it was opened.",
      { expectedVersion, actualVersion: cohort.version },
    );
  }
}

function audit(input: {
  readonly principal: CohortPrincipal;
  readonly cohort: Cohort;
  readonly eventName: string;
  readonly correlationId: string;
  readonly metadata: Readonly<Record<string, string | number | boolean>>;
}): CohortAuditRequest {
  return {
    eventName: input.eventName,
    actorId: input.principal.userId,
    organizationId: input.principal.organizationId,
    resourceType: "cohort",
    resourceId: input.cohort.id,
    correlationId: input.correlationId,
    metadata: input.metadata,
  };
}

function activeMemberIds(cohort: Cohort): readonly string[] {
  return cohort.members
    .filter((member) => member.status === "active")
    .map((member) => member.userId);
}

export class CohortService {
  constructor(
    private readonly port: CohortCommandPort,
    private readonly options: CohortServiceOptions,
  ) {}

  async changeState(principal: CohortPrincipal, rawInput: unknown): Promise<Cohort> {
    const input = stateSchema.safeParse(rawInput);
    if (!input.success) {
      throw new CohortError("COHORT_INVALID_INPUT", "The lifecycle command is invalid.");
    }
    const cohort = await this.requireCohort(input.data.cohortId);
    assertPermission(principal, cohort, "cohort:change_state");
    assertVersion(cohort, input.data.expectedVersion);
    assertCohortTransition(cohort, input.data.toState as CohortState);
    if (cohort.progressionMode === "learning_path" && !this.options.learningPathEnabled) {
      throw new CohortError(
        "COHORT_FEATURE_DISABLED",
        "Learning-path cohort progression is not enabled.",
      );
    }

    const effects: CohortEffects = {
      audit: audit({
        principal,
        cohort,
        eventName: `cohort.${input.data.toState}`,
        correlationId: input.data.correlationId,
        metadata: {
          fromState: cohort.state,
          toState: input.data.toState,
          progressionMode: cohort.progressionMode,
          expectedVersion: input.data.expectedVersion,
        },
      }),
      notification: {
        recipientIds: activeMemberIds(cohort),
        template: input.data.toState === "active" ? "cohort_started" : "cohort_completed",
        idempotencyKey: `${input.data.idempotencyKey}:notification`,
        variables: { cohortId: cohort.id },
      },
    };
    return this.port.changeState(
      {
        cohortId: cohort.id,
        expectedVersion: input.data.expectedVersion,
        toState: input.data.toState,
        actorId: principal.userId,
        idempotencyKey: input.data.idempotencyKey,
      },
      effects,
    );
  }

  async changeTaskActivation(principal: CohortPrincipal, rawInput: unknown): Promise<Cohort> {
    const input = scheduleSchema.safeParse(rawInput);
    if (!input.success) {
      throw new CohortError("COHORT_INVALID_INPUT", "The activation command is invalid.");
    }
    const cohort = await this.requireCohort(input.data.cohortId);
    assertPermission(principal, cohort, "cohort:change_schedule");
    assertVersion(cohort, input.data.expectedVersion);
    if (cohort.state === "completed") {
      throw new CohortError(
        "COHORT_INVALID_TRANSITION",
        "Task activation dates cannot be changed after completion.",
      );
    }
    return this.port.changeTaskActivation(
      {
        cohortId: cohort.id,
        expectedVersion: input.data.expectedVersion,
        taskId: input.data.taskId,
        activateAt: input.data.activateAt,
        actorId: principal.userId,
        idempotencyKey: input.data.idempotencyKey,
      },
      {
        audit: audit({
          principal,
          cohort,
          eventName: "cohort.task_activation_changed",
          correlationId: input.data.correlationId,
          metadata: {
            taskId: input.data.taskId,
            activateAt: input.data.activateAt,
            expectedVersion: input.data.expectedVersion,
          },
        }),
      },
    );
  }

  async duplicate(principal: CohortPrincipal, rawInput: unknown): Promise<Cohort> {
    const input = duplicateSchema.safeParse(rawInput);
    if (!input.success) {
      throw new CohortError("COHORT_INVALID_INPUT", "The duplicate command is invalid.");
    }
    const cohort = await this.requireCohort(input.data.cohortId);
    assertPermission(principal, cohort, "cohort:duplicate");
    assertVersion(cohort, input.data.expectedVersion);
    if (principal.role !== "admin") {
      throw new CohortError("COHORT_FORBIDDEN", "Only an administrator may duplicate a cohort.");
    }
    return this.port.duplicate(
      {
        cohortId: cohort.id,
        expectedVersion: input.data.expectedVersion,
        newName: input.data.newName,
        includeTrainers: input.data.includeTrainers,
        includeLearners: input.data.includeLearners,
        actorId: principal.userId,
        idempotencyKey: input.data.idempotencyKey,
      },
      {
        audit: audit({
          principal,
          cohort,
          eventName: "cohort.duplicated",
          correlationId: input.data.correlationId,
          metadata: {
            includeTrainers: input.data.includeTrainers,
            includeLearners: input.data.includeLearners,
            expectedVersion: input.data.expectedVersion,
          },
        }),
      },
    );
  }

  async changeMembership(principal: CohortPrincipal, rawInput: unknown): Promise<Cohort> {
    const input = membershipSchema.safeParse(rawInput);
    if (!input.success) {
      throw new CohortError("COHORT_INVALID_INPUT", "The membership command is invalid.");
    }
    const cohort = await this.requireCohort(input.data.cohortId);
    assertPermission(principal, cohort, "cohort:manage_members");
    assertVersion(cohort, input.data.expectedVersion);
    if (principal.role !== "admin") {
      throw new CohortError("COHORT_FORBIDDEN", "Only an administrator may change membership.");
    }

    const existingMember = cohort.members.find(
      (member) => member.userId === input.data.userId && member.role === input.data.role,
    );
    if (input.data.operation === "remove" && !existingMember) {
      throw new CohortError("COHORT_INVALID_INPUT", "The selected member is not in the cohort.");
    }
    if (input.data.operation === "assign" && existingMember?.status === "active") {
      throw new CohortError("COHORT_INVALID_INPUT", "The selected member is already assigned.");
    }
    if (
      input.data.operation === "remove"
      && input.data.role === "trainer"
      && cohort.state === "active"
      && cohort.members.filter(
        (member) => member.role === "trainer" && member.status === "active",
      ).length === 1
    ) {
      throw new CohortError(
        "COHORT_INVALID_TRANSITION",
        "The last trainer cannot be removed from an active cohort.",
      );
    }
    if (
      input.data.operation === "remove"
      && existingMember
      && existingMember.completedTaskCount > 0
      && input.data.impactFingerprint !== `${cohort.id}:${existingMember.userId}:${existingMember.completedTaskCount}`
    ) {
      throw new CohortError(
        "COHORT_IMPACT_CONFIRMATION_REQUIRED",
        "Removing a learner with progress requires an impact confirmation.",
      );
    }

    return this.port.changeMembership(
      {
        cohortId: cohort.id,
        expectedVersion: input.data.expectedVersion,
        userId: input.data.userId,
        role: input.data.role,
        operation: input.data.operation,
        actorId: principal.userId,
        idempotencyKey: input.data.idempotencyKey,
        ...(input.data.impactFingerprint === undefined
          ? {}
          : { impactFingerprint: input.data.impactFingerprint }),
      },
      {
        audit: audit({
          principal,
          cohort,
          eventName: `cohort.member_${input.data.operation}ed`,
          correlationId: input.data.correlationId,
          metadata: {
            memberId: input.data.userId,
            memberRole: input.data.role,
            expectedVersion: input.data.expectedVersion,
          },
        }),
        notification: {
          recipientIds: [input.data.userId],
          template: "cohort_membership_changed",
          idempotencyKey: `${input.data.idempotencyKey}:notification`,
          variables: { cohortId: cohort.id, operation: input.data.operation },
        },
      },
    );
  }

  private async requireCohort(cohortId: string): Promise<Cohort> {
    const cohort = await this.port.getCohort(cohortId);
    if (!cohort) {
      throw new CohortError("COHORT_NOT_FOUND", "The cohort does not exist.");
    }
    return cohort;
  }
}
