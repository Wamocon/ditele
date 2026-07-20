import { describe, expect, it, vi } from "vitest";

import type { Principal } from "@/shared/auth/types";

import {
  LabAccessGrantSchema,
  LabScenarioSchema,
  LabSessionSchema,
  type LabScenario,
  type LabSession,
} from "./model";
import {
  LabDomainError,
  cleanupPendingLab,
  createLabAccessGrant,
  startLab,
  transitionLabSession,
  type LabProvider,
  type LabRepository,
} from "./service";

const timestamp = "2026-07-18T08:00:00.000Z";
const fingerprint = `sha256:${"a".repeat(64)}`;
const principal: Principal = {
  userId: "learner-1",
  sessionId: "auth-session-1",
  organizationId: "org-1",
  primaryRole: "learner",
  roles: ["learner"],
  permissions: ["learning.submit"],
  cohortIds: [],
};
const scenario: LabScenario = {
  id: "scenario-1",
  organizationId: "org-1",
  title: "Web shop",
  version: 3,
  retentionMinutes: 60,
  ruleSetFingerprint: fingerprint,
  validationRules: [{ id: "rule-1", passingScore: 0.8, evidenceRequired: false }],
  providerKind: "docker",
  provisioningConfig: {
    template: "shop-v3",
    resources: { cpu: 1, memoryMb: 512 },
  },
};
const snapshot = {
  scenarioId: scenario.id,
  scenarioVersion: scenario.version,
  retentionMinutes: scenario.retentionMinutes,
  ruleSetFingerprint: fingerprint,
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
  requestedAt: timestamp,
  expiresAt: null,
  failureCode: null,
};

function unreachableDependencies() {
  const repository: LabRepository = {
    getScenario: vi.fn(async () => scenario),
    getSession: vi.fn(async () => requested),
    beginStartCommand: vi.fn(async () => { throw new Error("unexpected"); }),
    beginSessionCommand: vi.fn(async () => { throw new Error("unexpected"); }),
    beginCleanupTakeover: vi.fn(async () => { throw new Error("unexpected"); }),
    savePendingCommand: vi.fn(async () => { throw new Error("unexpected"); }),
    completeCommand: vi.fn(async () => { throw new Error("unexpected"); }),
  };
  const provider: LabProvider = {
    availability: vi.fn(async () => ({ available: true })),
    provision: vi.fn(async () => null),
    lookupProvision: vi.fn(async () => null),
    healthCheck: vi.fn(async () => null),
    createAccessGrant: vi.fn(async () => null),
    revokeAccessLease: vi.fn(async () => null),
    reset: vi.fn(async () => null),
    validate: vi.fn(async () => null),
    destroy: vi.fn(async () => null),
  };
  return {
    repository,
    provider,
    entitlements: { isEntitled: vi.fn(async () => true) },
    clock: () => new Date(timestamp),
  };
}

describe("lab model and command boundaries", () => {
  it("requires bounded, secret-free provider configuration in immutable scenarios", () => {
    expect(LabScenarioSchema.safeParse(scenario).success).toBe(true);
    expect(LabScenarioSchema.safeParse({
      ...scenario,
      provisioningConfig: { apiToken: "must-not-enter-a-snapshot" },
    }).success).toBe(false);
    expect(LabScenarioSchema.safeParse({
      ...scenario,
      provisioningConfig: { template: "x".repeat(513) },
    }).success).toBe(false);
    expect(LabScenarioSchema.safeParse({ ...scenario, providerKind: "unknown" }).success).toBe(false);
  });

  it("keeps malformed URLs and non-positive grant lifetimes inside schema errors", () => {
    const base = {
      sessionId: requested.id,
      providerReference: "provider-1",
      leaseReference: "lease-1",
      operationKey: "provider:access",
      issuedAt: timestamp,
      expiresAt: "2026-07-18T08:05:00.000Z",
    };
    expect(() => LabAccessGrantSchema.safeParse({ ...base, accessUrl: "%%%" })).not.toThrow();
    expect(LabAccessGrantSchema.safeParse({ ...base, accessUrl: "%%%" }).success).toBe(false);
    expect(LabAccessGrantSchema.safeParse({
      ...base,
      accessUrl: "https://lab.example.test/signed",
      expiresAt: timestamp,
    }).success).toBe(false);
    expect(LabAccessGrantSchema.safeParse({
      ...base,
      accessUrl: "https://lab.example.test/signed",
      expiresAt: "2026-07-18T07:59:59.000Z",
    }).success).toBe(false);
  });

  it("requires the complete immutable scenario snapshot on every session", () => {
    expect(LabSessionSchema.safeParse(requested).success).toBe(true);
    expect(LabSessionSchema.safeParse({ ...requested, scenarioSnapshot: undefined }).success).toBe(false);
    expect(LabSessionSchema.safeParse({
      ...requested,
      scenarioSnapshot: { ...snapshot, provisioningConfig: { password: "no" } },
    }).success).toBe(false);
  });

  it("supports the safe failed-without-provider direct destroy transition", () => {
    const failed = { ...requested, state: "failed" as const, failureCode: "labs.provision_failed" };
    expect(transitionLabSession(failed, "destroyed", failed.version)).toMatchObject({
      state: "destroyed",
      version: failed.version + 1,
      providerReference: null,
    });
  });

  it("maps malformed commands to LabDomainError before touching dependencies", async () => {
    const suite = unreachableDependencies();
    await expect(startLab(suite, principal, {
      scenarioId: scenario.id,
      idempotencyKey: "missing-version-key",
    })).rejects.toEqual(new LabDomainError("labs.invalid_command"));
    await expect(createLabAccessGrant(suite, principal, {
      sessionId: requested.id,
      expectedVersion: 1,
      idempotencyKey: "short",
    })).rejects.toEqual(new LabDomainError("labs.invalid_command"));
    expect(suite.repository.getScenario).not.toHaveBeenCalled();
    expect(suite.repository.getSession).not.toHaveBeenCalled();
  });

  it("keeps normal and cleanup authorization separate", async () => {
    const suite = unreachableDependencies();
    await expect(startLab(suite, {
      ...principal,
      roles: ["trainer"],
      primaryRole: "trainer",
    }, {
      scenarioId: scenario.id,
      scenarioVersion: scenario.version,
      idempotencyKey: "lab-start-wrong-role",
    })).rejects.toEqual(new LabDomainError("labs.forbidden"));
    expect(suite.repository.getScenario).not.toHaveBeenCalled();

    await expect(cleanupPendingLab(suite, principal, {
      sessionId: requested.id,
      expectedVersion: requested.version,
      pendingCommandKey: "pending-command-key",
      idempotencyKey: "cleanup-command-key",
      reason: "operator_reconciliation",
    })).rejects.toEqual(new LabDomainError("labs.forbidden"));
    expect(suite.repository.beginCleanupTakeover).not.toHaveBeenCalled();
  });
});
