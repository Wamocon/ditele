import { z } from "zod";

import {
  getEvidenceUploadMaxBytes,
  validateEvidenceUploadMetadata,
} from "@/shared/auth/upload-policy";

export const PRIVATE_EVIDENCE_BUCKET = "task-evidence-private" as const;
export const PRIVATE_EVIDENCE_SIGNED_URL_TTL_SECONDS = 30;

export const EvidenceUploadMimeTypeSchema = z.enum([
  "application/json",
  "application/pdf",
  "image/jpeg",
  "image/png",
  "text/csv",
  "text/plain",
]);

export const PrivateEvidenceRejectionCodeSchema = z.enum([
  "empty_file",
  "hash_mismatch",
  "malformed_content",
  "malware_detected",
  "mime_mismatch",
  "object_unavailable",
  "size_mismatch",
  "unsupported_content",
]);

const CanonicalUuidSchema = z.string().uuid();
const TimestampSchema = z.string().datetime({ offset: true });
const Sha256Schema = z.string().regex(/^[0-9a-f]{64}$/u);
const IdempotencyKeySchema = z.string().trim().min(16).max(200);
const CorrelationIdSchema = CanonicalUuidSchema;
const ObjectKeySchema = z
  .string()
  .regex(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(?:\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}){3}$/u,
  );

function uploadMetadataIssue(
  value: {
    originalFileName: string;
    mimeType: z.infer<typeof EvidenceUploadMimeTypeSchema>;
    byteSize: number;
  },
  context: z.RefinementCtx,
): void {
  const maximum = getEvidenceUploadMaxBytes(value.mimeType);
  const validation = validateEvidenceUploadMetadata(
    {
      fileName: value.originalFileName,
      mimeType: value.mimeType,
      byteSize: value.byteSize,
    },
    maximum,
  );
  if (!validation.accepted) {
    context.addIssue({
      code: "custom",
      message: validation.code,
      path:
        validation.code === "file_too_large"
          ? ["byteSize"]
          : validation.code === "unsupported_type"
            ? ["mimeType"]
            : ["originalFileName"],
    });
  }
}

const PrivateEvidenceMetadataSchema = z
  .object({
    originalFileName: z.string().min(1).max(255),
    mimeType: EvidenceUploadMimeTypeSchema,
    byteSize: z.number().int().positive(),
    sha256Hex: Sha256Schema,
  })
  .strict()
  .superRefine(uploadMetadataIssue)
  .transform((value, context) => {
    const maximum = getEvidenceUploadMaxBytes(value.mimeType);
    const validation = validateEvidenceUploadMetadata(
      {
        fileName: value.originalFileName,
        mimeType: value.mimeType,
        byteSize: value.byteSize,
      },
      maximum,
    );
    if (!validation.accepted) {
      context.addIssue({ code: "custom", message: validation.code });
      return z.NEVER;
    }
    return {
      ...value,
      originalFileName: validation.metadata.fileName,
    };
  });

export const CreatePrivateEvidenceUploadIntentInputSchema = z
  .object({
    attemptId: CanonicalUuidSchema,
    title: z.string().trim().min(1).max(255),
    originalFileName: z.string().min(1).max(255),
    mimeType: EvidenceUploadMimeTypeSchema,
    byteSize: z.number().int().positive(),
    sha256Hex: Sha256Schema,
    idempotencyKey: IdempotencyKeySchema,
    correlationId: CorrelationIdSchema,
  })
  .strict()
  .superRefine(uploadMetadataIssue)
  .transform((value, context) => {
    const parsedMetadata = PrivateEvidenceMetadataSchema.safeParse({
      originalFileName: value.originalFileName,
      mimeType: value.mimeType,
      byteSize: value.byteSize,
      sha256Hex: value.sha256Hex,
    });
    if (!parsedMetadata.success) {
      context.addIssue({
        code: "custom",
        message: "invalid_upload_metadata",
      });
      return z.NEVER;
    }
    return { ...value, ...parsedMetadata.data };
  });

export const PrivateEvidenceUploadIntentSchema = z
  .object({
    uploadId: CanonicalUuidSchema,
    attemptId: CanonicalUuidSchema,
    title: z.string().trim().min(1).max(255),
    originalFileName: z.string().min(1).max(255),
    mimeType: EvidenceUploadMimeTypeSchema,
    byteSize: z.number().int().positive(),
    sha256Hex: Sha256Schema,
    intentIdempotencyKey: IdempotencyKeySchema,
    bucketId: z.literal(PRIVATE_EVIDENCE_BUCKET),
    objectKey: ObjectKeySchema,
    state: z.literal("pending"),
    expiresAt: TimestampSchema,
    replayed: z.boolean(),
    correlationId: CorrelationIdSchema,
  })
  .strict()
  .superRefine((value, context) => {
    uploadMetadataIssue(value, context);
    const identity = parsePrivateEvidenceObjectKey(value.objectKey);
    if (
      identity === null ||
      identity.attemptId !== value.attemptId ||
      identity.uploadId !== value.uploadId
    ) {
      context.addIssue({
        code: "custom",
        message: "private_evidence_object_identity_mismatch",
        path: ["objectKey"],
      });
    }
  });

export const ValidateAndFinalizePrivateEvidenceInputSchema = z
  .object({
    intent: PrivateEvidenceUploadIntentSchema,
    commandIdempotencyKey: IdempotencyKeySchema,
    correlationId: CorrelationIdSchema,
  })
  .strict()
  .superRefine((value, context) => {
    if (value.commandIdempotencyKey === value.intent.intentIdempotencyKey) {
      context.addIssue({
        code: "custom",
        message: "private_evidence_command_key_must_be_distinct",
        path: ["commandIdempotencyKey"],
      });
    }
    if (value.correlationId !== value.intent.correlationId) {
      context.addIssue({
        code: "custom",
        message: "private_evidence_correlation_mismatch",
        path: ["correlationId"],
      });
    }
  });

export const PrivateEvidenceDownloadRequestSchema = z
  .object({ evidenceId: CanonicalUuidSchema })
  .strict();

export const PrivateEvidenceCleanupBatchInputSchema = z
  .object({
    workerId: z.string().regex(/^[a-z0-9_.:-]{1,80}$/u),
    limit: z.number().int().min(1).max(25).default(10),
  })
  .strict();

export interface PrivateEvidenceObjectIdentity {
  readonly organizationId: string;
  readonly ownerId: string;
  readonly attemptId: string;
  readonly uploadId: string;
}

export function parsePrivateEvidenceObjectKey(
  objectKey: unknown,
): PrivateEvidenceObjectIdentity | null {
  const parsed = ObjectKeySchema.safeParse(objectKey);
  if (!parsed.success) return null;
  const [organizationId, ownerId, attemptId, uploadId] = parsed.data.split("/");
  if (!organizationId || !ownerId || !attemptId || !uploadId) return null;
  return { organizationId, ownerId, attemptId, uploadId };
}

const PrivateEvidenceUploadIntentRpcBaseShape = {
  upload_id: CanonicalUuidSchema,
  bucket_id: z.literal(PRIVATE_EVIDENCE_BUCKET),
  object_key: ObjectKeySchema,
  expires_at: TimestampSchema,
  replayed: z.boolean(),
  correlation_id: CorrelationIdSchema,
} as const;

export const PrivateEvidenceUploadIntentRpcRowSchema = z.discriminatedUnion(
  "upload_state",
  [
    z
      .object({
        ...PrivateEvidenceUploadIntentRpcBaseShape,
        upload_state: z.literal("pending"),
        rejection_code: z.null(),
      })
      .strict(),
    z
      .object({
        ...PrivateEvidenceUploadIntentRpcBaseShape,
        upload_state: z.literal("ready"),
        rejection_code: z.null(),
      })
      .strict(),
    z
      .object({
        ...PrivateEvidenceUploadIntentRpcBaseShape,
        upload_state: z.literal("rejected"),
        rejection_code: PrivateEvidenceRejectionCodeSchema,
      })
      .strict(),
    z
      .object({
        ...PrivateEvidenceUploadIntentRpcBaseShape,
        upload_state: z.literal("removed"),
        rejection_code: z.null(),
      })
      .strict(),
    z
      .object({
        ...PrivateEvidenceUploadIntentRpcBaseShape,
        upload_state: z.literal("expired"),
        rejection_code: z.literal("intent_expired"),
      })
      .strict(),
  ],
);

export const FinalizedPrivateEvidenceRpcRowSchema = z
  .object({
    upload_id: CanonicalUuidSchema,
    evidence_id: CanonicalUuidSchema,
    media_asset_id: CanonicalUuidSchema,
    title: z.string().min(1).max(255),
    original_file_name: z.string().min(1).max(255),
    mime_type: EvidenceUploadMimeTypeSchema,
    byte_size: z.number().int().positive(),
    sha256_hex: Sha256Schema,
    captured_at: TimestampSchema,
    replayed: z.boolean(),
    correlation_id: CorrelationIdSchema,
  })
  .strict();

export const RejectedPrivateEvidenceRpcRowSchema = z
  .object({
    upload_id: CanonicalUuidSchema,
    upload_state: z.literal("rejected"),
    bucket_id: z.literal(PRIVATE_EVIDENCE_BUCKET),
    object_key: ObjectKeySchema,
    replayed: z.boolean(),
    correlation_id: CorrelationIdSchema,
  })
  .strict();

export const PrivateEvidenceDownloadTargetRpcRowSchema = z
  .object({
    evidence_id: CanonicalUuidSchema,
    bucket_id: z.literal(PRIVATE_EVIDENCE_BUCKET),
    object_key: ObjectKeySchema,
    original_file_name: z.string().min(1).max(255),
    mime_type: EvidenceUploadMimeTypeSchema,
    byte_size: z.number().int().positive(),
    sha256_hex: Sha256Schema,
  })
  .strict();

export const PrivateEvidenceCleanupClaimRpcRowSchema = z
  .object({
    upload_id: CanonicalUuidSchema,
    bucket_id: z.literal(PRIVATE_EVIDENCE_BUCKET),
    object_key: ObjectKeySchema,
    cleanup_attempt: z.number().int().positive(),
  })
  .strict();

export const PrivateEvidenceCleanupCompletionRpcRowSchema = z
  .object({
    upload_id: CanonicalUuidSchema,
    storage_deleted_at: TimestampSchema.nullable(),
    retry_at: TimestampSchema.nullable(),
    cleanup_attempt: z.number().int().positive(),
  })
  .strict();

export type CreatePrivateEvidenceUploadIntentInput = z.infer<
  typeof CreatePrivateEvidenceUploadIntentInputSchema
>;
export type PrivateEvidenceUploadIntent = z.infer<
  typeof PrivateEvidenceUploadIntentSchema
>;
export type ValidateAndFinalizePrivateEvidenceInput = z.infer<
  typeof ValidateAndFinalizePrivateEvidenceInputSchema
>;
export type EvidenceUploadMimeType = z.infer<typeof EvidenceUploadMimeTypeSchema>;
export type PrivateEvidenceRejectionCode = z.infer<
  typeof PrivateEvidenceRejectionCodeSchema
>;
