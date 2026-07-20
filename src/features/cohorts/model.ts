export const COHORT_STATES = ["waiting", "active", "completed"] as const;
export type CohortState = (typeof COHORT_STATES)[number];
export type ProgressionMode = "legacy_date" | "learning_path";
export type CohortPermission =
  | "cohort:read"
  | "cohort:create"
  | "cohort:write"
  | "cohort:change_state"
  | "cohort:change_schedule"
  | "cohort:manage_members"
  | "cohort:duplicate"
  | "cohort:delete";

export interface CohortPrincipal {
  readonly userId: string;
  readonly organizationId: string;
  readonly role: "trainer" | "admin";
  readonly permissions: readonly CohortPermission[];
  readonly assignedCohortIds: readonly string[];
}

export interface CohortMember {
  readonly userId: string;
  readonly displayName: string;
  readonly role: "learner" | "trainer";
  readonly status: "active" | "removed";
  readonly joinedAt: string;
  readonly removedAt?: string;
  readonly completedTaskCount: number;
}

export interface TaskActivation {
  readonly taskId: string;
  readonly activateAt: string;
  readonly updatedAt: string;
  readonly updatedBy: string;
}

export interface Cohort {
  readonly id: string;
  readonly organizationId: string;
  readonly courseId: string;
  readonly courseVersionId: string;
  readonly name: { readonly en: string; readonly de: string; readonly ru: string };
  readonly state: CohortState;
  readonly progressionMode: ProgressionMode;
  readonly version: number;
  readonly capacity?: number;
  readonly members: readonly CohortMember[];
  readonly taskActivations: readonly TaskActivation[];
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly startedAt?: string;
  readonly completedAt?: string;
}

export interface CohortAuditRequest {
  readonly eventName: string;
  readonly actorId: string;
  readonly organizationId: string;
  readonly resourceType: "cohort";
  readonly resourceId: string;
  readonly correlationId: string;
  readonly metadata: Readonly<Record<string, string | number | boolean>>;
}

export interface CohortNotificationRequest {
  readonly recipientIds: readonly string[];
  readonly template: "cohort_started" | "cohort_completed" | "cohort_membership_changed";
  readonly idempotencyKey: string;
  readonly variables: Readonly<Record<string, string>>;
}

export interface CohortEffects {
  readonly audit: CohortAuditRequest;
  readonly notification?: CohortNotificationRequest;
}

export interface CohortStateCommand {
  readonly cohortId: string;
  readonly expectedVersion: number;
  readonly toState: CohortState;
  readonly actorId: string;
  readonly idempotencyKey: string;
}

export interface CohortScheduleCommand {
  readonly cohortId: string;
  readonly expectedVersion: number;
  readonly taskId: string;
  readonly activateAt: string;
  readonly actorId: string;
  readonly idempotencyKey: string;
}

export interface DuplicateCohortCommand {
  readonly cohortId: string;
  readonly expectedVersion: number;
  readonly newName: Cohort["name"];
  readonly includeTrainers: boolean;
  readonly includeLearners: boolean;
  readonly actorId: string;
  readonly idempotencyKey: string;
}

export interface ChangeMembershipCommand {
  readonly cohortId: string;
  readonly expectedVersion: number;
  readonly userId: string;
  readonly role: CohortMember["role"];
  readonly operation: "assign" | "remove";
  readonly actorId: string;
  readonly idempotencyKey: string;
  readonly impactFingerprint?: string;
}

export interface CohortCommandPort {
  getCohort(cohortId: string): Promise<Cohort | null>;
  /** All mutation methods must compare-and-set expectedVersion and persist effects atomically. */
  changeState(command: CohortStateCommand, effects: CohortEffects): Promise<Cohort>;
  changeTaskActivation(command: CohortScheduleCommand, effects: CohortEffects): Promise<Cohort>;
  duplicate(command: DuplicateCohortCommand, effects: CohortEffects): Promise<Cohort>;
  changeMembership(command: ChangeMembershipCommand, effects: CohortEffects): Promise<Cohort>;
}
