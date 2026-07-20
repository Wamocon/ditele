import { describe, expect, it } from "vitest";

import {
  CreatePrivateEvidenceUploadIntentInputSchema,
  PRIVATE_EVIDENCE_BUCKET,
  PrivateEvidenceCleanupBatchInputSchema,
  PrivateEvidenceUploadIntentSchema,
  PrivateEvidenceUploadIntentRpcRowSchema,
  ValidateAndFinalizePrivateEvidenceInputSchema,
  parsePrivateEvidenceObjectKey,
} from "./private-evidence-upload";

const organizationId = "11111111-1111-4111-8111-111111111111";
const ownerId = "22222222-2222-4222-8222-222222222222";
const attemptId = "33333333-3333-4333-8333-333333333333";
const uploadId = "44444444-4444-4444-8444-444444444444";
const correlationId = "55555555-5555-4555-8555-555555555555";
const objectKey = `${organizationId}/${ownerId}/${attemptId}/${uploadId}`;
const sha256Hex = "a".repeat(64);

function intentInput() {
  return {
    attemptId,
    title: "  Browser evidence  ",
    originalFileName: "Ｅｖｉｄｅｎｃｅ.TXT",
    mimeType: "text/plain",
    byteSize: 128,
    sha256Hex,
    idempotencyKey: "intent-command-0001",
    correlationId,
  };
}

function intent() {
  return {
    uploadId,
    attemptId,
    title: "Browser evidence",
    originalFileName: "Evidence.txt",
    mimeType: "text/plain",
    byteSize: 128,
    sha256Hex,
    intentIdempotencyKey: "intent-command-0001",
    bucketId: PRIVATE_EVIDENCE_BUCKET,
    objectKey,
    state: "pending",
    expiresAt: "2026-07-20T12:15:00.000Z",
    replayed: false,
    correlationId,
  };
}

describe("private evidence upload DTOs", () => {
  it("canonicalizes the title and validated basename at the boundary", () => {
    expect(CreatePrivateEvidenceUploadIntentInputSchema.parse(intentInput())).toEqual({
      ...intentInput(),
      title: "Browser evidence",
      originalFileName: "Evidence.txt",
    });
  });

  it.each([
    ["application/json", "report.json", 1024 * 1024 + 1],
    ["text/plain", "report.txt", 5 * 1024 * 1024 + 1],
    ["text/csv", "report.csv", 5 * 1024 * 1024 + 1],
    ["application/pdf", "report.pdf", 10 * 1024 * 1024 + 1],
    ["image/png", "report.png", 25 * 1024 * 1024 + 1],
    ["image/jpeg", "report.jpg", 25 * 1024 * 1024 + 1],
  ])("enforces the canonical %s byte cap", (mimeType, originalFileName, byteSize) => {
    const parsed = CreatePrivateEvidenceUploadIntentInputSchema.safeParse({
      ...intentInput(),
      mimeType,
      originalFileName,
      byteSize,
    });

    expect(parsed.success).toBe(false);
  });

  it("binds the pending target to the exact attempt and upload IDs", () => {
    expect(PrivateEvidenceUploadIntentSchema.parse(intent())).toEqual(intent());

    expect(
      PrivateEvidenceUploadIntentSchema.safeParse({
        ...intent(),
        attemptId: "66666666-6666-4666-8666-666666666666",
      }).success,
    ).toBe(false);
    expect(
      PrivateEvidenceUploadIntentSchema.safeParse({
        ...intent(),
        uploadId: "77777777-7777-4777-8777-777777777777",
      }).success,
    ).toBe(false);
  });

  it.each(["pending", "ready", "rejected", "removed", "expired"] as const)(
    "accepts the authoritative %s intent replay state",
    (uploadState) => {
      expect(
        PrivateEvidenceUploadIntentRpcRowSchema.parse({
          upload_id: uploadId,
          bucket_id: PRIVATE_EVIDENCE_BUCKET,
          object_key: objectKey,
          upload_state: uploadState,
          rejection_code:
            uploadState === "rejected"
              ? "hash_mismatch"
              : uploadState === "expired"
                ? "intent_expired"
                : null,
          expires_at: "2026-07-20T12:15:00.000Z",
          replayed: true,
          correlation_id: correlationId,
        }).upload_state,
      ).toBe(uploadState);
    },
  );

  it("rejects replay rows whose rejection code does not match their state", () => {
    const base = {
      upload_id: uploadId,
      bucket_id: PRIVATE_EVIDENCE_BUCKET,
      object_key: objectKey,
      expires_at: "2026-07-20T12:15:00.000Z",
      replayed: true,
      correlation_id: correlationId,
    };

    expect(
      PrivateEvidenceUploadIntentRpcRowSchema.safeParse({
        ...base,
        upload_state: "rejected",
        rejection_code: null,
      }).success,
    ).toBe(false);
    expect(
      PrivateEvidenceUploadIntentRpcRowSchema.safeParse({
        ...base,
        upload_state: "pending",
        rejection_code: "hash_mismatch",
      }).success,
    ).toBe(false);
    expect(
      PrivateEvidenceUploadIntentRpcRowSchema.safeParse({
        ...base,
        upload_state: "expired",
        rejection_code: "hash_mismatch",
      }).success,
    ).toBe(false);
  });

  it("parses only four canonical UUID path segments", () => {
    expect(parsePrivateEvidenceObjectKey(objectKey)).toEqual({
      organizationId,
      ownerId,
      attemptId,
      uploadId,
    });
    expect(parsePrivateEvidenceObjectKey(`${objectKey}/extra`)).toBeNull();
    expect(parsePrivateEvidenceObjectKey(objectKey.replace("/", "%2F"))).toBeNull();
    expect(parsePrivateEvidenceObjectKey("../../private")).toBeNull();
    expect(parsePrivateEvidenceObjectKey(Symbol("unsafe"))).toBeNull();
  });

  it("retains the original metadata and requires a distinct command key", () => {
    const parsed = ValidateAndFinalizePrivateEvidenceInputSchema.parse({
      intent: intent(),
      commandIdempotencyKey: "finalize-command-0001",
      correlationId,
    });

    expect(parsed.intent.originalFileName).toBe("Evidence.txt");
    expect(
      ValidateAndFinalizePrivateEvidenceInputSchema.safeParse({
        ...parsed,
        commandIdempotencyKey: "intent-command-0001",
      }).success,
    ).toBe(false);
    expect(
      ValidateAndFinalizePrivateEvidenceInputSchema.safeParse({
        ...parsed,
        correlationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      }).success,
    ).toBe(false);
    expect(
      ValidateAndFinalizePrivateEvidenceInputSchema.safeParse({
        ...parsed,
        unexpected: objectKey,
      }).success,
    ).toBe(false);
  });

  it("bounds cleanup batches below the database maximum", () => {
    expect(
      PrivateEvidenceCleanupBatchInputSchema.parse({ workerId: "evidence.worker" }),
    ).toEqual({ workerId: "evidence.worker", limit: 10 });
    expect(
      PrivateEvidenceCleanupBatchInputSchema.safeParse({
        workerId: "evidence.worker",
        limit: 26,
      }).success,
    ).toBe(false);
  });
});
