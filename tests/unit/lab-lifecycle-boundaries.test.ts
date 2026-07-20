import { describe, expect, it, vi } from "vitest";

import type {
  LabAccessLease,
  LabScenario,
  LabSession,
  LabValidationResult,
} from "@/features/labs/model";
import {
  cleanupPendingLab,
  createLabAccessGrant,
  destroyLab,
  LabDomainError,
  resetLab,
  startLab,
  transitionLabSession,
  validateLab,
  type LabCommandIntent,
  type LabCommandRecord,
  type LabCommandRequest,
  type LabProvider,
  type LabRepository,
} from "@/features/labs/service";
import type { Principal } from "@/shared/auth/types";

const baseTimestamp = "2026-07-18T08:00:00.000Z";
const fingerprint = `sha256:${"c".repeat(64)}`;
const principal: Principal = {
  userId: "learner-1",
  sessionId: "auth-session-1",
  organizationId: "org-1",
  primaryRole: "learner",
  roles: ["learner"],
  permissions: ["learning.submit"],
  cohortIds: [],
};
const manager: Principal = {
  ...principal,
  userId: "admin-1",
  primaryRole: "organization_admin",
  roles: ["organization_admin"],
  permissions: ["organization.manage"],
};
const internalReconciler: Principal = {
  ...principal,
  userId: "support-1",
  organizationId: null,
  primaryRole: "support",
  roles: ["support"],
  permissions: ["lab.reconcile"],
};
const scenario: LabScenario = {
  id: "scenario-1",
  organizationId: "org-1",
  title: "Isolated web shop",
  version: 7,
  retentionMinutes: 60,
  ruleSetFingerprint: fingerprint,
  validationRules: [
    { id: "rule-1", passingScore: 0.75, evidenceRequired: false },
    { id: "rule-2", passingScore: 0.5, evidenceRequired: true },
  ],
  providerKind: "docker",
  provisioningConfig: {
    template: "shop-v7",
    network: { isolated: true },
    resources: { cpu: 1, memoryMb: 512 },
  },
};
const snapshot = {
  scenarioId: scenario.id,
  scenarioVersion: scenario.version,
  retentionMinutes: scenario.retentionMinutes,
  ruleSetFingerprint: scenario.ruleSetFingerprint,
  validationRules: scenario.validationRules,
  providerKind: scenario.providerKind,
  provisioningConfig: scenario.provisioningConfig,
};
const requested: LabSession = {
  id: "lab-session-1",
  scenarioId: scenario.id,
  scenarioVersion: scenario.version,
  scenarioSnapshot: snapshot,
  learnerId: principal.userId,
  organizationId: "org-1",
  providerReference: null,
  activeLease: null,
  state: "requested",
  version: 1,
  requestedAt: baseTimestamp,
  expiresAt: null,
  failureCode: null,
};
const ready: LabSession = {
  ...requested,
  providerReference: "provider-session-1",
  state: "ready",
  version: 4,
  expiresAt: "2026-07-18T09:00:00.000Z",
};
const activeLease: LabAccessLease = {
  sessionId: ready.id,
  providerReference: ready.providerReference!,
  leaseReference: "lease-existing",
  issuedAt: baseTimestamp,
  expiresAt: "2026-07-18T08:30:00.000Z",
};
const active: LabSession = {
  ...ready,
  state: "active",
  version: 5,
  activeLease,
};

function evidence(reference = "artifact://evidence-1") {
  return {
    kind: "artifact" as const,
    reference,
    integrityHash: `sha256:${"d".repeat(64)}`,
  };
}

function validationResults(sessionId = ready.id): LabValidationResult[] {
  return [
    {
      id: "result-1",
      sessionId,
      ruleId: "rule-1",
      passed: true,
      score: 0.8,
      evidenceReference: null,
      validatedAt: baseTimestamp,
    },
    {
      id: "result-2",
      sessionId,
      ruleId: "rule-2",
      passed: true,
      score: 0.5,
      evidenceReference: evidence(),
      validatedAt: baseTimestamp,
    },
  ];
}

type MutableRecord = {
  -readonly [Key in keyof LabCommandRecord]: LabCommandRecord[Key];
};

function intentFromRequest(
  request: LabCommandRequest,
  sourceSession: LabSession | null,
): LabCommandIntent {
  if (request.operation === "start") return { ...request, sourceSession: null };
  if (!sourceSession) throw new Error("session command requires source");
  return { ...request, sourceSession };
}

function recordFor(
  request: LabCommandRequest,
  session: LabSession,
  sourceSession: LabSession | null,
  overrides: Partial<MutableRecord> = {},
): MutableRecord {
  return {
    intent: intentFromRequest(request, sourceSession),
    status: "pending",
    providerOperationKey: `provider:${request.key}`,
    session,
    output: null,
    leaseToRevoke: sourceSession?.activeLease ?? null,
    failureCode: null,
    createdAt: baseTimestamp,
    sourceCommand: null,
    ...overrides,
  };
}

function canonical(input: unknown): string {
  function normalize(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(normalize);
    if (value !== null && typeof value === "object") {
      return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => [key, normalize(child)]));
    }
    return value;
  }
  return JSON.stringify(normalize(input));
}

type RecordMutator = (record: MutableRecord) => unknown;

function harness({
  initialSession = requested,
  entitled = true,
}: {
  initialSession?: LabSession;
  entitled?: unknown;
} = {}) {
  let stored = initialSession;
  let nowMs = Date.parse(baseTimestamp);
  let validationValue = validationResults(initialSession.id);
  let provisionRawResponse: unknown | null = null;
  let provisionStatusAfterCall: "succeeded" | "pending" | "failed" = "succeeded";
  let lookupOverride: unknown | null = null;
  let accessGrantOverride: unknown | null = null;
  let advanceClockDuringGrantMs = 0;
  let accessThrows = false;
  let validationThrows = false;
  let destroyThrows = false;
  let mutateBeginReturn: RecordMutator | null = null;
  let mutateSaveReturn: RecordMutator | null = null;
  let mutateCompleteReturn: RecordMutator | null = null;
  const scenarios = new Map<number, LabScenario>([[scenario.version, scenario]]);
  const commands = new Map<string, MutableRecord>();
  const provisionStatuses = new Map<string, unknown>();
  const accessGrants = new Map<string, unknown>();
  const validationBatches = new Map<string, unknown>();
  const destroyEffects = new Map<string, unknown>();

  function cloneRecord(record: MutableRecord): MutableRecord {
    return structuredClone(record);
  }

  function returned(record: MutableRecord, mutator: RecordMutator | null): unknown {
    if (!mutator) return record;
    const clone = cloneRecord(record);
    return mutator(clone);
  }

  function currentTimestamp(): string {
    return new Date(nowMs).toISOString();
  }

  function existingOrConflict(request: LabCommandRequest): MutableRecord | null {
    const existing = commands.get(request.key);
    if (existing) return existing;
    if (request.operation !== "start") {
      const pending = [...commands.values()].find((candidate) => (
        candidate.status === "pending"
        && candidate.intent.operation !== "start"
        && candidate.intent.sessionId === request.sessionId
      ));
      if (pending) throw new LabDomainError("labs.idempotency_conflict");
    }
    return null;
  }

  const repository: LabRepository = {
    getScenario: vi.fn(async ({ scenarioId, version }) => {
      const found = scenarios.get(version);
      if (!found || found.id !== scenarioId) throw new Error("scenario version unavailable");
      return found;
    }),
    getSession: vi.fn(async () => stored),
    beginStartCommand: vi.fn(async ({ request }) => {
      const existing = existingOrConflict(request);
      if (existing) return returned(existing, mutateBeginReturn);
      stored = {
        ...requested,
        scenarioId: request.scenarioSnapshot.scenarioId,
        scenarioVersion: request.scenarioSnapshot.scenarioVersion,
        scenarioSnapshot: request.scenarioSnapshot,
        learnerId: request.actorId,
        organizationId: request.organizationId,
        requestedAt: currentTimestamp(),
      };
      const record = recordFor(request, stored, null, { createdAt: currentTimestamp() });
      commands.set(request.key, record);
      return returned(record, mutateBeginReturn);
    }),
    beginSessionCommand: vi.fn(async ({
      request,
      sourceSession,
      allowedSourceStates,
      pendingState,
      revokeLeaseOnBegin,
      preconditions,
      nullProviderFinalState,
    }) => {
      const existing = existingOrConflict(request);
      if (existing) return returned(existing, mutateBeginReturn);
      if (canonical(stored) !== canonical(sourceSession) || stored.version !== request.expectedVersion) {
        throw new LabDomainError("labs.stale_session");
      }
      if (!allowedSourceStates.includes(stored.state)) throw new LabDomainError("labs.invalid_transition");
      if (
        preconditions.requireUnexpiredSession
        && (stored.expiresAt === null || Date.parse(stored.expiresAt) <= nowMs)
      ) {
        throw new LabDomainError("labs.invalid_transition");
      }
      if (
        preconditions.requireActiveLease
        && (stored.activeLease === null || Date.parse(stored.activeLease.expiresAt) <= nowMs)
      ) {
        throw new LabDomainError("labs.invalid_transition");
      }
      let status: "pending" | "completed" = "pending";
      if (stored.providerReference === null && nullProviderFinalState) {
        stored = transitionLabSession(stored, nullProviderFinalState, stored.version, {
          activeLease: null,
          failureCode: null,
        });
        status = "completed";
      } else if (pendingState !== null) {
        stored = transitionLabSession(stored, pendingState, stored.version, {
          activeLease: revokeLeaseOnBegin ? null : stored.activeLease,
        });
      }
      const record = recordFor(request, stored, sourceSession, {
        status,
        createdAt: currentTimestamp(),
      });
      commands.set(request.key, record);
      return returned(record, mutateBeginReturn);
    }),
    beginCleanupTakeover: vi.fn(async ({ request, sourceSession }) => {
      const existing = commands.get(request.key);
      if (existing) return returned(existing, mutateBeginReturn);
      if (canonical(stored) !== canonical(sourceSession) || stored.version !== request.expectedVersion) {
        throw new LabDomainError("labs.stale_session");
      }
      const target = commands.get(request.targetCommandKey);
      if (
        !target
        || target.status !== "pending"
        || target.intent.operation === "cleanup"
        || target.session.id !== sourceSession.id
        || canonical(target.session) !== canonical(sourceSession)
      ) {
        throw new LabDomainError("labs.invalid_transition");
      }
      const sourceCommand = {
        intent: target.intent,
        providerOperationKey: target.providerOperationKey,
        createdAt: target.createdAt,
      };
      target.status = "completed";
      target.failureCode = "labs.cleanup_in_progress";
      const record = recordFor(request, sourceSession, sourceSession, {
        providerOperationKey: target.providerOperationKey,
        leaseToRevoke: target.leaseToRevoke,
        createdAt: currentTimestamp(),
        sourceCommand,
      });
      commands.set(request.key, record);
      return returned(record, mutateBeginReturn);
    }),
    savePendingCommand: vi.fn(async ({ intent, previousSession, session }) => {
      const record = commands.get(intent.key);
      if (
        !record
        || record.status !== "pending"
        || canonical(record.intent) !== canonical(intent)
        || canonical(record.session) !== canonical(previousSession)
        || canonical(stored) !== canonical(previousSession)
      ) {
        throw new LabDomainError("labs.stale_session");
      }
      stored = session;
      record.session = session;
      return returned(record, mutateSaveReturn);
    }),
    completeCommand: vi.fn(async ({ intent, previousSession, session, output, failureCode }) => {
      const record = commands.get(intent.key);
      if (
        !record
        || record.status !== "pending"
        || canonical(record.intent) !== canonical(intent)
        || canonical(record.session) !== canonical(previousSession)
        || canonical(stored) !== canonical(previousSession)
      ) {
        throw new LabDomainError("labs.stale_session");
      }
      stored = session;
      record.session = session;
      record.output = output;
      record.failureCode = failureCode;
      record.status = "completed";
      return returned(record, mutateCompleteReturn);
    }),
  };

  const provider: LabProvider = {
    availability: vi.fn(async () => ({ available: true })),
    provision: vi.fn(async (input) => {
      const result = {
        sessionId: input.sessionId,
        scenarioId: input.scenario.scenarioId,
        scenarioVersion: input.scenario.scenarioVersion,
        ruleSetFingerprint: input.scenario.ruleSetFingerprint,
        providerReference: "provider-session-1",
        operationKey: input.operationKey,
      };
      provisionStatuses.set(input.operationKey, provisionStatusAfterCall === "succeeded"
        ? { status: "succeeded", operationKey: input.operationKey, result }
        : provisionStatusAfterCall === "failed"
          ? { status: "failed", operationKey: input.operationKey, failureCode: "provider_failed" }
          : { status: "pending", operationKey: input.operationKey });
      return provisionRawResponse ?? result;
    }),
    lookupProvision: vi.fn(async ({ operationKey }) => (
      lookupOverride
      ?? provisionStatuses.get(operationKey)
      ?? { status: "not_found", operationKey }
    )),
    healthCheck: vi.fn(async (input) => ({ ...input, healthy: true, checkedAt: currentTimestamp() })),
    createAccessGrant: vi.fn(async (input) => {
      if (accessThrows) throw new Error("access response lost");
      let grant = accessGrants.get(input.operationKey);
      if (!grant) {
        grant = accessGrantOverride ?? {
          accessUrl: "https://lab.example.test/access/signed",
          sessionId: input.sessionId,
          providerReference: input.providerReference,
          leaseReference: `lease:${input.operationKey}`,
          operationKey: input.operationKey,
          issuedAt: currentTimestamp(),
          expiresAt: new Date(nowMs + 5 * 60_000).toISOString(),
        };
        accessGrants.set(input.operationKey, grant);
      }
      nowMs += advanceClockDuringGrantMs;
      return grant;
    }),
    revokeAccessLease: vi.fn(async (input) => ({
      providerReference: input.providerReference,
      operationKey: input.operationKey,
      applied: true,
    })),
    reset: vi.fn(async (input) => ({ ...input, applied: true })),
    validate: vi.fn(async (input) => {
      let batch = validationBatches.get(input.operationKey);
      if (!batch) {
        batch = {
          sessionId: input.sessionId,
          scenarioVersion: input.scenario.scenarioVersion,
          ruleSetFingerprint: input.scenario.ruleSetFingerprint,
          providerReference: input.providerReference,
          operationKey: input.operationKey,
          results: validationValue,
        };
        validationBatches.set(input.operationKey, batch);
      }
      if (validationThrows) throw new Error("validation response lost");
      return batch;
    }),
    destroy: vi.fn(async (input) => {
      let effect = destroyEffects.get(input.operationKey);
      if (!effect) {
        effect = { ...input, applied: true };
        destroyEffects.set(input.operationKey, effect);
      }
      if (destroyThrows) throw new Error("destroy response lost");
      return effect;
    }),
  };
  const entitlements = { isEntitled: vi.fn(async () => entitled) };
  const controls = {
    addScenario: (value: LabScenario) => scenarios.set(value.version, value),
    removeAllScenarios: () => scenarios.clear(),
    advanceClock: (milliseconds: number) => { nowMs += milliseconds; },
    setProvisionRawResponse: (value: unknown) => { provisionRawResponse = value; },
    setProvisionStatusAfterCall: (value: "succeeded" | "pending" | "failed") => { provisionStatusAfterCall = value; },
    setLookupOverride: (value: unknown | null) => { lookupOverride = value; },
    setAccessGrant: (value: unknown) => { accessGrantOverride = value; },
    advanceDuringGrant: (milliseconds: number) => { advanceClockDuringGrantMs = milliseconds; },
    setAccessThrows: (value: boolean) => { accessThrows = value; },
    setValidationThrows: (value: boolean) => { validationThrows = value; },
    setDestroyThrows: (value: boolean) => { destroyThrows = value; },
    setValidationResults: (value: LabValidationResult[]) => { validationValue = value; },
    mutateBegin: (value: RecordMutator | null) => { mutateBeginReturn = value; },
    mutateSave: (value: RecordMutator | null) => { mutateSaveReturn = value; },
    mutateComplete: (value: RecordMutator | null) => { mutateCompleteReturn = value; },
    command: (key: string) => commands.get(key),
    commandCount: () => commands.size,
  };
  return {
    repository,
    provider,
    entitlements,
    clock: () => new Date(nowMs),
    current: () => stored,
    controls,
  };
}

const startCommand = {
  scenarioId: scenario.id,
  scenarioVersion: scenario.version,
  idempotencyKey: "lab-start-full-sequence",
};

describe("authoritative full lifecycle", () => {
  it("runs exact-version start → trusted provision → lease → validate → reset → destroy", async () => {
    const suite = harness();
    const started = await startLab(suite, principal, startCommand);
    expect(started).toMatchObject({ state: "ready", version: 4, providerReference: "provider-session-1" });
    expect(suite.repository.getScenario).toHaveBeenCalledWith({ scenarioId: scenario.id, version: scenario.version });
    expect(suite.provider.provision).toHaveBeenCalledWith(expect.objectContaining({ scenario: snapshot }));

    const grant = await createLabAccessGrant(suite, principal, {
      sessionId: started.id,
      expectedVersion: started.version,
      idempotencyKey: "lab-access-full-sequence",
    });
    expect(suite.current()).toMatchObject({ state: "active", version: 5, activeLease: { leaseReference: grant.leaseReference } });

    await expect(validateLab(suite, principal, {
      sessionId: started.id,
      expectedVersion: 5,
      idempotencyKey: "lab-validate-full-sequence",
    })).resolves.toHaveLength(2);
    expect(suite.current()).toMatchObject({ state: "active", version: 7 });

    await expect(resetLab(suite, manager, {
      sessionId: started.id,
      expectedVersion: 7,
      idempotencyKey: "lab-reset-full-sequence",
    })).resolves.toMatchObject({ state: "ready", version: 9, activeLease: null });

    await expect(destroyLab(suite, manager, {
      sessionId: started.id,
      expectedVersion: 9,
      idempotencyKey: "lab-destroy-full-sequence",
    })).resolves.toMatchObject({ state: "destroyed", version: 11 });
  });

  it("does not reload mutable or missing scenario definitions for reset/destroy recovery", async () => {
    const suite = harness({ initialSession: ready });
    suite.controls.removeAllScenarios();
    await expect(resetLab(suite, manager, {
      sessionId: ready.id,
      expectedVersion: ready.version,
      idempotencyKey: "lab-reset-no-definition",
    })).resolves.toMatchObject({ state: "ready" });
    await expect(destroyLab(suite, manager, {
      sessionId: ready.id,
      expectedVersion: 6,
      idempotencyKey: "lab-destroy-no-definition",
    })).resolves.toMatchObject({ state: "destroyed" });
    expect(suite.repository.getScenario).not.toHaveBeenCalled();
  });
});

describe("exact scenario versions and trusted provider receipts", () => {
  it("replays the exact historical version after a newer version publishes and conflicts on version reuse", async () => {
    const suite = harness();
    const first = await startLab(suite, principal, {
      scenarioId: scenario.id,
      scenarioVersion: scenario.version,
      idempotencyKey: "lab-start-historical-version",
    });
    suite.controls.addScenario({
      ...scenario,
      version: scenario.version + 1,
      ruleSetFingerprint: `sha256:${"e".repeat(64)}`,
      provisioningConfig: { template: "shop-v8" },
    });
    await expect(startLab(suite, principal, {
      scenarioId: scenario.id,
      scenarioVersion: scenario.version,
      idempotencyKey: "lab-start-historical-version",
    })).resolves.toEqual(first);
    await expect(startLab(suite, principal, {
      scenarioId: scenario.id,
      scenarioVersion: scenario.version + 1,
      idempotencyKey: "lab-start-historical-version",
    })).rejects.toEqual(new LabDomainError("labs.idempotency_conflict"));
    expect(suite.provider.provision).toHaveBeenCalledTimes(1);
  });

  it("ignores malformed provision output and persists only the trusted operation lookup result", async () => {
    const suite = harness();
    suite.controls.setProvisionRawResponse({ providerReference: "untrusted-response-reference" });
    await expect(startLab(suite, principal, {
      ...startCommand,
      idempotencyKey: "lab-start-malformed-provision",
    })).resolves.toMatchObject({ providerReference: "provider-session-1", state: "ready" });
    expect(suite.current().providerReference).not.toBe("untrusted-response-reference");
  });

  it("never persists or destroys a mismatched lookup reference and remains exactly resumable", async () => {
    const suite = harness();
    suite.controls.setLookupOverride({
      status: "succeeded",
      operationKey: "provider:lab-start-bad-lookup:provision",
      result: {
        sessionId: "foreign-session",
        scenarioId: scenario.id,
        scenarioVersion: scenario.version,
        ruleSetFingerprint: scenario.ruleSetFingerprint,
        providerReference: "untrusted-provider-reference",
        operationKey: "provider:lab-start-bad-lookup:provision",
      },
    });
    const command = { ...startCommand, idempotencyKey: "lab-start-bad-lookup" };
    await expect(startLab(suite, principal, command)).rejects.toEqual(
      new LabDomainError("labs.invalid_provider_response"),
    );
    expect(suite.current()).toMatchObject({ state: "provisioning", providerReference: null });
    expect(suite.provider.destroy).not.toHaveBeenCalled();
    suite.controls.setLookupOverride(null);
    await expect(startLab(suite, principal, command)).resolves.toMatchObject({ state: "ready", providerReference: "provider-session-1" });
  });

  it("leaves ambiguous provision outcomes pending until lookup resolves", async () => {
    const suite = harness();
    suite.controls.setProvisionStatusAfterCall("pending");
    const command = { ...startCommand, idempotencyKey: "lab-start-provider-pending" };
    await expect(startLab(suite, principal, command)).rejects.toEqual(
      new LabDomainError("labs.provision_outcome_pending"),
    );
    expect(suite.current()).toMatchObject({ state: "provisioning", providerReference: null });
    expect(suite.controls.command(command.idempotencyKey)?.status).toBe("pending");
  });

  it("rejects an impossible completed start failure receipt", async () => {
    const suite = harness();
    suite.controls.setProvisionStatusAfterCall("failed");
    const command = { ...startCommand, idempotencyKey: "lab-start-failed-receipt" };
    await expect(startLab(suite, principal, command)).rejects.toEqual(
      new LabDomainError("labs.provision_failed"),
    );
    suite.controls.mutateBegin((record) => {
      record.session = { ...record.session, version: 4 };
      return record;
    });
    await expect(startLab(suite, principal, command)).rejects.toEqual(
      new LabDomainError("labs.invalid_repository_response"),
    );
  });
});

describe("atomic creation preconditions and cleanup takeover", () => {
  it("does not weaken learner entitlement or tenant authorization on normal operations", async () => {
    const noEntitlement = harness({ initialSession: ready, entitled: false });
    await expect(createLabAccessGrant(noEntitlement, principal, {
      sessionId: ready.id,
      expectedVersion: ready.version,
      idempotencyKey: "lab-access-entitlement-revoked",
    })).rejects.toEqual(new LabDomainError("labs.entitlement_required"));
    expect(noEntitlement.controls.commandCount()).toBe(0);

    const managerCannotLease = harness({ initialSession: ready });
    await expect(createLabAccessGrant(managerCannotLease, manager, {
      sessionId: ready.id,
      expectedVersion: ready.version,
      idempotencyKey: "lab-access-manager-forbidden",
    })).rejects.toEqual(new LabDomainError("labs.forbidden"));

    const internalCannotUse = harness({ initialSession: ready });
    await expect(destroyLab(internalCannotUse, internalReconciler, {
      sessionId: ready.id,
      expectedVersion: ready.version,
      idempotencyKey: "lab-destroy-internal-normal-path",
    })).rejects.toEqual(new LabDomainError("labs.forbidden"));
  });

  it("does not persist a command when the source session or active lease is already expired", async () => {
    const expiredSession = harness({
      initialSession: { ...ready, expiresAt: "2026-07-18T07:59:59.000Z" },
    });
    const accessKey = "lab-access-expired-source";
    await expect(createLabAccessGrant(expiredSession, principal, {
      sessionId: ready.id,
      expectedVersion: ready.version,
      idempotencyKey: accessKey,
    })).rejects.toEqual(new LabDomainError("labs.invalid_transition"));
    expect(expiredSession.controls.command(accessKey)).toBeUndefined();

    const expiredLease = harness({
      initialSession: {
        ...active,
        activeLease: {
          ...activeLease,
          issuedAt: "2026-07-18T07:00:00.000Z",
          expiresAt: "2026-07-18T07:59:59.000Z",
        },
      },
    });
    const validateKey = "lab-validate-expired-lease";
    await expect(validateLab(expiredLease, principal, {
      sessionId: active.id,
      expectedVersion: active.version,
      idempotencyKey: validateKey,
    })).rejects.toEqual(new LabDomainError("labs.invalid_transition"));
    expect(expiredLease.controls.command(validateKey)).toBeUndefined();
  });

  it("resumes an exact pending command using its valid creation time after wall-clock expiry", async () => {
    const suite = harness({ initialSession: active });
    suite.controls.setValidationThrows(true);
    const command = {
      sessionId: active.id,
      expectedVersion: active.version,
      idempotencyKey: "lab-validate-created-valid",
    };
    await expect(validateLab(suite, principal, command)).rejects.toThrow("validation response lost");
    await expect(validateLab(suite, principal, {
      ...command,
      idempotencyKey: "lab-validate-competing-key",
    })).rejects.toEqual(new LabDomainError("labs.idempotency_conflict"));
    suite.controls.advanceClock(2 * 60 * 60_000);
    suite.controls.setValidationThrows(false);
    await expect(validateLab(suite, principal, command)).resolves.toHaveLength(2);
    expect(suite.current()).toMatchObject({ state: "active", version: active.version + 2 });
  });

  it("lets a tenant manager take over revoked actor work using the original provider key only for cleanup", async () => {
    const suite = harness({ initialSession: active });
    suite.controls.setAccessThrows(true);
    const actorCommand = {
      sessionId: active.id,
      expectedVersion: active.version,
      idempotencyKey: "lab-access-pending-cleanup",
    };
    await expect(createLabAccessGrant(suite, principal, actorCommand)).rejects.toThrow("access response lost");
    await expect(createLabAccessGrant(suite, {
      ...principal,
      roles: ["trainer"],
      primaryRole: "trainer",
      permissions: [],
    }, actorCommand)).rejects.toEqual(new LabDomainError("labs.forbidden"));

    const cleanup = {
      sessionId: active.id,
      expectedVersion: active.version,
      pendingCommandKey: actorCommand.idempotencyKey,
      idempotencyKey: "lab-cleanup-revoked-actor",
      reason: "authorization_revoked" as const,
    };
    await expect(cleanupPendingLab(suite, manager, cleanup)).resolves.toMatchObject({ state: "destroyed" });
    expect(suite.provider.destroy).toHaveBeenCalledWith({
      operationKey: "provider:lab-access-pending-cleanup:cleanup",
      providerReference: active.providerReference,
    });
    expect(suite.provider.createAccessGrant).toHaveBeenCalledTimes(1);
    await expect(cleanupPendingLab(suite, manager, cleanup)).resolves.toMatchObject({ state: "destroyed" });
    expect(suite.provider.destroy).toHaveBeenCalledTimes(1);
  });

  it("allows an internal reconciler to clean a pending start with no provider or scenario definition", async () => {
    const suite = harness();
    suite.controls.setProvisionStatusAfterCall("pending");
    const command = { ...startCommand, idempotencyKey: "lab-start-abandoned-no-provider" };
    await expect(startLab(suite, principal, command)).rejects.toEqual(
      new LabDomainError("labs.provision_outcome_pending"),
    );
    suite.controls.removeAllScenarios();
    suite.controls.setLookupOverride({
      status: "not_found",
      operationKey: "provider:lab-start-abandoned-no-provider:provision",
    });
    await expect(cleanupPendingLab(suite, internalReconciler, {
      sessionId: requested.id,
      expectedVersion: 2,
      pendingCommandKey: command.idempotencyKey,
      idempotencyKey: "lab-cleanup-abandoned-start",
      reason: "session_abandoned",
    })).resolves.toMatchObject({ state: "destroyed", providerReference: null });
    expect(suite.repository.getScenario).toHaveBeenCalledTimes(1);
    expect(suite.provider.destroy).not.toHaveBeenCalled();
  });
});

describe("deterministic validation evidence", () => {
  it("rejects duplicate result IDs, score contradictions, missing evidence, and future timestamps", async () => {
    const cases: Array<{ name: string; mutate: (results: LabValidationResult[]) => LabValidationResult[] }> = [
      {
        name: "duplicate-id",
        mutate: (results) => [results[0]!, { ...results[1]!, id: results[0]!.id }],
      },
      {
        name: "score-pass-conflict",
        mutate: (results) => [{ ...results[0]!, score: 0.2, passed: true }, results[1]!],
      },
      {
        name: "missing-required-evidence",
        mutate: (results) => [results[0]!, { ...results[1]!, evidenceReference: null }],
      },
      {
        name: "future-timestamp",
        mutate: (results) => [{ ...results[0]!, validatedAt: "2026-07-19T08:00:00.000Z" }, results[1]!],
      },
    ];
    for (const testCase of cases) {
      const suite = harness({ initialSession: active });
      suite.controls.setValidationResults(testCase.mutate(validationResults()));
      await expect(validateLab(suite, principal, {
        sessionId: active.id,
        expectedVersion: active.version,
        idempotencyKey: `lab-validate-${testCase.name}`,
      })).rejects.toEqual(new LabDomainError("labs.invalid_validation_result"));
      expect(suite.current()).toMatchObject({ state: "failed", activeLease: null });
    }
  });
});

describe("complete aggregate binding", () => {
  it("rejects begin records that swap provider, snapshot, expiry, lease, or failure fields", async () => {
    const mutations: Array<{ name: string; mutate: (record: MutableRecord) => void }> = [
      { name: "provider", mutate: (record) => { record.session.providerReference = "swapped-provider"; } },
      {
        name: "snapshot",
        mutate: (record) => {
          record.session.scenarioSnapshot = {
            ...record.session.scenarioSnapshot,
            provisioningConfig: { template: "swapped-template" },
          };
        },
      },
      { name: "expiry", mutate: (record) => { record.session.expiresAt = "2026-07-18T08:45:00.000Z"; } },
      { name: "lease", mutate: (record) => { record.leaseToRevoke = activeLease; } },
      { name: "failure", mutate: (record) => { record.session.failureCode = "swapped-failure"; } },
    ];
    for (const mutation of mutations) {
      const suite = harness({ initialSession: ready });
      suite.controls.mutateBegin((record) => {
        mutation.mutate(record);
        return record;
      });
      await expect(createLabAccessGrant(suite, principal, {
        sessionId: ready.id,
        expectedVersion: ready.version,
        idempotencyKey: `lab-access-swap-${mutation.name}`,
      })).rejects.toBeInstanceOf(LabDomainError);
      expect(suite.provider.createAccessGrant).not.toHaveBeenCalled();
    }
  });

  it("requires save and terminal repository responses to equal the full proposed aggregate", async () => {
    const badSave = harness();
    badSave.controls.mutateSave((record) => {
      record.session.providerReference = "swapped-save-provider";
      return record;
    });
    await expect(startLab(badSave, principal, {
      ...startCommand,
      idempotencyKey: "lab-start-malicious-save",
    })).rejects.toEqual(new LabDomainError("labs.invalid_repository_response"));

    const badComplete = harness({ initialSession: ready });
    badComplete.controls.mutateComplete((record) => {
      record.session.providerReference = "swapped-terminal-provider";
      return record;
    });
    await expect(destroyLab(badComplete, manager, {
      sessionId: ready.id,
      expectedVersion: ready.version,
      idempotencyKey: "lab-destroy-malicious-complete",
    })).rejects.toBeInstanceOf(LabDomainError);
  });

  it("re-derives an exact pending replay from its immutable source aggregate", async () => {
    const suite = harness({ initialSession: active });
    suite.controls.setValidationThrows(true);
    const command = {
      sessionId: active.id,
      expectedVersion: active.version,
      idempotencyKey: "lab-validate-source-swap-replay",
    };
    await expect(validateLab(suite, principal, command)).rejects.toThrow("validation response lost");
    suite.controls.setValidationThrows(false);
    suite.controls.mutateBegin((record) => {
      if (record.intent.operation === "validate") {
        record.intent = {
          ...record.intent,
          sourceSession: { ...record.intent.sourceSession, providerReference: "swapped-source-provider" },
        };
      }
      return record;
    });
    await expect(validateLab(suite, principal, command)).rejects.toEqual(
      new LabDomainError("labs.invalid_repository_response"),
    );
    expect(suite.provider.validate).toHaveBeenCalledTimes(1);
  });
});

describe("access grant replay and timing", () => {
  it("denies a completed access URL after reset revokes and replaces the authoritative lease state", async () => {
    const suite = harness({ initialSession: ready });
    const accessCommand = {
      sessionId: ready.id,
      expectedVersion: ready.version,
      idempotencyKey: "lab-access-stale-replay",
    };
    await createLabAccessGrant(suite, principal, accessCommand);
    await resetLab(suite, manager, {
      sessionId: ready.id,
      expectedVersion: 5,
      idempotencyKey: "lab-reset-revokes-grant",
    });
    await expect(createLabAccessGrant(suite, principal, accessCommand)).rejects.toEqual(
      new LabDomainError("labs.stale_session"),
    );
    expect(suite.provider.createAccessGrant).toHaveBeenCalledTimes(1);
  });

  it("uses post-provider time and maps slow or negative-lifetime grants to domain errors", async () => {
    const slow = harness({ initialSession: ready });
    slow.controls.advanceDuringGrant(6 * 60_000);
    await expect(createLabAccessGrant(slow, principal, {
      sessionId: ready.id,
      expectedVersion: ready.version,
      idempotencyKey: "lab-access-slow-provider",
    })).rejects.toEqual(new LabDomainError("labs.invalid_access_grant"));

    const negative = harness({ initialSession: ready });
    negative.controls.setAccessGrant({
      accessUrl: "https://lab.example.test/signed",
      sessionId: ready.id,
      providerReference: ready.providerReference,
      leaseReference: "lease-negative",
      operationKey: "provider:lab-access-negative-life:access",
      issuedAt: baseTimestamp,
      expiresAt: "2026-07-18T07:59:59.000Z",
    });
    await expect(createLabAccessGrant(negative, principal, {
      sessionId: ready.id,
      expectedVersion: ready.version,
      idempotencyKey: "lab-access-negative-life",
    })).rejects.toEqual(new LabDomainError("labs.invalid_provider_response"));
    expect(negative.controls.command("lab-access-negative-life")?.status).toBe("pending");
    await expect(cleanupPendingLab(negative, manager, {
      sessionId: ready.id,
      expectedVersion: ready.version,
      pendingCommandKey: "lab-access-negative-life",
      idempotencyKey: "lab-cleanup-negative-grant",
      reason: "operator_reconciliation",
    })).resolves.toMatchObject({ state: "destroyed" });
  });
});

describe("failed sessions without providers", () => {
  it("durably destroys a failed null-provider session without calling a provider or loading a scenario", async () => {
    const failed: LabSession = {
      ...requested,
      state: "failed",
      failureCode: "labs.provision_failed",
    };
    const suite = harness({ initialSession: failed });
    suite.controls.removeAllScenarios();
    const command = {
      sessionId: failed.id,
      expectedVersion: failed.version,
      idempotencyKey: "lab-destroy-failed-null-provider",
    };
    const destroyed = await destroyLab(suite, principal, command);
    expect(destroyed).toMatchObject({ state: "destroyed", version: failed.version + 1, providerReference: null });
    await expect(destroyLab(suite, principal, command)).resolves.toEqual(destroyed);
    expect(suite.provider.destroy).not.toHaveBeenCalled();
    expect(suite.repository.getScenario).not.toHaveBeenCalled();
    expect(suite.controls.command(command.idempotencyKey)).toMatchObject({ status: "completed" });
  });
});
