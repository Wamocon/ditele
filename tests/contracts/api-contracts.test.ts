import { describe, expect, it } from "vitest";

import {
  errorEnvelopeSchema,
  requestEnrollmentInputSchema,
  sessionPrincipalSchema,
  successEnvelopeSchema,
} from "@/shared/api/contracts";

const uuid = "01980a20-0000-7000-8000-000000000001";

describe("canonical API envelopes", () => {
  it("validates success correlation metadata", () => {
    const schema = successEnvelopeSchema(requestEnrollmentInputSchema);
    expect(
      schema.parse({
        data: {
          courseId: uuid,
          idempotencyKey: "request-000000000001",
        },
        meta: { correlation_id: uuid },
      }).data.courseId,
    ).toBe(uuid);
  });

  it("requires the complete typed error envelope", () => {
    expect(
      errorEnvelopeSchema.safeParse({
        error: {
          code: "STALE_VERSION",
          message_key: "errors.stale_version",
          field_errors: {},
          correlation_id: uuid,
          retryable: false,
        },
      }).success,
    ).toBe(true);
    expect(errorEnvelopeSchema.safeParse({ error: { code: "BROKEN" } }).success).toBe(
      false,
    );
  });
});

describe("server principal contract", () => {
  it("rejects browser-style guest or unknown roles", () => {
    expect(
      sessionPrincipalSchema.safeParse({
        userId: uuid,
        sessionId: "session",
        organizationId: uuid,
        primaryRole: "root",
        roles: ["root"],
        permissions: [],
        cohortIds: [],
      }).success,
    ).toBe(false);
  });
});

