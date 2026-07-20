import { z } from "zod";

import { LAB_SESSION_STATES } from "@/entities/lab/state-machine";

export const LabSessionStateSchema = z.enum(LAB_SESSION_STATES);
export type LabSessionState = z.infer<typeof LabSessionStateSchema>;

const Sha256FingerprintSchema = z.string().regex(/^sha256:[a-f0-9]{64}$/);

export const LAB_PROVIDER_KINDS = ["docker", "kubernetes", "remote", "custom"] as const;
export const LabProviderKindSchema = z.enum(LAB_PROVIDER_KINDS);
export type LabProviderKind = z.infer<typeof LabProviderKindSchema>;

function validateProvisioningValue(
  value: unknown,
  context: z.RefinementCtx,
  path: (string | number)[],
  depth: number,
): void {
  if (depth > 5) {
    context.addIssue({ code: "custom", message: "Provisioning configuration is too deeply nested", path });
    return;
  }
  if (value === null || typeof value === "boolean") return;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) context.addIssue({ code: "custom", message: "Provisioning numbers must be finite", path });
    return;
  }
  if (typeof value === "string") {
    if (value.length > 512) context.addIssue({ code: "custom", message: "Provisioning strings are too long", path });
    return;
  }
  if (Array.isArray(value)) {
    if (value.length > 32) context.addIssue({ code: "custom", message: "Provisioning arrays are too large", path });
    value.slice(0, 32).forEach((entry, index) => validateProvisioningValue(entry, context, [...path, index], depth + 1));
    return;
  }
  if (typeof value === "object") {
    const entries = Object.entries(value);
    if (entries.length > 32) context.addIssue({ code: "custom", message: "Provisioning objects have too many fields", path });
    for (const [key, entry] of entries.slice(0, 32)) {
      if (!/^[a-z][a-z0-9_-]{0,63}$/i.test(key)) {
        context.addIssue({ code: "custom", message: "Provisioning field name is invalid", path: [...path, key] });
      }
      if (/(?:secret|token|password|credential|private.?key|api.?key)/i.test(key)) {
        context.addIssue({ code: "custom", message: "Provisioning configuration cannot contain secrets", path: [...path, key] });
      }
      validateProvisioningValue(entry, context, [...path, key], depth + 1);
    }
    return;
  }
  context.addIssue({ code: "custom", message: "Provisioning configuration must be JSON-safe", path });
}

export const LabProvisioningConfigSchema = z.record(z.string(), z.unknown()).superRefine((value, context) => {
  validateProvisioningValue(value, context, [], 0);
});
export type LabProvisioningConfig = z.infer<typeof LabProvisioningConfigSchema>;

export const LabValidationRuleSchema = z.object({
  id: z.string().trim().min(1).max(160),
  passingScore: z.number().min(0).max(1),
  evidenceRequired: z.boolean(),
}).strict();
export type LabValidationRule = z.infer<typeof LabValidationRuleSchema>;

function addUniqueRuleIssue(
  value: { validationRules: readonly { id: string }[] },
  context: z.RefinementCtx,
): void {
  const ids = value.validationRules.map((rule) => rule.id);
  if (new Set(ids).size !== ids.length) {
    context.addIssue({
      code: "custom",
      message: "Validation rule identifiers must be unique",
      path: ["validationRules"],
    });
  }
}

export const LabScenarioSchema = z.object({
  id: z.string().trim().min(1).max(160),
  organizationId: z.string().trim().min(1).max(160).nullable(),
  title: z.string().trim().min(1).max(180),
  version: z.number().int().positive(),
  retentionMinutes: z.number().int().positive().max(10080),
  ruleSetFingerprint: Sha256FingerprintSchema,
  validationRules: z.array(LabValidationRuleSchema).min(1).max(256),
  providerKind: LabProviderKindSchema,
  provisioningConfig: LabProvisioningConfigSchema,
}).strict().superRefine(addUniqueRuleIssue);
export type LabScenario = z.infer<typeof LabScenarioSchema>;

export const LabScenarioSnapshotSchema = z.object({
  scenarioId: z.string().trim().min(1).max(160),
  scenarioVersion: z.number().int().positive(),
  retentionMinutes: z.number().int().positive().max(10080),
  ruleSetFingerprint: Sha256FingerprintSchema,
  validationRules: z.array(LabValidationRuleSchema).min(1).max(256),
  providerKind: LabProviderKindSchema,
  provisioningConfig: LabProvisioningConfigSchema,
}).strict().superRefine(addUniqueRuleIssue);
export type LabScenarioSnapshot = z.infer<typeof LabScenarioSnapshotSchema>;

export const LabAccessLeaseSchema = z.object({
  sessionId: z.string().trim().min(1).max(160),
  providerReference: z.string().trim().min(1).max(512),
  leaseReference: z.string().trim().min(1).max(512),
  issuedAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
}).strict().superRefine((lease, context) => {
  if (Date.parse(lease.expiresAt) <= Date.parse(lease.issuedAt)) {
    context.addIssue({ code: "custom", message: "Lease expiry must follow issue time", path: ["expiresAt"] });
  }
});
export type LabAccessLease = z.infer<typeof LabAccessLeaseSchema>;

export const LabSessionSchema = z.object({
  id: z.string().trim().min(1).max(160),
  scenarioId: z.string().trim().min(1).max(160),
  scenarioVersion: z.number().int().positive(),
  scenarioSnapshot: LabScenarioSnapshotSchema,
  learnerId: z.string().trim().min(1).max(160),
  organizationId: z.string().trim().min(1).max(160),
  providerReference: z.string().trim().min(1).max(512).nullable(),
  activeLease: LabAccessLeaseSchema.nullable(),
  state: LabSessionStateSchema,
  version: z.number().int().positive(),
  requestedAt: z.string().datetime(),
  expiresAt: z.string().datetime().nullable(),
  failureCode: z.string().trim().min(1).max(160).nullable(),
}).strict().superRefine((session, context) => {
  if (
    session.scenarioId !== session.scenarioSnapshot.scenarioId
    || session.scenarioVersion !== session.scenarioSnapshot.scenarioVersion
  ) {
    context.addIssue({ code: "custom", message: "Scenario snapshot does not match the session", path: ["scenarioSnapshot"] });
  }
  if (session.activeLease && (
    session.activeLease.sessionId !== session.id
    || session.activeLease.providerReference !== session.providerReference
    || (session.expiresAt !== null && Date.parse(session.activeLease.expiresAt) > Date.parse(session.expiresAt))
  )) {
    context.addIssue({ code: "custom", message: "Active lease does not match the session", path: ["activeLease"] });
  }
  if (["active", "validating"].includes(session.state) && session.activeLease === null) {
    context.addIssue({ code: "custom", message: "An active lab state requires a lease", path: ["activeLease"] });
  }
  if (["requested", "provisioning", "ready", "reset_pending", "destroy_pending", "destroyed", "failed", "expired"].includes(session.state) && session.activeLease !== null) {
    context.addIssue({ code: "custom", message: "This lab state cannot retain an active lease", path: ["activeLease"] });
  }
  if (session.state === "requested" && session.providerReference !== null) {
    context.addIssue({ code: "custom", message: "A requested session cannot have a provider reference", path: ["providerReference"] });
  }
  if (["ready", "active", "validating", "reset_pending", "destroy_pending", "expired"].includes(session.state) && session.providerReference === null) {
    context.addIssue({ code: "custom", message: "This lab state requires a provider reference", path: ["providerReference"] });
  }
  if (["ready", "active", "validating", "reset_pending"].includes(session.state) && session.expiresAt === null) {
    context.addIssue({ code: "custom", message: "This lab state requires an expiry", path: ["expiresAt"] });
  }
  if (["requested", "provisioning"].includes(session.state) && session.expiresAt !== null) {
    context.addIssue({ code: "custom", message: "Provisioning states cannot have an activity expiry", path: ["expiresAt"] });
  }
  if (["requested", "provisioning"].includes(session.state) && session.failureCode !== null) {
    context.addIssue({ code: "custom", message: "Provisioning states cannot carry a terminal failure", path: ["failureCode"] });
  }
});
export type LabSession = z.infer<typeof LabSessionSchema>;

const HttpsUrlSchema = z.string().trim().min(1).max(2048).superRefine((value, context) => {
  try {
    if (new URL(value).protocol !== "https:") {
      context.addIssue({ code: "custom", message: "Lab access URL must use HTTPS" });
    }
  } catch {
    context.addIssue({ code: "custom", message: "Lab access URL must be valid" });
  }
});

export const LabAccessGrantSchema = z.object({
  accessUrl: HttpsUrlSchema,
  sessionId: z.string().trim().min(1).max(160),
  providerReference: z.string().trim().min(1).max(512),
  leaseReference: z.string().trim().min(1).max(512),
  operationKey: z.string().trim().min(1).max(256),
  issuedAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
}).strict().superRefine((grant, context) => {
  if (Date.parse(grant.expiresAt) <= Date.parse(grant.issuedAt)) {
    context.addIssue({ code: "custom", message: "Grant expiry must follow issue time", path: ["expiresAt"] });
  }
});
export type LabAccessGrant = z.infer<typeof LabAccessGrantSchema>;

export const LabProvisionResultSchema = z.object({
  sessionId: z.string().trim().min(1).max(160),
  scenarioId: z.string().trim().min(1).max(160),
  scenarioVersion: z.number().int().positive(),
  ruleSetFingerprint: Sha256FingerprintSchema,
  providerReference: z.string().trim().min(1).max(512),
  operationKey: z.string().trim().min(1).max(256),
}).strict();
export type LabProvisionResult = z.infer<typeof LabProvisionResultSchema>;

export const LabProviderHealthSchema = z.object({
  providerReference: z.string().trim().min(1).max(512),
  operationKey: z.string().trim().min(1).max(256),
  healthy: z.boolean(),
  checkedAt: z.string().datetime(),
}).strict();
export type LabProviderHealth = z.infer<typeof LabProviderHealthSchema>;

export const LabProviderEffectSchema = z.object({
  providerReference: z.string().trim().min(1).max(512),
  operationKey: z.string().trim().min(1).max(256),
  applied: z.literal(true),
}).strict();
export type LabProviderEffect = z.infer<typeof LabProviderEffectSchema>;

export const LabProvisionOperationStatusSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.enum(["pending", "not_found"]),
    operationKey: z.string().trim().min(1).max(256),
  }).strict(),
  z.object({
    status: z.literal("failed"),
    operationKey: z.string().trim().min(1).max(256),
    failureCode: z.string().trim().min(1).max(160),
  }).strict(),
  z.object({
    status: z.literal("succeeded"),
    operationKey: z.string().trim().min(1).max(256),
    result: LabProvisionResultSchema,
  }).strict(),
]);
export type LabProvisionOperationStatus = z.infer<typeof LabProvisionOperationStatusSchema>;

export const LabEvidenceReferenceSchema = z.object({
  kind: z.enum(["artifact", "log", "report", "screenshot"]),
  reference: z.string().trim().min(1).max(1024),
  integrityHash: Sha256FingerprintSchema.nullable(),
}).strict();
export type LabEvidenceReference = z.infer<typeof LabEvidenceReferenceSchema>;

export const LabValidationResultSchema = z.object({
  id: z.string().trim().min(1).max(160),
  sessionId: z.string().trim().min(1).max(160),
  ruleId: z.string().trim().min(1).max(160),
  passed: z.boolean(),
  score: z.number().min(0).max(1),
  evidenceReference: LabEvidenceReferenceSchema.nullable(),
  validatedAt: z.string().datetime(),
}).strict();
export type LabValidationResult = z.infer<typeof LabValidationResultSchema>;

export const LabValidationBatchSchema = z.object({
  sessionId: z.string().trim().min(1).max(160),
  scenarioVersion: z.number().int().positive(),
  ruleSetFingerprint: Sha256FingerprintSchema,
  providerReference: z.string().trim().min(1).max(512),
  operationKey: z.string().trim().min(1).max(256),
  results: z.array(LabValidationResultSchema).max(256),
}).strict();
export type LabValidationBatch = z.infer<typeof LabValidationBatchSchema>;

export const LabProviderAvailabilitySchema = z.discriminatedUnion("available", [
  z.object({ available: z.literal(true) }).strict(),
  z.object({
    available: z.literal(false),
    reason: z.enum(["not_configured", "temporarily_unavailable", "capacity_exhausted"]),
    retryAfterSeconds: z.number().int().positive().optional(),
  }).strict(),
]);
export type LabProviderAvailability = z.infer<typeof LabProviderAvailabilitySchema>;

const CommandKeySchema = z.string().trim().min(12).max(128);
const VersionedSessionCommandSchema = z.object({
  sessionId: z.string().trim().min(1).max(160),
  expectedVersion: z.number().int().positive(),
  idempotencyKey: CommandKeySchema,
}).strict();

export const StartLabInputSchema = z.object({
  scenarioId: z.string().trim().min(1).max(160),
  scenarioVersion: z.number().int().positive(),
  idempotencyKey: CommandKeySchema,
}).strict();
export type StartLabInput = z.infer<typeof StartLabInputSchema>;

export const AccessLabInputSchema = VersionedSessionCommandSchema;
export type AccessLabInput = z.infer<typeof AccessLabInputSchema>;

export const ResetLabInputSchema = VersionedSessionCommandSchema;
export type ResetLabInput = z.infer<typeof ResetLabInputSchema>;

export const DestroyLabInputSchema = VersionedSessionCommandSchema;
export type DestroyLabInput = z.infer<typeof DestroyLabInputSchema>;

export const ValidateLabInputSchema = VersionedSessionCommandSchema;
export type ValidateLabInput = z.infer<typeof ValidateLabInputSchema>;

export const CleanupPendingLabInputSchema = z.object({
  sessionId: z.string().trim().min(1).max(160),
  expectedVersion: z.number().int().positive(),
  pendingCommandKey: CommandKeySchema,
  idempotencyKey: CommandKeySchema,
  reason: z.enum(["authorization_revoked", "entitlement_revoked", "session_abandoned", "operator_reconciliation"]),
}).strict();
export type CleanupPendingLabInput = z.infer<typeof CleanupPendingLabInputSchema>;
