import { z } from "zod";

import { canTransition } from "@/entities/common/state-machine";
import { labSessionTransitions } from "@/entities/lab/state-machine";
import type { Principal } from "@/shared/auth/types";

import {
  AccessLabInputSchema,
  CleanupPendingLabInputSchema,
  DestroyLabInputSchema,
  LabAccessGrantSchema,
  LabAccessLeaseSchema,
  LabProviderAvailabilitySchema,
  LabProviderEffectSchema,
  LabProviderHealthSchema,
  LabProvisionOperationStatusSchema,
  LabScenarioSchema,
  LabScenarioSnapshotSchema,
  LabSessionSchema,
  LabValidationBatchSchema,
  LabValidationResultSchema,
  ResetLabInputSchema,
  StartLabInputSchema,
  ValidateLabInputSchema,
  type AccessLabInput,
  type CleanupPendingLabInput,
  type DestroyLabInput,
  type LabAccessGrant,
  type LabAccessLease,
  type LabProviderAvailability,
  type LabProvisionOperationStatus,
  type LabProvisionResult,
  type LabScenario,
  type LabScenarioSnapshot,
  type LabSession,
  type LabSessionState,
  type LabValidationResult,
  type ResetLabInput,
  type StartLabInput,
  type ValidateLabInput,
} from "./model";

export type LabDomainErrorCode =
  | "labs.forbidden"
  | "labs.entitlement_required"
  | "labs.provider_unavailable"
  | "labs.invalid_command"
  | "labs.invalid_transition"
  | "labs.invalid_access_grant"
  | "labs.invalid_entitlement_decision"
  | "labs.invalid_provider_response"
  | "labs.invalid_repository_response"
  | "labs.invalid_scenario_contract"
  | "labs.invalid_session_contract"
  | "labs.invalid_validation_result"
  | "labs.idempotency_conflict"
  | "labs.stale_session"
  | "labs.health_check_failed"
  | "labs.provision_outcome_pending"
  | "labs.provision_failed"
  | "labs.cleanup_in_progress";

const LabDomainErrorCodeSchema = z.enum([
  "labs.forbidden",
  "labs.entitlement_required",
  "labs.provider_unavailable",
  "labs.invalid_command",
  "labs.invalid_transition",
  "labs.invalid_access_grant",
  "labs.invalid_entitlement_decision",
  "labs.invalid_provider_response",
  "labs.invalid_repository_response",
  "labs.invalid_scenario_contract",
  "labs.invalid_session_contract",
  "labs.invalid_validation_result",
  "labs.idempotency_conflict",
  "labs.stale_session",
  "labs.health_check_failed",
  "labs.provision_outcome_pending",
  "labs.provision_failed",
  "labs.cleanup_in_progress",
]);

export class LabDomainError extends Error {
  constructor(
    readonly code: LabDomainErrorCode,
    readonly details?: LabProviderAvailability,
  ) {
    super(code);
    this.name = "LabDomainError";
  }
}

const commandKeySchema = z.string().trim().min(12).max(128);
const requestCommon = {
  key: commandKeySchema,
  actorId: z.string().trim().min(1).max(160),
  organizationId: z.string().trim().min(1).max(160),
  scenarioSnapshot: LabScenarioSnapshotSchema,
};
const sessionRequestCommon = {
  ...requestCommon,
  sessionId: z.string().trim().min(1).max(160),
  expectedVersion: z.number().int().positive(),
};

const LabCommandRequestSchema = z.discriminatedUnion("operation", [
  z.object({ operation: z.literal("start"), ...requestCommon }).strict(),
  z.object({
    operation: z.enum(["access", "reset", "validate", "destroy"]),
    ...sessionRequestCommon,
  }).strict(),
  z.object({
    operation: z.literal("cleanup"),
    ...sessionRequestCommon,
    targetCommandKey: commandKeySchema,
    reason: z.enum(["authorization_revoked", "entitlement_revoked", "session_abandoned", "operator_reconciliation"]),
  }).strict(),
]);
export type LabCommandRequest = z.infer<typeof LabCommandRequestSchema>;

const LabCommandIntentSchema = z.discriminatedUnion("operation", [
  z.object({
    operation: z.literal("start"),
    ...requestCommon,
    sourceSession: z.null(),
  }).strict(),
  z.object({
    operation: z.enum(["access", "reset", "validate", "destroy"]),
    ...sessionRequestCommon,
    sourceSession: LabSessionSchema,
  }).strict(),
  z.object({
    operation: z.literal("cleanup"),
    ...sessionRequestCommon,
    targetCommandKey: commandKeySchema,
    reason: z.enum(["authorization_revoked", "entitlement_revoked", "session_abandoned", "operator_reconciliation"]),
    sourceSession: LabSessionSchema,
  }).strict(),
]);
export type LabCommandIntent = z.infer<typeof LabCommandIntentSchema>;

const LabSourceCommandSchema = z.object({
  intent: LabCommandIntentSchema,
  providerOperationKey: z.string().trim().min(1).max(200),
  createdAt: z.string().datetime(),
}).strict();
export type LabSourceCommand = z.infer<typeof LabSourceCommandSchema>;

const LabCommandRecordSchema = z.object({
  intent: LabCommandIntentSchema,
  status: z.enum(["pending", "completed"]),
  providerOperationKey: z.string().trim().min(1).max(200),
  session: z.unknown(),
  output: z.unknown().nullable(),
  leaseToRevoke: z.unknown().nullable(),
  failureCode: LabDomainErrorCodeSchema.nullable(),
  createdAt: z.string().datetime(),
  sourceCommand: z.unknown().nullable(),
}).strict();

export type LabCommandRecord = Readonly<{
  intent: LabCommandIntent;
  status: "pending" | "completed";
  providerOperationKey: string;
  session: LabSession;
  output: unknown | null;
  leaseToRevoke: LabAccessLease | null;
  failureCode: LabDomainErrorCode | null;
  createdAt: string;
  sourceCommand: LabSourceCommand | null;
}>;

export interface LabRepository {
  getScenario(input: { scenarioId: string; version: number }): Promise<unknown>;
  getSession(id: string): Promise<unknown>;
  /** Atomically inserts an exact-version start intent and immutable requested session with requestedAt = receipt createdAt, or replays its exact key. */
  beginStartCommand(input: {
    request: Extract<LabCommandRequest, { operation: "start" }>;
  }): Promise<unknown>;
  /**
   * For a new command, atomically compares the complete sourceSession, checks
   * expiry/lease preconditions against database time, inserts the durable
   * intent, revokes the lease when requested, and applies the pending state.
   * An exact existing key resumes from its persisted record and creation-time
   * validity; different payloads and competing aggregate commands conflict.
   * A failed session without a provider may be atomically completed as
   * destroyed when nullProviderFinalState is set.
   */
  beginSessionCommand(input: {
    request: Extract<LabCommandRequest, { operation: "access" | "reset" | "validate" | "destroy" }>;
    sourceSession: LabSession;
    allowedSourceStates: readonly LabSessionState[];
    pendingState: LabSessionState | null;
    revokeLeaseOnBegin: boolean;
    preconditions: {
      requireUnexpiredSession: boolean;
      requireActiveLease: boolean;
    };
    nullProviderFinalState: "destroyed" | null;
  }): Promise<unknown>;
  /**
   * Atomically takes ownership of the exact pending target command, prevents
   * its original actor from continuing it, and creates a cleanup receipt that
   * carries the original provider operation key/source command.
   */
  beginCleanupTakeover(input: {
    request: Extract<LabCommandRequest, { operation: "cleanup" }>;
    sourceSession: LabSession;
  }): Promise<unknown>;
  /** CAS-persist progress only if the full previous aggregate and intent still match. */
  savePendingCommand(input: {
    intent: LabCommandIntent;
    previousSession: LabSession;
    session: LabSession;
  }): Promise<unknown>;
  /** Atomically persists the exact terminal aggregate, output and durable receipt. */
  completeCommand(input: {
    intent: LabCommandIntent;
    previousSession: LabSession;
    session: LabSession;
    output: unknown | null;
    failureCode: LabDomainErrorCode | null;
  }): Promise<unknown>;
}

export interface LabEntitlementPolicy {
  isEntitled(input: {
    operation: "start" | "access" | "reset" | "validate";
    learnerId: string;
    organizationId: string;
    scenarioId: string;
    scenarioVersion: number;
  }): Promise<unknown>;
}

export interface LabProvider {
  availability(input: { organizationId: string; scenario: LabScenarioSnapshot }): Promise<unknown>;
  provision(input: {
    operationKey: string;
    sessionId: string;
    scenario: LabScenarioSnapshot;
    learnerId: string;
  }): Promise<unknown>;
  lookupProvision(input: { operationKey: string }): Promise<unknown>;
  healthCheck(input: { operationKey: string; providerReference: string }): Promise<unknown>;
  createAccessGrant(input: {
    operationKey: string;
    providerReference: string;
    sessionId: string;
    learnerId: string;
  }): Promise<unknown>;
  revokeAccessLease(input: {
    operationKey: string;
    providerReference: string;
    leaseReference: string;
  }): Promise<unknown>;
  reset(input: { operationKey: string; providerReference: string }): Promise<unknown>;
  validate(input: {
    operationKey: string;
    providerReference: string;
    sessionId: string;
    scenario: LabScenarioSnapshot;
  }): Promise<unknown>;
  destroy(input: { operationKey: string; providerReference: string }): Promise<unknown>;
}

type LabDependencies = {
  repository: LabRepository;
  provider: LabProvider;
  entitlements: LabEntitlementPolicy;
  clock?: () => Date;
};

type SessionOperation = "access" | "reset" | "validate" | "destroy";
type SessionCommandConfiguration = {
  allowedSourceStates: readonly LabSessionState[];
  pendingState: LabSessionState | null;
  revokeLeaseOnBegin: boolean;
  managerAllowed: boolean;
  requireUnexpiredSession: boolean;
  requireActiveLease: boolean;
  nullProviderFinalState: "destroyed" | null;
};

const maximumAccessGrantLifetimeMs = 15 * 60_000;
const maximumProviderClockSkewMs = 5 * 60_000;

function parseInput<T>(schema: z.ZodType<T>, input: unknown): T {
  const parsed = schema.safeParse(input);
  if (!parsed.success) throw new LabDomainError("labs.invalid_command");
  return parsed.data;
}

function currentTime(dependencies: Pick<LabDependencies, "clock">): Date {
  const now = dependencies.clock?.() ?? new Date();
  if (!Number.isFinite(now.getTime())) throw new LabDomainError("labs.invalid_repository_response");
  return now;
}

function parseScenario(input: unknown): LabScenario {
  const parsed = LabScenarioSchema.safeParse(input);
  if (!parsed.success) throw new LabDomainError("labs.invalid_scenario_contract");
  return parsed.data;
}

function parseSession(input: unknown): LabSession {
  const parsed = LabSessionSchema.safeParse(input);
  if (!parsed.success) throw new LabDomainError("labs.invalid_session_contract");
  return parsed.data;
}

function parseProvider<T>(schema: z.ZodType<T>, input: unknown): T {
  const parsed = schema.safeParse(input);
  if (!parsed.success) throw new LabDomainError("labs.invalid_provider_response");
  return parsed.data;
}

function canonicalJson(input: unknown): string {
  function normalize(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(normalize);
    if (value !== null && typeof value === "object") {
      return Object.fromEntries(
        Object.entries(value)
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([key, nested]) => [key, normalize(nested)]),
      );
    }
    return value;
  }
  try {
    const serialized = JSON.stringify(normalize(input));
    if (serialized === undefined) throw new Error("not JSON serializable");
    return serialized;
  } catch (error) {
    if (error instanceof LabDomainError) throw error;
    throw new LabDomainError("labs.invalid_repository_response");
  }
}

function sameCanonical(left: unknown, right: unknown): boolean {
  return canonicalJson(left) === canonicalJson(right);
}

function requestFromIntent(intent: LabCommandIntent): LabCommandRequest {
  return LabCommandRequestSchema.parse(
    Object.fromEntries(Object.entries(intent).filter(([key]) => key !== "sourceSession")),
  );
}

function assertAggregateIdentity(session: LabSession, expected: LabSession): void {
  if (
    session.id !== expected.id
    || session.learnerId !== expected.learnerId
    || session.organizationId !== expected.organizationId
    || session.scenarioId !== expected.scenarioId
    || session.scenarioVersion !== expected.scenarioVersion
    || !sameCanonical(session.scenarioSnapshot, expected.scenarioSnapshot)
  ) {
    throw new LabDomainError("labs.invalid_session_contract");
  }
}

function parseCommandRecord(input: unknown, expectedRequest: LabCommandRequest): LabCommandRecord {
  const parsed = LabCommandRecordSchema.safeParse(input);
  if (!parsed.success) throw new LabDomainError("labs.invalid_repository_response");
  if (!sameCanonical(requestFromIntent(parsed.data.intent), expectedRequest)) {
    throw new LabDomainError("labs.idempotency_conflict");
  }
  if (
    parsed.data.status === "pending"
    && (parsed.data.output !== null || parsed.data.failureCode !== null)
  ) {
    throw new LabDomainError("labs.invalid_repository_response");
  }
  if (parsed.data.status === "completed" && parsed.data.failureCode !== null && parsed.data.output !== null) {
    throw new LabDomainError("labs.invalid_repository_response");
  }
  const session = parseSession(parsed.data.session);
  const lease = parsed.data.leaseToRevoke === null
    ? null
    : LabAccessLeaseSchema.safeParse(parsed.data.leaseToRevoke);
  if (lease !== null && !lease.success) throw new LabDomainError("labs.invalid_repository_response");
  const sourceCommand = parsed.data.sourceCommand === null
    ? null
    : LabSourceCommandSchema.safeParse(parsed.data.sourceCommand);
  if (sourceCommand !== null && !sourceCommand.success) {
    throw new LabDomainError("labs.invalid_repository_response");
  }
  const record: LabCommandRecord = {
    ...parsed.data,
    session,
    leaseToRevoke: lease === null ? null : lease.data,
    sourceCommand: sourceCommand === null ? null : sourceCommand.data,
  };
  const intent = record.intent;
  if (
    session.organizationId !== intent.organizationId
    || !sameCanonical(session.scenarioSnapshot, intent.scenarioSnapshot)
  ) {
    throw new LabDomainError("labs.invalid_repository_response");
  }
  if (intent.operation === "start") {
    if (intent.sourceSession !== null || record.leaseToRevoke !== null || record.sourceCommand !== null) {
      throw new LabDomainError("labs.invalid_repository_response");
    }
  } else {
    assertAggregateIdentity(session, intent.sourceSession);
    if (
      intent.sessionId !== intent.sourceSession.id
      || intent.expectedVersion !== intent.sourceSession.version
    ) {
      throw new LabDomainError("labs.invalid_repository_response");
    }
    const expectedLease = intent.operation === "cleanup" && record.sourceCommand
      ? record.sourceCommand.intent.sourceSession?.activeLease ?? null
      : intent.sourceSession.activeLease;
    if (!sameCanonical(record.leaseToRevoke, expectedLease)) {
      throw new LabDomainError("labs.invalid_repository_response");
    }
  }
  if (intent.operation === "cleanup") {
    if (
      record.sourceCommand === null
      || record.sourceCommand.intent.operation === "cleanup"
      || record.sourceCommand.intent.key !== intent.targetCommandKey
      || record.sourceCommand.providerOperationKey !== record.providerOperationKey
      || record.sourceCommand.intent.organizationId !== intent.organizationId
      || !sameCanonical(record.sourceCommand.intent.scenarioSnapshot, intent.scenarioSnapshot)
    ) {
      throw new LabDomainError("labs.invalid_repository_response");
    }
  } else if (record.sourceCommand !== null) {
    throw new LabDomainError("labs.invalid_repository_response");
  }
  return record;
}

function providerOperationKey(record: LabCommandRecord, step: string): string {
  const key = `${record.providerOperationKey}:${step}`;
  if (key.length > 256) throw new LabDomainError("labs.invalid_repository_response");
  return key;
}

function toSnapshot(scenario: LabScenario): LabScenarioSnapshot {
  const parsed = LabScenarioSnapshotSchema.safeParse({
    scenarioId: scenario.id,
    scenarioVersion: scenario.version,
    retentionMinutes: scenario.retentionMinutes,
    ruleSetFingerprint: scenario.ruleSetFingerprint,
    validationRules: scenario.validationRules,
    providerKind: scenario.providerKind,
    provisioningConfig: scenario.provisioningConfig,
  });
  if (!parsed.success) throw new LabDomainError("labs.invalid_scenario_contract");
  return parsed.data;
}

function requireLearnerPrincipal(principal: Principal): string {
  if (
    !principal.organizationId
    || !principal.roles.includes("learner")
    || !principal.permissions.includes("learning.submit")
  ) {
    throw new LabDomainError("labs.forbidden");
  }
  return principal.organizationId;
}

function requireScenarioOrganization(principal: Principal, scenario: LabScenario): string {
  const organizationId = requireLearnerPrincipal(principal);
  if (scenario.organizationId !== null && scenario.organizationId !== organizationId) {
    throw new LabDomainError("labs.forbidden");
  }
  return organizationId;
}

async function requireEntitlement(
  dependencies: Pick<LabDependencies, "entitlements">,
  operation: "start" | "access" | "reset" | "validate",
  session: Pick<LabSession, "learnerId" | "organizationId" | "scenarioId" | "scenarioVersion">,
): Promise<void> {
  const decision = z.boolean().safeParse(await dependencies.entitlements.isEntitled({
    operation,
    learnerId: session.learnerId,
    organizationId: session.organizationId,
    scenarioId: session.scenarioId,
    scenarioVersion: session.scenarioVersion,
  }));
  if (!decision.success) throw new LabDomainError("labs.invalid_entitlement_decision");
  if (!decision.data) throw new LabDomainError("labs.entitlement_required");
}

async function authorizeSessionOperation(
  dependencies: Pick<LabDependencies, "entitlements">,
  principal: Principal,
  session: LabSession,
  operation: SessionOperation,
  managerAllowed: boolean,
): Promise<void> {
  if (!principal.organizationId || principal.organizationId !== session.organizationId) {
    throw new LabDomainError("labs.forbidden");
  }
  if (principal.userId === session.learnerId) {
    requireLearnerPrincipal(principal);
    if (operation !== "destroy") await requireEntitlement(dependencies, operation, session);
    return;
  }
  if (!managerAllowed || !principal.permissions.includes("organization.manage")) {
    throw new LabDomainError("labs.forbidden");
  }
}

function authorizeCleanup(principal: Principal, session: LabSession): void {
  const tenantManager = principal.organizationId === session.organizationId
    && principal.permissions.includes("organization.manage");
  const internalReconciler = principal.permissions.includes("lab.reconcile");
  if (!tenantManager && !internalReconciler) throw new LabDomainError("labs.forbidden");
}

export function transitionLabSession(
  session: LabSession,
  nextState: LabSessionState,
  expectedVersion: number,
  change: Partial<Pick<LabSession, "providerReference" | "activeLease" | "expiresAt" | "failureCode">> = {},
): LabSession {
  if (session.version !== expectedVersion) throw new LabDomainError("labs.stale_session");
  if (!canTransition<LabSessionState>(labSessionTransitions, session.state, nextState)) {
    throw new LabDomainError("labs.invalid_transition");
  }
  return parseSession({ ...session, ...change, state: nextState, version: session.version + 1 });
}

function reviseLabSession(
  session: LabSession,
  expectedVersion: number,
  change: Partial<Pick<LabSession, "providerReference" | "activeLease" | "expiresAt" | "failureCode">>,
): LabSession {
  if (session.version !== expectedVersion) throw new LabDomainError("labs.stale_session");
  return parseSession({ ...session, ...change, version: session.version + 1 });
}

function stableRecordFieldsMatch(left: LabCommandRecord, right: LabCommandRecord): boolean {
  return left.providerOperationKey === right.providerOperationKey
    && left.createdAt === right.createdAt
    && sameCanonical(left.intent, right.intent)
    && sameCanonical(left.leaseToRevoke, right.leaseToRevoke)
    && sameCanonical(left.sourceCommand, right.sourceCommand);
}

async function savePending(
  repository: LabRepository,
  record: LabCommandRecord,
  session: LabSession,
): Promise<LabCommandRecord> {
  const saved = parseCommandRecord(await repository.savePendingCommand({
    intent: record.intent,
    previousSession: record.session,
    session,
  }), requestFromIntent(record.intent));
  if (
    saved.status !== "pending"
    || saved.output !== null
    || saved.failureCode !== null
    || !stableRecordFieldsMatch(saved, record)
    || !sameCanonical(saved.session, session)
  ) {
    throw new LabDomainError("labs.invalid_repository_response");
  }
  return saved;
}

async function complete(
  repository: LabRepository,
  record: LabCommandRecord,
  session: LabSession,
  output: unknown | null,
  failureCode: LabDomainErrorCode | null = null,
): Promise<LabCommandRecord> {
  const completed = parseCommandRecord(await repository.completeCommand({
    intent: record.intent,
    previousSession: record.session,
    session,
    output,
    failureCode,
  }), requestFromIntent(record.intent));
  if (
    completed.status !== "completed"
    || completed.failureCode !== failureCode
    || !stableRecordFieldsMatch(completed, record)
    || !sameCanonical(completed.session, session)
    || !sameCanonical(completed.output, output)
  ) {
    throw new LabDomainError("labs.invalid_repository_response");
  }
  return completed;
}

function throwCompletedFailure(record: LabCommandRecord): void {
  if (record.status === "completed" && record.failureCode !== null) {
    throw new LabDomainError(record.failureCode);
  }
}

function assertProviderEffect(raw: unknown, providerReference: string, operationKey: string): void {
  const effect = parseProvider(LabProviderEffectSchema, raw);
  if (effect.providerReference !== providerReference || effect.operationKey !== operationKey) {
    throw new LabDomainError("labs.invalid_provider_response");
  }
}

function assertProviderTimestamp(value: string, record: LabCommandRecord, now: Date): void {
  const timestamp = Date.parse(value);
  if (
    timestamp < Date.parse(record.createdAt) - maximumProviderClockSkewMs
    || timestamp > now.getTime() + maximumProviderClockSkewMs
  ) {
    throw new LabDomainError("labs.invalid_provider_response");
  }
}

async function revokeRecordedLease(provider: LabProvider, record: LabCommandRecord): Promise<void> {
  if (!record.leaseToRevoke) return;
  if (
    record.leaseToRevoke.sessionId !== record.session.id
    || record.leaseToRevoke.providerReference !== record.session.providerReference
  ) {
    throw new LabDomainError("labs.invalid_repository_response");
  }
  const operationKey = providerOperationKey(record, "revoke-lease");
  assertProviderEffect(
    await provider.revokeAccessLease({
      operationKey,
      providerReference: record.leaseToRevoke.providerReference,
      leaseReference: record.leaseToRevoke.leaseReference,
    }),
    record.leaseToRevoke.providerReference,
    operationKey,
  );
}

function makeStartRequest(
  principal: Principal,
  organizationId: string,
  command: StartLabInput,
  snapshot: LabScenarioSnapshot,
): Extract<LabCommandRequest, { operation: "start" }> {
  return {
    operation: "start",
    key: command.idempotencyKey,
    actorId: principal.userId,
    organizationId,
    scenarioSnapshot: snapshot,
  };
}

function makeSessionRequest(
  operation: SessionOperation,
  principal: Principal,
  command: AccessLabInput | ResetLabInput | ValidateLabInput | DestroyLabInput,
  session: LabSession,
): Extract<LabCommandRequest, { operation: SessionOperation }> {
  return {
    operation,
    key: command.idempotencyKey,
    actorId: principal.userId,
    organizationId: session.organizationId,
    scenarioSnapshot: session.scenarioSnapshot,
    sessionId: command.sessionId,
    expectedVersion: command.expectedVersion,
  };
}

function expectedPendingSession(
  source: LabSession,
  configuration: SessionCommandConfiguration,
): LabSession {
  if (configuration.pendingState === null) return source;
  return transitionLabSession(source, configuration.pendingState, source.version, {
    activeLease: configuration.revokeLeaseOnBegin ? null : source.activeLease,
  });
}

function validateCommandCreationPreconditions(
  record: LabCommandRecord,
  configuration: SessionCommandConfiguration,
): void {
  if (record.intent.operation === "start") throw new LabDomainError("labs.invalid_repository_response");
  const source = record.intent.sourceSession;
  const createdAt = Date.parse(record.createdAt);
  if (
    configuration.requireUnexpiredSession
    && (source.expiresAt === null || Date.parse(source.expiresAt) <= createdAt)
  ) {
    throw new LabDomainError("labs.invalid_transition");
  }
  if (
    configuration.requireActiveLease
    && (source.activeLease === null || Date.parse(source.activeLease.expiresAt) <= createdAt)
  ) {
    throw new LabDomainError("labs.invalid_transition");
  }
}

function validateSessionBeginResult(
  record: LabCommandRecord,
  sourceSession: LabSession,
  configuration: SessionCommandConfiguration,
): "new" | "replay" {
  if (record.intent.operation === "start" || record.intent.operation === "cleanup") {
    throw new LabDomainError("labs.invalid_repository_response");
  }
  const original = record.intent.sourceSession;
  const isNew = sameCanonical(sourceSession, original);
  const isReplay = sameCanonical(sourceSession, record.session);
  if (!isNew && !isReplay) throw new LabDomainError("labs.stale_session");
  validateCommandCreationPreconditions(record, configuration);
  const isDirectNullDestroy = record.intent.operation === "destroy"
    && original.providerReference === null
    && configuration.nullProviderFinalState === "destroyed";
  const expectedPending = isDirectNullDestroy
    ? transitionLabSession(original, "destroyed", original.version, { activeLease: null, failureCode: null })
    : expectedPendingSession(original, configuration);
  const cleanupTookOver = record.status === "completed"
    && record.failureCode === "labs.cleanup_in_progress"
    && record.output === null;
  if ((record.status === "pending" || cleanupTookOver) && !sameCanonical(record.session, expectedPending)) {
    throw new LabDomainError("labs.invalid_repository_response");
  }
  if (isNew) {
    if (!sameCanonical(record.session, expectedPending)) {
      throw new LabDomainError("labs.invalid_repository_response");
    }
    if (isDirectNullDestroy && record.status !== "completed") {
      throw new LabDomainError("labs.invalid_repository_response");
    }
    if (!isDirectNullDestroy && record.status !== "pending") {
      if (!cleanupTookOver) throw new LabDomainError("labs.invalid_repository_response");
    }
    return "new";
  }
  return "replay";
}

function isExactStartPendingSession(record: LabCommandRecord): boolean {
  return (
    record.session.state === "requested"
    && record.session.version === 1
    && record.session.providerReference === null
    && record.session.expiresAt === null
    && record.session.failureCode === null
  ) || (
    record.session.state === "provisioning"
    && (
      (record.session.version === 2 && record.session.providerReference === null)
      || (record.session.version === 3 && record.session.providerReference !== null)
    )
    && record.session.expiresAt === null
    && record.session.failureCode === null
  );
}

function validateStartRecord(record: LabCommandRecord): void {
  const snapshot = record.intent.scenarioSnapshot;
  if (
    record.intent.operation !== "start"
    || record.session.scenarioId !== snapshot.scenarioId
    || record.session.scenarioVersion !== snapshot.scenarioVersion
    || record.session.learnerId !== record.intent.actorId
    || record.session.requestedAt !== record.createdAt
  ) {
    throw new LabDomainError("labs.invalid_repository_response");
  }
  if (record.status === "completed" && record.failureCode !== null) {
    const cleanupTakeover = record.failureCode === "labs.cleanup_in_progress";
    const validFailure = cleanupTakeover
      ? isExactStartPendingSession(record)
      : record.session.state === "failed"
        && record.session.failureCode === record.failureCode
        && record.session.expiresAt === null
        && record.session.activeLease === null
        && (
          (record.failureCode === "labs.provision_failed"
            && record.session.version === 3
            && record.session.providerReference === null)
          || (record.failureCode === "labs.health_check_failed"
            && record.session.version === 4
            && record.session.providerReference !== null)
        );
    if (record.output !== null || !validFailure) {
      throw new LabDomainError("labs.invalid_repository_response");
    }
    throwCompletedFailure(record);
  }
  if (record.status === "completed") {
    if (
      record.output !== null
      || record.session.state !== "ready"
      || record.session.version !== 4
      || record.session.activeLease !== null
      || record.session.failureCode !== null
      || record.session.expiresAt !== new Date(
        Date.parse(record.session.requestedAt)
        + snapshot.retentionMinutes * 60_000,
      ).toISOString()
    ) {
      throw new LabDomainError("labs.invalid_repository_response");
    }
    return;
  }
  if (!isExactStartPendingSession(record)) throw new LabDomainError("labs.invalid_repository_response");
}

function validateTrustedProvisionResult(
  result: LabProvisionResult,
  record: LabCommandRecord,
): void {
  const snapshot = record.session.scenarioSnapshot;
  if (
    result.operationKey !== providerOperationKey(record, "provision")
    || result.sessionId !== record.session.id
    || result.scenarioId !== snapshot.scenarioId
    || result.scenarioVersion !== snapshot.scenarioVersion
    || result.ruleSetFingerprint !== snapshot.ruleSetFingerprint
  ) {
    throw new LabDomainError("labs.invalid_provider_response");
  }
}

async function lookupProvision(
  provider: LabProvider,
  record: LabCommandRecord,
): Promise<LabProvisionOperationStatus> {
  const operationKey = providerOperationKey(record, "provision");
  const status = parseProvider(
    LabProvisionOperationStatusSchema,
    await provider.lookupProvision({ operationKey }),
  );
  if (status.operationKey !== operationKey) throw new LabDomainError("labs.invalid_provider_response");
  if (status.status === "succeeded") validateTrustedProvisionResult(status.result, record);
  return status;
}

async function resolveProvision(
  dependencies: LabDependencies,
  record: LabCommandRecord,
): Promise<LabProvisionOperationStatus> {
  let status = await lookupProvision(dependencies.provider, record);
  if (status.status !== "not_found") return status;
  try {
    await dependencies.provider.provision({
      operationKey: providerOperationKey(record, "provision"),
      sessionId: record.session.id,
      scenario: record.session.scenarioSnapshot,
      learnerId: record.session.learnerId,
    });
  } catch {
    // The provider may have committed and lost the response. Only its durable
    // operation lookup is trusted below; the raw response/reference is never
    // used for persistence or cleanup.
  }
  status = await lookupProvision(dependencies.provider, record);
  return status;
}

async function completeStartFailure(
  dependencies: LabDependencies,
  record: LabCommandRecord,
  code: LabDomainErrorCode,
): Promise<never> {
  if (record.session.providerReference) {
    const cleanupKey = providerOperationKey(record, "cleanup");
    assertProviderEffect(
      await dependencies.provider.destroy({
        operationKey: cleanupKey,
        providerReference: record.session.providerReference,
      }),
      record.session.providerReference,
      cleanupKey,
    );
  }
  const failed = transitionLabSession(record.session, "failed", record.session.version, {
    activeLease: null,
    failureCode: code,
  });
  await complete(dependencies.repository, record, failed, null, code);
  throw new LabDomainError(code);
}

export async function startLab(
  dependencies: LabDependencies,
  principal: Principal,
  input: unknown,
): Promise<LabSession> {
  const command = parseInput(StartLabInputSchema, input);
  requireLearnerPrincipal(principal);
  const scenario = parseScenario(await dependencies.repository.getScenario({
    scenarioId: command.scenarioId,
    version: command.scenarioVersion,
  }));
  if (scenario.id !== command.scenarioId || scenario.version !== command.scenarioVersion) {
    throw new LabDomainError("labs.invalid_scenario_contract");
  }
  const organizationId = requireScenarioOrganization(principal, scenario);
  await requireEntitlement(dependencies, "start", {
    learnerId: principal.userId,
    organizationId,
    scenarioId: scenario.id,
    scenarioVersion: scenario.version,
  });
  const request = makeStartRequest(principal, organizationId, command, toSnapshot(scenario));
  let record = parseCommandRecord(await dependencies.repository.beginStartCommand({
    request,
  }), request);
  validateStartRecord(record);
  if (record.status === "completed") return record.session;

  if (record.session.state === "requested") {
    const availability = parseProvider(
      LabProviderAvailabilitySchema,
      await dependencies.provider.availability({
        organizationId,
        scenario: record.session.scenarioSnapshot,
      }),
    );
    if (!availability.available) throw new LabDomainError("labs.provider_unavailable", availability);
  }
  if (record.session.state === "requested") {
    record = await savePending(
      dependencies.repository,
      record,
      transitionLabSession(record.session, "provisioning", record.session.version),
    );
  }
  if (record.session.state !== "provisioning") {
    throw new LabDomainError("labs.invalid_session_contract");
  }
  if (!record.session.providerReference) {
    const status = await resolveProvision(dependencies, record);
    if (status.status === "pending" || status.status === "not_found") {
      throw new LabDomainError("labs.provision_outcome_pending");
    }
    if (status.status === "failed") {
      return completeStartFailure(dependencies, record, "labs.provision_failed");
    }
    if (status.status !== "succeeded") {
      throw new LabDomainError("labs.provision_outcome_pending");
    }
    record = await savePending(
      dependencies.repository,
      record,
      reviseLabSession(record.session, record.session.version, {
        providerReference: status.result.providerReference,
      }),
    );
  }

  const providerReference = record.session.providerReference;
  if (!providerReference) throw new LabDomainError("labs.invalid_session_contract");
  const healthKey = providerOperationKey(record, "health");
  let health;
  try {
    health = parseProvider(
      LabProviderHealthSchema,
      await dependencies.provider.healthCheck({ operationKey: healthKey, providerReference }),
    );
  } catch (error) {
    // Unknown/malformed health outcomes remain pending and are recoverable by
    // exact replay or cleanup takeover; no provider reference from a malformed
    // response is ever used.
    throw error;
  }
  if (health.operationKey !== healthKey || health.providerReference !== providerReference) {
    throw new LabDomainError("labs.invalid_provider_response");
  }
  assertProviderTimestamp(health.checkedAt, record, currentTime(dependencies));
  if (!health.healthy) return completeStartFailure(dependencies, record, "labs.health_check_failed");

  const ready = transitionLabSession(record.session, "ready", record.session.version, {
    expiresAt: new Date(
      Date.parse(record.session.requestedAt)
      + record.session.scenarioSnapshot.retentionMinutes * 60_000,
    ).toISOString(),
    failureCode: null,
  });
  return (await complete(dependencies.repository, record, ready, null)).session;
}

function assertAccessGrant(grant: LabAccessGrant, record: LabCommandRecord, now: Date): void {
  const providerReference = record.session.providerReference;
  const sessionExpiry = record.session.expiresAt ? Date.parse(record.session.expiresAt) : Number.NaN;
  const issuedAt = Date.parse(grant.issuedAt);
  const expiresAt = Date.parse(grant.expiresAt);
  if (
    providerReference === null
    || grant.operationKey !== providerOperationKey(record, "access")
    || grant.sessionId !== record.session.id
    || grant.providerReference !== providerReference
    || issuedAt < Date.parse(record.createdAt) - maximumProviderClockSkewMs
    || issuedAt > now.getTime() + maximumProviderClockSkewMs
    || expiresAt <= now.getTime()
    || !Number.isFinite(sessionExpiry)
    || expiresAt > sessionExpiry
    || expiresAt - issuedAt > maximumAccessGrantLifetimeMs
    || expiresAt - now.getTime() > maximumAccessGrantLifetimeMs
  ) {
    throw new LabDomainError("labs.invalid_access_grant");
  }
}

async function beginSessionOperation(
  dependencies: LabDependencies,
  principal: Principal,
  operation: SessionOperation,
  command: AccessLabInput | ResetLabInput | ValidateLabInput | DestroyLabInput,
  configuration: SessionCommandConfiguration,
): Promise<LabCommandRecord> {
  const sourceSession = parseSession(await dependencies.repository.getSession(command.sessionId));
  if (sourceSession.id !== command.sessionId) throw new LabDomainError("labs.invalid_session_contract");
  await authorizeSessionOperation(
    dependencies,
    principal,
    sourceSession,
    operation,
    configuration.managerAllowed,
  );
  const request = makeSessionRequest(operation, principal, command, sourceSession);
  const record = parseCommandRecord(await dependencies.repository.beginSessionCommand({
    request,
    sourceSession,
    allowedSourceStates: configuration.allowedSourceStates,
    pendingState: configuration.pendingState,
    revokeLeaseOnBegin: configuration.revokeLeaseOnBegin,
    preconditions: {
      requireUnexpiredSession: configuration.requireUnexpiredSession,
      requireActiveLease: configuration.requireActiveLease,
    },
    nullProviderFinalState: configuration.nullProviderFinalState,
  }), request);
  validateSessionBeginResult(record, sourceSession, configuration);
  return record;
}

export async function createLabAccessGrant(
  dependencies: LabDependencies,
  principal: Principal,
  input: unknown,
): Promise<LabAccessGrant> {
  const command = parseInput(AccessLabInputSchema, input);
  const record = await beginSessionOperation(dependencies, principal, "access", command, {
    allowedSourceStates: ["ready", "active"],
    pendingState: null,
    revokeLeaseOnBegin: false,
    managerAllowed: false,
    requireUnexpiredSession: true,
    requireActiveLease: false,
    nullProviderFinalState: null,
  });
  throwCompletedFailure(record);
  if (record.status === "completed") {
    const replay = LabAccessGrantSchema.safeParse(record.output);
    if (!replay.success) throw new LabDomainError("labs.invalid_repository_response");
    if (
      record.session.state !== "active"
      || record.session.activeLease?.leaseReference !== replay.data.leaseReference
    ) {
      throw new LabDomainError("labs.stale_session");
    }
    assertAccessGrant(replay.data, record, currentTime(dependencies));
    return replay.data;
  }
  if (!record.session.providerReference || !["ready", "active"].includes(record.session.state)) {
    throw new LabDomainError("labs.invalid_transition");
  }
  await revokeRecordedLease(dependencies.provider, record);
  const operationKey = providerOperationKey(record, "access");
  const grant = parseProvider(
    LabAccessGrantSchema,
    await dependencies.provider.createAccessGrant({
      operationKey,
      providerReference: record.session.providerReference,
      sessionId: record.session.id,
      learnerId: record.session.learnerId,
    }),
  );
  const afterProvider = currentTime(dependencies);
  assertAccessGrant(grant, record, afterProvider);
  const parsedLease = LabAccessLeaseSchema.safeParse({
    sessionId: record.session.id,
    providerReference: record.session.providerReference,
    leaseReference: grant.leaseReference,
    issuedAt: grant.issuedAt,
    expiresAt: grant.expiresAt,
  });
  if (!parsedLease.success) throw new LabDomainError("labs.invalid_access_grant");
  const active = record.session.state === "ready"
    ? transitionLabSession(record.session, "active", record.session.version, { activeLease: parsedLease.data })
    : reviseLabSession(record.session, record.session.version, { activeLease: parsedLease.data });
  await complete(dependencies.repository, record, active, grant);
  return grant;
}

function assertHealthy(raw: unknown, record: LabCommandRecord, now: Date): void {
  const health = parseProvider(LabProviderHealthSchema, raw);
  const providerReference = record.session.providerReference;
  if (!providerReference) throw new LabDomainError("labs.invalid_session_contract");
  const operationKey = providerOperationKey(record, "health");
  if (health.providerReference !== providerReference || health.operationKey !== operationKey) {
    throw new LabDomainError("labs.invalid_provider_response");
  }
  assertProviderTimestamp(health.checkedAt, record, now);
  if (!health.healthy) throw new LabDomainError("labs.health_check_failed");
}

export async function resetLab(
  dependencies: LabDependencies,
  principal: Principal,
  input: unknown,
): Promise<LabSession> {
  const command = parseInput(ResetLabInputSchema, input);
  const record = await beginSessionOperation(dependencies, principal, "reset", command, {
    allowedSourceStates: ["ready", "active"],
    pendingState: "reset_pending",
    revokeLeaseOnBegin: true,
    managerAllowed: true,
    requireUnexpiredSession: true,
    requireActiveLease: false,
    nullProviderFinalState: null,
  });
  throwCompletedFailure(record);
  if (record.status === "completed") {
    if (record.output !== null || record.session.state !== "ready") {
      throw new LabDomainError("labs.invalid_repository_response");
    }
    return record.session;
  }
  if (record.session.state !== "reset_pending" || !record.session.providerReference) {
    throw new LabDomainError("labs.invalid_session_contract");
  }
  await revokeRecordedLease(dependencies.provider, record);
  const resetKey = providerOperationKey(record, "reset");
  assertProviderEffect(
    await dependencies.provider.reset({
      operationKey: resetKey,
      providerReference: record.session.providerReference,
    }),
    record.session.providerReference,
    resetKey,
  );
  const healthKey = providerOperationKey(record, "health");
  try {
    assertHealthy(
      await dependencies.provider.healthCheck({
        operationKey: healthKey,
        providerReference: record.session.providerReference,
      }),
      record,
      currentTime(dependencies),
    );
  } catch (error) {
    if (!(error instanceof LabDomainError) || error.code !== "labs.health_check_failed") throw error;
    const failed = transitionLabSession(record.session, "failed", record.session.version, {
      activeLease: null,
      failureCode: error.code,
    });
    await complete(dependencies.repository, record, failed, null, error.code);
    throw error;
  }
  const ready = transitionLabSession(record.session, "ready", record.session.version, {
    activeLease: null,
    failureCode: null,
  });
  return (await complete(dependencies.repository, record, ready, null)).session;
}

function validateResultSet(
  results: readonly LabValidationResult[],
  record: LabCommandRecord,
  now: Date,
): LabValidationResult[] {
  const expectedRules = new Map(record.session.scenarioSnapshot.validationRules.map((rule) => [rule.id, rule]));
  const resultIds = new Set<string>();
  const returnedRuleIds = new Set<string>();
  const earliestAllowed = Date.parse(record.createdAt) - maximumProviderClockSkewMs;
  const latestAllowed = now.getTime() + maximumProviderClockSkewMs;
  const validated: LabValidationResult[] = [];
  for (const rawResult of results) {
    const parsed = LabValidationResultSchema.safeParse(rawResult);
    if (!parsed.success) throw new LabDomainError("labs.invalid_validation_result");
    const result = parsed.data;
    const rule = expectedRules.get(result.ruleId);
    if (
      !rule
      || result.sessionId !== record.session.id
      || resultIds.has(result.id)
      || returnedRuleIds.has(result.ruleId)
      || result.passed !== (result.score >= rule.passingScore)
      || (rule.evidenceRequired && result.evidenceReference === null)
      || Date.parse(result.validatedAt) < earliestAllowed
      || Date.parse(result.validatedAt) > latestAllowed
    ) {
      throw new LabDomainError("labs.invalid_validation_result");
    }
    resultIds.add(result.id);
    returnedRuleIds.add(result.ruleId);
    validated.push(result);
  }
  if (returnedRuleIds.size !== expectedRules.size) {
    throw new LabDomainError("labs.invalid_validation_result");
  }
  return validated;
}

function parseValidationResults(raw: unknown, record: LabCommandRecord, now: Date): LabValidationResult[] {
  const batch = parseProvider(LabValidationBatchSchema, raw);
  if (
    batch.sessionId !== record.session.id
    || batch.scenarioVersion !== record.session.scenarioVersion
    || batch.ruleSetFingerprint !== record.session.scenarioSnapshot.ruleSetFingerprint
    || batch.providerReference !== record.session.providerReference
    || batch.operationKey !== providerOperationKey(record, "validate")
  ) {
    throw new LabDomainError("labs.invalid_validation_result");
  }
  return validateResultSet(batch.results, record, now);
}

export async function validateLab(
  dependencies: LabDependencies,
  principal: Principal,
  input: unknown,
): Promise<readonly LabValidationResult[]> {
  const command = parseInput(ValidateLabInputSchema, input);
  const record = await beginSessionOperation(dependencies, principal, "validate", command, {
    allowedSourceStates: ["active"],
    pendingState: "validating",
    revokeLeaseOnBegin: false,
    managerAllowed: true,
    requireUnexpiredSession: true,
    requireActiveLease: true,
    nullProviderFinalState: null,
  });
  throwCompletedFailure(record);
  if (record.status === "completed") {
    const replay = z.array(LabValidationResultSchema).safeParse(record.output);
    if (!replay.success || record.session.state !== "active") {
      throw new LabDomainError("labs.invalid_repository_response");
    }
    return validateResultSet(replay.data, record, currentTime(dependencies));
  }
  if (record.session.state !== "validating" || !record.session.providerReference) {
    throw new LabDomainError("labs.invalid_session_contract");
  }
  const raw = await dependencies.provider.validate({
    operationKey: providerOperationKey(record, "validate"),
    providerReference: record.session.providerReference,
    sessionId: record.session.id,
    scenario: record.session.scenarioSnapshot,
  });
  let results: LabValidationResult[];
  try {
    results = parseValidationResults(raw, record, currentTime(dependencies));
  } catch (error) {
    if (!(error instanceof LabDomainError)) throw error;
    await revokeRecordedLease(dependencies.provider, record);
    const failed = transitionLabSession(record.session, "failed", record.session.version, {
      activeLease: null,
      failureCode: "labs.invalid_validation_result",
    });
    await complete(dependencies.repository, record, failed, null, "labs.invalid_validation_result");
    throw new LabDomainError("labs.invalid_validation_result");
  }
  const active = transitionLabSession(record.session, "active", record.session.version, { failureCode: null });
  await complete(dependencies.repository, record, active, results);
  return results;
}

export async function destroyLab(
  dependencies: LabDependencies,
  principal: Principal,
  input: unknown,
): Promise<LabSession> {
  const command = parseInput(DestroyLabInputSchema, input);
  const record = await beginSessionOperation(dependencies, principal, "destroy", command, {
    allowedSourceStates: ["ready", "active", "failed", "expired"],
    pendingState: "destroy_pending",
    revokeLeaseOnBegin: true,
    managerAllowed: true,
    requireUnexpiredSession: false,
    requireActiveLease: false,
    nullProviderFinalState: "destroyed",
  });
  throwCompletedFailure(record);
  if (record.status === "completed") {
    if (record.output !== null || record.session.state !== "destroyed") {
      throw new LabDomainError("labs.invalid_repository_response");
    }
    return record.session;
  }
  if (record.session.state !== "destroy_pending" || !record.session.providerReference) {
    throw new LabDomainError("labs.invalid_session_contract");
  }
  await revokeRecordedLease(dependencies.provider, record);
  const operationKey = providerOperationKey(record, "destroy");
  assertProviderEffect(
    await dependencies.provider.destroy({
      operationKey,
      providerReference: record.session.providerReference,
    }),
    record.session.providerReference,
    operationKey,
  );
  const destroyed = transitionLabSession(record.session, "destroyed", record.session.version, {
    activeLease: null,
    failureCode: null,
  });
  return (await complete(dependencies.repository, record, destroyed, null)).session;
}

function cleanupRequest(
  principal: Principal,
  command: CleanupPendingLabInput,
  session: LabSession,
): Extract<LabCommandRequest, { operation: "cleanup" }> {
  return {
    operation: "cleanup",
    key: command.idempotencyKey,
    actorId: principal.userId,
    organizationId: session.organizationId,
    scenarioSnapshot: session.scenarioSnapshot,
    sessionId: command.sessionId,
    expectedVersion: command.expectedVersion,
    targetCommandKey: command.pendingCommandKey,
    reason: command.reason,
  };
}

function validateCleanupBegin(
  record: LabCommandRecord,
  sourceSession: LabSession,
): void {
  if (record.intent.operation !== "cleanup") throw new LabDomainError("labs.invalid_repository_response");
  const isNew = sameCanonical(sourceSession, record.intent.sourceSession);
  const isReplay = sameCanonical(sourceSession, record.session);
  if (!isNew && !isReplay) throw new LabDomainError("labs.stale_session");
  if (isNew && (record.status !== "pending" || !sameCanonical(record.session, sourceSession))) {
    throw new LabDomainError("labs.invalid_repository_response");
  }
  if (record.status === "completed" && record.session.state !== "destroyed") {
    throw new LabDomainError("labs.invalid_repository_response");
  }
}

async function directCleanupCompletion(
  repository: LabRepository,
  record: LabCommandRecord,
): Promise<LabSession> {
  const destroyed = record.session.state === "destroyed"
    ? record.session
    : transitionLabSession(record.session, "destroyed", record.session.version, {
      activeLease: null,
      failureCode: null,
    });
  return (await complete(repository, record, destroyed, null)).session;
}

/**
 * Restricted reconciliation path: it can only revoke/destroy an environment
 * and complete a durable cleanup receipt. It cannot issue access, validate,
 * reset or complete the original learner command.
 */
export async function cleanupPendingLab(
  dependencies: LabDependencies,
  principal: Principal,
  input: unknown,
): Promise<LabSession> {
  const command = parseInput(CleanupPendingLabInputSchema, input);
  const sourceSession = parseSession(await dependencies.repository.getSession(command.sessionId));
  if (sourceSession.id !== command.sessionId) throw new LabDomainError("labs.invalid_session_contract");
  authorizeCleanup(principal, sourceSession);
  const request = cleanupRequest(principal, command, sourceSession);
  let record = parseCommandRecord(await dependencies.repository.beginCleanupTakeover({
    request,
    sourceSession,
  }), request);
  validateCleanupBegin(record, sourceSession);
  throwCompletedFailure(record);
  if (record.status === "completed") return record.session;

  if (!record.session.providerReference) {
    if (record.sourceCommand?.intent.operation !== "start") {
      return directCleanupCompletion(dependencies.repository, record);
    }
    const status = await lookupProvision(dependencies.provider, record);
    if (status.status === "pending") throw new LabDomainError("labs.provision_outcome_pending");
    if (status.status === "not_found" || status.status === "failed") {
      return directCleanupCompletion(dependencies.repository, record);
    }
    if (status.status !== "succeeded") {
      throw new LabDomainError("labs.provision_outcome_pending");
    }
    const withTrustedProvider = record.session.state === "requested"
      ? transitionLabSession(record.session, "provisioning", record.session.version, {
        providerReference: status.result.providerReference,
      })
      : reviseLabSession(record.session, record.session.version, {
        providerReference: status.result.providerReference,
      });
    record = await savePending(dependencies.repository, record, withTrustedProvider);
  }

  const providerReference = record.session.providerReference;
  if (!providerReference) throw new LabDomainError("labs.invalid_session_contract");
  await revokeRecordedLease(dependencies.provider, record);
  if (record.session.state !== "destroy_pending") {
    record = await savePending(
      dependencies.repository,
      record,
      transitionLabSession(record.session, "destroy_pending", record.session.version, {
        activeLease: null,
      }),
    );
  }
  const destroyStep = record.sourceCommand?.intent.operation === "destroy" ? "destroy" : "cleanup";
  const operationKey = providerOperationKey(record, destroyStep);
  assertProviderEffect(
    await dependencies.provider.destroy({ operationKey, providerReference }),
    providerReference,
    operationKey,
  );
  const destroyed = transitionLabSession(record.session, "destroyed", record.session.version, {
    activeLease: null,
    failureCode: null,
  });
  return (await complete(dependencies.repository, record, destroyed, null)).session;
}
