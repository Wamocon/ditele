import { describe, expect, it } from "vitest";

import {
  AI_MODES,
  MEMBERSHIP_STATES,
  ORGANIZATION_STATES,
  RECORD_STATES,
} from "@/entities/common/persistence-states";
import { DELIVERY_STATES } from "@/entities/integration/state-machine";
import { LAB_SESSION_STATES } from "@/entities/lab/state-machine";
import { PRIVACY_REQUEST_STATES } from "@/entities/privacy/state-machine";
import { AiInteractionModeSchema } from "@/features/ai/model";
import {
  EntitlementGrantSchema,
  ProductPackageStateSchema,
} from "@/features/entitlements/model";
import {
  IntegrationConnectionSchema,
  IntegrationConnectionStateSchema,
  IntegrationDeliveryStateSchema,
} from "@/features/integrations/model";
import { LabSessionStateSchema } from "@/features/labs/model";
import {
  OrganizationMembershipStateSchema,
  OrganizationStateSchema,
} from "@/features/organizations/model";
import { PrivacyRequestStateSchema } from "@/features/privacy/model";
import type { Database } from "@/shared/database/database.types";

function databaseEnum<DatabaseValue extends string>() {
  return <const Values extends readonly DatabaseValue[]>(
    values: DatabaseValue extends Values[number] ? Values : never,
  ) => values;
}

const databaseRecordStates = databaseEnum<Database["public"]["Enums"]["record_state"]>()(RECORD_STATES);
const databaseOrganizationStates = databaseEnum<Database["public"]["Enums"]["organization_state"]>()(ORGANIZATION_STATES);
const databaseMembershipStates = databaseEnum<Database["public"]["Enums"]["membership_state"]>()(MEMBERSHIP_STATES);
const databaseLabStates = databaseEnum<Database["public"]["Enums"]["lab_session_state"]>()(LAB_SESSION_STATES);
const databaseDeliveryStates = databaseEnum<Database["public"]["Enums"]["delivery_state"]>()(DELIVERY_STATES);
const databaseRequestStates = databaseEnum<Database["public"]["Enums"]["request_state"]>()(PRIVACY_REQUEST_STATES);
const databaseAiModes = databaseEnum<Database["public"]["Enums"]["ai_mode"]>()(AI_MODES);

describe("advanced persistence state contracts", () => {
  it("keeps every canonical runtime union exhaustive with the generated database enums", () => {
    expect(databaseRecordStates).toEqual(["draft", "active", "inactive", "archived"]);
    expect(databaseOrganizationStates).toEqual(["active", "suspended", "archived"]);
    expect(databaseMembershipStates).toEqual(["invited", "active", "suspended", "removed"]);
    expect(databaseLabStates).toEqual([
      "requested",
      "provisioning",
      "ready",
      "active",
      "validating",
      "reset_pending",
      "destroy_pending",
      "destroyed",
      "failed",
      "expired",
    ]);
    expect(databaseDeliveryStates).toEqual([
      "pending",
      "processing",
      "delivered",
      "retry_scheduled",
      "dead_letter",
      "cancelled",
    ]);
    expect(databaseRequestStates).toEqual([
      "requested",
      "processing",
      "completed",
      "rejected",
      "cancelled",
    ]);
    expect(databaseAiModes).toEqual([
      "recommendation",
      "learning",
      "assessment",
      "trainer_draft",
    ]);
  });

  it("uses those exact unions at every advanced runtime boundary", () => {
    for (const state of RECORD_STATES) {
      expect(ProductPackageStateSchema.parse(state)).toBe(state);
      expect(IntegrationConnectionStateSchema.parse(state)).toBe(state);
    }
    for (const state of ORGANIZATION_STATES) {
      expect(OrganizationStateSchema.parse(state)).toBe(state);
    }
    for (const state of MEMBERSHIP_STATES) {
      expect(OrganizationMembershipStateSchema.parse(state)).toBe(state);
    }
    for (const state of LAB_SESSION_STATES) {
      expect(LabSessionStateSchema.parse(state)).toBe(state);
    }
    for (const state of DELIVERY_STATES) {
      expect(IntegrationDeliveryStateSchema.parse(state)).toBe(state);
    }
    for (const state of PRIVACY_REQUEST_STATES) {
      expect(PrivacyRequestStateSchema.parse(state)).toBe(state);
    }
    for (const mode of AI_MODES) {
      expect(AiInteractionModeSchema.parse(mode)).toBe(mode);
    }
  });

  it("rejects the former non-persistable state vocabulary and silent legacy fields", () => {
    expect(LabSessionStateSchema.safeParse("in_use").success).toBe(false);
    expect(LabSessionStateSchema.safeParse("resetting").success).toBe(false);
    expect(LabSessionStateSchema.safeParse("completed").success).toBe(false);
    expect(IntegrationDeliveryStateSchema.safeParse("delivering").success).toBe(false);
    expect(IntegrationConnectionStateSchema.safeParse("enabled").success).toBe(false);
    expect(PrivacyRequestStateSchema.safeParse("identity_verified").success).toBe(false);
    expect(PrivacyRequestStateSchema.safeParse("ready").success).toBe(false);
    expect(ProductPackageStateSchema.safeParse("preview").success).toBe(false);
    expect(AiInteractionModeSchema.safeParse("trainer_feedback_draft").success).toBe(false);

    expect(IntegrationConnectionSchema.safeParse({
      id: "connection-1",
      organizationId: "org-1",
      kind: "webhook",
      status: "enabled",
      allowedEventTypes: [],
      allowedPayloadFields: [],
      maxAttempts: 3,
    }).success).toBe(false);
    expect(EntitlementGrantSchema.safeParse({
      id: "grant-1",
      subjectId: null,
      organizationId: "org-1",
      packageId: "package-1",
      capability: "learning",
      state: "active",
      validFrom: "2026-07-18T10:00:00.000Z",
      validUntil: null,
    }).success).toBe(false);
  });
});
