import { describe, expect, it } from "vitest";

import { CreateExternalEvidenceInputSchema } from "./external-evidence";

const validInput = {
  title: "Login boundary report",
  sourceUri: "https://evidence.example.test/reports/login?run=42",
  idempotencyKey: "evidence-command-0001",
};

describe("external task evidence input", () => {
  it("trims the title and canonicalizes a credential-free HTTPS URL", () => {
    expect(CreateExternalEvidenceInputSchema.parse({
      ...validInput,
      title: "  Login boundary report  ",
      sourceUri: "https://evidence.example.test/reports/login",
    })).toMatchObject({
      title: "Login boundary report",
      sourceUri: "https://evidence.example.test/reports/login",
    });
  });

  it.each([
    "http://evidence.example.test/report",
    "https://learner:secret@evidence.example.test/report",
    "https:///missing-host",
    "https://?query-only",
    "javascript:alert(1)",
    "not-a-url",
  ])("rejects an unsafe source URL: %s", (sourceUri) => {
    expect(CreateExternalEvidenceInputSchema.safeParse({
      ...validInput,
      sourceUri,
    }).success).toBe(false);
  });

  it("rejects blank titles, short retry keys, malformed attempts, and extra data", () => {
    expect(CreateExternalEvidenceInputSchema.safeParse({
      ...validInput,
      title: "   ",
    }).success).toBe(false);
    expect(CreateExternalEvidenceInputSchema.safeParse({
      ...validInput,
      idempotencyKey: "short",
    }).success).toBe(false);
    expect(CreateExternalEvidenceInputSchema.safeParse({
      ...validInput,
      attemptId: "not-a-uuid",
    }).success).toBe(false);
    expect(CreateExternalEvidenceInputSchema.safeParse({
      ...validInput,
      privileged: true,
    }).success).toBe(false);
  });
});
