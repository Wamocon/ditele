import "server-only";

import { randomUUID } from "node:crypto";

import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

import {
  CreatePrivateEvidenceUploadIntentInputSchema,
  FinalizedPrivateEvidenceRpcRowSchema,
  PRIVATE_EVIDENCE_SIGNED_URL_TTL_SECONDS,
  PrivateEvidenceCleanupBatchInputSchema,
  PrivateEvidenceCleanupClaimRpcRowSchema,
  PrivateEvidenceCleanupCompletionRpcRowSchema,
  PrivateEvidenceDownloadRequestSchema,
  PrivateEvidenceDownloadTargetRpcRowSchema,
  PrivateEvidenceUploadIntentRpcRowSchema,
  PrivateEvidenceUploadIntentSchema,
  RejectedPrivateEvidenceRpcRowSchema,
  ValidateAndFinalizePrivateEvidenceInputSchema,
  parsePrivateEvidenceObjectKey,
  type PrivateEvidenceRejectionCode,
  type PrivateEvidenceUploadIntent,
} from "../model/private-evidence-upload";
import {
  validatePrivateEvidenceUpload,
  type PrivateUploadValidationFailureCode,
  type PrivateUploadValidationResult,
} from "../model/private-upload-validation";
import {
  getSupabaseServerEnvironment,
  getSupabaseServiceRoleEnvironment,
} from "@/shared/database/environment";
import { createServerClient } from "@/shared/database/server";

const OBJECT_FETCH_TIMEOUT_MS = 12_000;
const MAX_RPC_ROWS = 25;

const RPC = {
  createIntent: "create_task_evidence_upload_intent",
  finalize: "finalize_task_evidence_upload_service",
  reject: "reject_task_evidence_upload_service",
  downloadTarget: "get_task_evidence_download_target",
  claimCleanup: "claim_task_evidence_upload_cleanup",
  completeCleanup: "complete_task_evidence_upload_cleanup",
} as const;

type RpcResponse = PromiseLike<{ data: unknown; error: unknown }>;
type RpcCaller = (
  name: string,
  args: Readonly<Record<string, unknown>>,
) => RpcResponse;

interface ActorEvidenceGateway {
  getUser(): PromiseLike<{ data: unknown; error: unknown }>;
  getSession(): PromiseLike<{ data: unknown; error: unknown }>;
  rpc: RpcCaller;
  createSignedUrl(
    bucketId: string,
    objectKey: string,
    expiresIn: number,
    downloadName: string,
  ): PromiseLike<{ data: unknown; error: unknown }>;
}

interface PrivilegedEvidenceGateway {
  rpc: RpcCaller;
  removeObject(
    bucketId: string,
    objectKey: string,
  ): PromiseLike<{ data: unknown; error: unknown }>;
}

interface PrivateEvidenceUploadServerDependencies {
  readonly createActorGateway: () => Promise<ActorEvidenceGateway>;
  readonly createPrivilegedGateway: () => PrivilegedEvidenceGateway;
  readonly fetch: typeof fetch;
  readonly getStorageEnvironment: () => {
    readonly url: string;
    readonly publishableKey: string;
  };
  readonly validateUpload: (
    input: unknown,
    maxBytes?: unknown,
  ) => Promise<PrivateUploadValidationResult>;
  readonly now: () => Date;
  readonly randomUuid: () => string;
  readonly objectFetchTimeoutMs: number;
}

export type PrivateEvidenceBoundaryErrorCode =
  | "authentication_required"
  | "invalid_input"
  | "not_found"
  | "temporarily_unavailable";

export class PrivateEvidenceBoundaryError extends Error {
  constructor(readonly code: PrivateEvidenceBoundaryErrorCode) {
    super(code);
    this.name = "PrivateEvidenceBoundaryError";
  }
}

export type PrivateEvidenceProcessingResult =
  | {
      readonly status: "ready";
      readonly evidence: {
        readonly id: string;
        readonly title: string;
        readonly originalFileName: string;
        readonly mimeType: string;
        readonly byteSize: number;
        readonly capturedAt: string;
      };
      readonly replayed: boolean;
    }
  | {
      readonly status: "rejected";
      readonly reason: PrivateEvidenceRejectionCode;
      readonly replayed: boolean;
    }
  | {
      readonly status: "unavailable";
      readonly reason: "expired" | "removed";
    };

export type PrivateEvidenceDownloadResolution =
  | { readonly status: "ready"; readonly signedUrl: string }
  | { readonly status: "authentication_required" }
  | { readonly status: "not_found" }
  | { readonly status: "temporarily_unavailable" };

export interface PrivateEvidenceCleanupSummary {
  readonly claimed: number;
  readonly deleted: number;
  readonly deferred: number;
  readonly completionFailed: number;
}

const UserResultSchema = z.object({
  user: z.object({ id: z.string().uuid() }).nullable(),
});
const SessionResultSchema = z.object({
  session: z
    .object({
      access_token: z.string().min(1).max(16_384),
      user: z.object({ id: z.string().uuid() }),
    })
    .nullable(),
});
const SignedUrlResultSchema = z.object({ signedUrl: z.string().url() }).strict();

async function defaultActorGateway(): Promise<ActorEvidenceGateway> {
  const client = await createServerClient();
  const rpc = client.rpc.bind(client) as unknown as RpcCaller;
  return {
    getUser: () => client.auth.getUser(),
    getSession: () => client.auth.getSession(),
    rpc,
    createSignedUrl: (bucketId, objectKey, expiresIn, downloadName) =>
      client.storage.from(bucketId).createSignedUrl(objectKey, expiresIn, {
        download: downloadName,
      }),
  };
}

function defaultPrivilegedGateway(): PrivilegedEvidenceGateway {
  const environment = getSupabaseServiceRoleEnvironment();
  const client = createClient(environment.url, environment.serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });
  const rpc = client.rpc.bind(client) as unknown as RpcCaller;
  return {
    rpc,
    removeObject: (bucketId, objectKey) =>
      client.storage.from(bucketId).remove([objectKey]),
  };
}

const defaultDependencies: PrivateEvidenceUploadServerDependencies = {
  createActorGateway: defaultActorGateway,
  createPrivilegedGateway: defaultPrivilegedGateway,
  fetch: globalThis.fetch,
  getStorageEnvironment: getSupabaseServerEnvironment,
  validateUpload: (input, maxBytes) =>
    validatePrivateEvidenceUpload(input as never, maxBytes as never),
  now: () => new Date(),
  randomUuid: randomUUID,
  objectFetchTimeoutMs: OBJECT_FETCH_TIMEOUT_MS,
};

function safeInput<T>(schema: z.ZodType<T>, input: unknown): T {
  const parsed = schema.safeParse(input);
  if (!parsed.success) throw new PrivateEvidenceBoundaryError("invalid_input");
  return parsed.data;
}

function singletonRpcRow<T>(
  schema: z.ZodType<T>,
  data: unknown,
  code: PrivateEvidenceBoundaryErrorCode = "temporarily_unavailable",
): T {
  if (!Array.isArray(data) || data.length !== 1) {
    throw new PrivateEvidenceBoundaryError(code);
  }
  const parsed = schema.safeParse(data[0]);
  if (!parsed.success) throw new PrivateEvidenceBoundaryError(code);
  return parsed.data;
}

async function providerPromise<T>(
  operation: () => PromiseLike<T>,
): Promise<T> {
  try {
    return await operation();
  } catch {
    throw new PrivateEvidenceBoundaryError("temporarily_unavailable");
  }
}

function providerValue<T>(operation: () => T): T {
  try {
    return operation();
  } catch {
    throw new PrivateEvidenceBoundaryError("temporarily_unavailable");
  }
}

async function actorGatewayFor(
  dependencies: PrivateEvidenceUploadServerDependencies,
): Promise<ActorEvidenceGateway> {
  return providerPromise(() => dependencies.createActorGateway());
}

function privilegedGatewayFor(
  dependencies: PrivateEvidenceUploadServerDependencies,
): PrivilegedEvidenceGateway {
  return providerValue(() => dependencies.createPrivilegedGateway());
}

function storageEnvironmentFor(
  dependencies: PrivateEvidenceUploadServerDependencies,
): { readonly url: string; readonly publishableKey: string } {
  return providerValue(() => dependencies.getStorageEnvironment());
}

async function authenticateActor(
  gateway: ActorEvidenceGateway,
): Promise<{ actorId: string }> {
  const result = await providerPromise(() => gateway.getUser());
  const parsed = UserResultSchema.safeParse(result.data);
  if (result.error !== null || !parsed.success || parsed.data.user === null) {
    throw new PrivateEvidenceBoundaryError("authentication_required");
  }
  return { actorId: parsed.data.user.id };
}

async function actorSession(
  gateway: ActorEvidenceGateway,
): Promise<{ actorId: string; accessToken: string }> {
  const actor = await authenticateActor(gateway);
  const result = await providerPromise(() => gateway.getSession());
  const parsed = SessionResultSchema.safeParse(result.data);
  if (
    result.error !== null ||
    !parsed.success ||
    parsed.data.session === null ||
    parsed.data.session.user.id !== actor.actorId
  ) {
    throw new PrivateEvidenceBoundaryError("authentication_required");
  }
  return {
    actorId: actor.actorId,
    accessToken: parsed.data.session.access_token,
  };
}

function exactStorageObjectUrl(
  configuredUrl: string,
  bucketId: string,
  objectKey: string,
): URL {
  let origin: string;
  try {
    origin = new URL(configuredUrl).origin;
  } catch {
    throw new PrivateEvidenceBoundaryError("temporarily_unavailable");
  }
  const path = [bucketId, ...objectKey.split("/")]
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  return new URL(`/storage/v1/object/${path}`, `${origin}/`);
}

class AuthoritativeUploadFailure extends Error {
  constructor(readonly rejectionCode: PrivateEvidenceRejectionCode) {
    super(rejectionCode);
    this.name = "AuthoritativeUploadFailure";
  }
}

async function readBoundedBytes(
  response: Response,
  expectedByteSize: number,
): Promise<Uint8Array> {
  const lengthHeader = response.headers.get("content-length");
  if (lengthHeader !== null) {
    const length = Number(lengthHeader);
    if (!Number.isSafeInteger(length) || length < 0) {
      throw new PrivateEvidenceBoundaryError("temporarily_unavailable");
    }
    if (length !== expectedByteSize) {
      throw new AuthoritativeUploadFailure("size_mismatch");
    }
  }
  if (response.body === null) {
    throw new PrivateEvidenceBoundaryError("temporarily_unavailable");
  }

  const chunks: Uint8Array[] = [];
  const reader = response.body.getReader();
  let total = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      total += chunk.value.byteLength;
      if (total > expectedByteSize) {
        await reader.cancel().catch(() => undefined);
        throw new AuthoritativeUploadFailure("size_mismatch");
      }
      chunks.push(chunk.value);
    }
  } catch (error) {
    if (error instanceof AuthoritativeUploadFailure) throw error;
    throw new PrivateEvidenceBoundaryError("temporarily_unavailable");
  }
  if (total !== expectedByteSize) {
    throw new AuthoritativeUploadFailure("size_mismatch");
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

async function fetchPendingObject(
  dependencies: PrivateEvidenceUploadServerDependencies,
  input: {
    readonly accessToken: string;
    readonly intent: PrivateEvidenceUploadIntent;
    readonly mimeType: string;
    readonly byteSize: number;
  },
): Promise<Uint8Array> {
  const environment = storageEnvironmentFor(dependencies);
  const target = exactStorageObjectUrl(
    environment.url,
    input.intent.bucketId,
    input.intent.objectKey,
  );
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    dependencies.objectFetchTimeoutMs,
  );
  try {
    const response = await dependencies.fetch(target, {
      method: "GET",
      cache: "no-store",
      redirect: "error",
      signal: controller.signal,
      headers: {
        accept: input.mimeType,
        apikey: environment.publishableKey,
        authorization: `Bearer ${input.accessToken}`,
        "cache-control": "no-store",
      },
    });

    if (response.status === 404) {
      throw new AuthoritativeUploadFailure("object_unavailable");
    }
    if (!response.ok) {
      throw new PrivateEvidenceBoundaryError("temporarily_unavailable");
    }
    const responseMime = response.headers
      .get("content-type")
      ?.split(";", 1)[0]
      ?.trim();
    if (responseMime && responseMime !== input.mimeType) {
      throw new AuthoritativeUploadFailure("mime_mismatch");
    }
    return await readBoundedBytes(response, input.byteSize);
  } catch (error) {
    if (
      error instanceof AuthoritativeUploadFailure ||
      error instanceof PrivateEvidenceBoundaryError
    ) {
      throw error;
    }
    throw new PrivateEvidenceBoundaryError("temporarily_unavailable");
  } finally {
    clearTimeout(timeout);
  }
}

function validationRejection(
  code: PrivateUploadValidationFailureCode,
): PrivateEvidenceRejectionCode | null {
  switch (code) {
    case "hash_unavailable":
      return null;
    case "byte_size_mismatch":
    case "file_too_large":
      return "size_mismatch";
    case "invalid_sha256":
    case "sha256_mismatch":
      return "hash_mismatch";
    case "extension_mismatch":
      return "mime_mismatch";
    case "invalid_content":
      return "malformed_content";
    case "unsafe_name":
    case "unsupported_type":
      return "unsupported_content";
  }
}

function exactIntentForActor(
  intent: PrivateEvidenceUploadIntent,
  actorId: string,
): void {
  const identity = parsePrivateEvidenceObjectKey(intent.objectKey);
  if (
    identity === null ||
    identity.ownerId !== actorId ||
    identity.attemptId !== intent.attemptId ||
    identity.uploadId !== intent.uploadId
  ) {
    throw new PrivateEvidenceBoundaryError("not_found");
  }
}

async function replayActorIntent(
  dependencies: PrivateEvidenceUploadServerDependencies,
  gateway: ActorEvidenceGateway,
  intent: PrivateEvidenceUploadIntent,
): Promise<z.infer<typeof PrivateEvidenceUploadIntentRpcRowSchema>> {
  const result = await providerPromise(() =>
    gateway.rpc(RPC.createIntent, {
      p_attempt_id: intent.attemptId,
      p_title: intent.title,
      p_original_file_name: intent.originalFileName,
      p_declared_mime_type: intent.mimeType,
      p_declared_byte_size: intent.byteSize,
      p_client_sha256: intent.sha256Hex,
      p_idempotency_key: intent.intentIdempotencyKey,
      p_correlation_id: intent.correlationId,
    }),
  );
  if (result.error !== null) {
    throw new PrivateEvidenceBoundaryError("temporarily_unavailable");
  }
  const row = singletonRpcRow(PrivateEvidenceUploadIntentRpcRowSchema, result.data);
  if (
    row.upload_id !== intent.uploadId ||
    row.bucket_id !== intent.bucketId ||
    row.object_key !== intent.objectKey ||
    row.expires_at !== intent.expiresAt ||
    row.correlation_id !== intent.correlationId ||
    !row.replayed ||
    (
      row.upload_state === "pending" &&
      Date.parse(row.expires_at) <=
        providerValue(() => dependencies.now().getTime())
    )
  ) {
    throw new PrivateEvidenceBoundaryError("temporarily_unavailable");
  }
  return row;
}

async function privilegedReject(
  gateway: PrivilegedEvidenceGateway,
  input: {
    readonly intent: PrivateEvidenceUploadIntent;
    readonly actorId: string;
    readonly rejectionCode: PrivateEvidenceRejectionCode;
    readonly idempotencyKey: string;
    readonly correlationId: string;
  },
): Promise<{ replayed: boolean }> {
  const result = await providerPromise(() =>
    gateway.rpc(RPC.reject, {
      p_upload_id: input.intent.uploadId,
      p_actor_id: input.actorId,
      p_rejection_code: input.rejectionCode,
      p_idempotency_key: input.idempotencyKey,
      p_correlation_id: input.correlationId,
    }),
  );
  if (result.error !== null) {
    throw new PrivateEvidenceBoundaryError("temporarily_unavailable");
  }
  const row = singletonRpcRow(RejectedPrivateEvidenceRpcRowSchema, result.data);
  if (
    row.upload_id !== input.intent.uploadId ||
    row.bucket_id !== input.intent.bucketId ||
    row.object_key !== input.intent.objectKey ||
    row.correlation_id !== input.correlationId
  ) {
    throw new PrivateEvidenceBoundaryError("temporarily_unavailable");
  }
  return { replayed: row.replayed };
}

async function recoverRejectedReceipt(
  gateway: PrivilegedEvidenceGateway,
  input: {
    readonly intent: PrivateEvidenceUploadIntent;
    readonly actorId: string;
    readonly rejectionCode: PrivateEvidenceRejectionCode;
    readonly idempotencyKey: string;
    readonly correlationId: string;
  },
): Promise<PrivateEvidenceProcessingResult> {
  const rejection = await privilegedReject(gateway, {
    intent: input.intent,
    actorId: input.actorId,
    rejectionCode: input.rejectionCode,
    idempotencyKey: input.idempotencyKey,
    correlationId: input.correlationId,
  });
  if (!rejection.replayed) {
    throw new PrivateEvidenceBoundaryError("temporarily_unavailable");
  }
  return {
    status: "rejected",
    reason: input.rejectionCode,
    replayed: true,
  };
}

async function createIntent(
  dependencies: PrivateEvidenceUploadServerDependencies,
  unknownInput: unknown,
): Promise<PrivateEvidenceUploadIntent> {
  const input = safeInput(
    CreatePrivateEvidenceUploadIntentInputSchema,
    unknownInput,
  );
  const gateway = await actorGatewayFor(dependencies);
  const actor = await authenticateActor(gateway);
  const result = await providerPromise(() =>
    gateway.rpc(RPC.createIntent, {
      p_attempt_id: input.attemptId,
      p_title: input.title,
      p_original_file_name: input.originalFileName,
      p_declared_mime_type: input.mimeType,
      p_declared_byte_size: input.byteSize,
      p_client_sha256: input.sha256Hex,
      p_idempotency_key: input.idempotencyKey,
      p_correlation_id: input.correlationId,
    }),
  );
  if (result.error !== null) {
    throw new PrivateEvidenceBoundaryError("temporarily_unavailable");
  }
  const row = singletonRpcRow(PrivateEvidenceUploadIntentRpcRowSchema, result.data);
  if (row.upload_state !== "pending") {
    throw new PrivateEvidenceBoundaryError("temporarily_unavailable");
  }
  const intent = safeInput(PrivateEvidenceUploadIntentSchema, {
    uploadId: row.upload_id,
    attemptId: input.attemptId,
    title: input.title,
    originalFileName: input.originalFileName,
    mimeType: input.mimeType,
    byteSize: input.byteSize,
    sha256Hex: input.sha256Hex,
    intentIdempotencyKey: input.idempotencyKey,
    bucketId: row.bucket_id,
    objectKey: row.object_key,
    state: "pending",
    expiresAt: row.expires_at,
    replayed: row.replayed,
    correlationId: row.correlation_id,
  });
  exactIntentForActor(intent, actor.actorId);
  if (
    intent.correlationId !== input.correlationId ||
    Date.parse(intent.expiresAt) <=
      providerValue(() => dependencies.now().getTime())
  ) {
    throw new PrivateEvidenceBoundaryError("temporarily_unavailable");
  }
  return intent;
}

async function finalizeVerifiedEvidence(
  gateway: PrivilegedEvidenceGateway,
  input: {
    readonly intent: PrivateEvidenceUploadIntent;
    readonly actorId: string;
    readonly mimeType: string;
    readonly byteSize: number;
    readonly sha256Hex: string;
    readonly commandIdempotencyKey: string;
    readonly correlationId: string;
  },
): Promise<PrivateEvidenceProcessingResult> {
  const result = await providerPromise(() =>
    gateway.rpc(RPC.finalize, {
      p_upload_id: input.intent.uploadId,
      p_actor_id: input.actorId,
      p_verified_mime_type: input.mimeType,
      p_verified_byte_size: input.byteSize,
      p_verified_sha256: input.sha256Hex,
      p_idempotency_key: input.commandIdempotencyKey,
      p_correlation_id: input.correlationId,
    }),
  );
  if (result.error !== null) {
    throw new PrivateEvidenceBoundaryError("temporarily_unavailable");
  }
  const row = singletonRpcRow(FinalizedPrivateEvidenceRpcRowSchema, result.data);
  if (
    row.upload_id !== input.intent.uploadId ||
    row.title !== input.intent.title ||
    row.original_file_name !== input.intent.originalFileName ||
    row.mime_type !== input.mimeType ||
    row.byte_size !== input.byteSize ||
    row.sha256_hex !== input.sha256Hex ||
    row.correlation_id !== input.correlationId
  ) {
    throw new PrivateEvidenceBoundaryError("temporarily_unavailable");
  }
  return {
    status: "ready",
    evidence: {
      id: row.evidence_id,
      title: row.title,
      originalFileName: row.original_file_name,
      mimeType: row.mime_type,
      byteSize: row.byte_size,
      capturedAt: row.captured_at,
    },
    replayed: row.replayed,
  };
}

async function validateAndFinalize(
  dependencies: PrivateEvidenceUploadServerDependencies,
  unknownInput: unknown,
): Promise<PrivateEvidenceProcessingResult> {
  const input = safeInput(ValidateAndFinalizePrivateEvidenceInputSchema, unknownInput);
  const actorGateway = await actorGatewayFor(dependencies);
  const session = await actorSession(actorGateway);
  exactIntentForActor(input.intent, session.actorId);
  const replay = await replayActorIntent(
    dependencies,
    actorGateway,
    input.intent,
  );
  if (replay.upload_state === "expired" || replay.upload_state === "removed") {
    return { status: "unavailable", reason: replay.upload_state };
  }

  const privileged = privilegedGatewayFor(dependencies);

  if (replay.upload_state === "ready") {
    return finalizeVerifiedEvidence(privileged, {
      intent: input.intent,
      actorId: session.actorId,
      mimeType: input.intent.mimeType,
      byteSize: input.intent.byteSize,
      sha256Hex: input.intent.sha256Hex,
      commandIdempotencyKey: input.commandIdempotencyKey,
      correlationId: input.correlationId,
    });
  }
  if (replay.upload_state === "rejected") {
    return recoverRejectedReceipt(privileged, {
      intent: input.intent,
      actorId: session.actorId,
      rejectionCode: replay.rejection_code,
      idempotencyKey: input.commandIdempotencyKey,
      correlationId: input.correlationId,
    });
  }

  let bytes: Uint8Array;
  try {
    bytes = await fetchPendingObject(dependencies, {
      accessToken: session.accessToken,
      intent: input.intent,
      mimeType: input.intent.mimeType,
      byteSize: input.intent.byteSize,
    });
  } catch (error) {
    if (!(error instanceof AuthoritativeUploadFailure)) throw error;
    const rejection = await privilegedReject(privileged, {
      intent: input.intent,
      actorId: session.actorId,
      rejectionCode: error.rejectionCode,
      idempotencyKey: input.commandIdempotencyKey,
      correlationId: input.correlationId,
    });
    return {
      status: "rejected",
      reason: error.rejectionCode,
      replayed: rejection.replayed,
    };
  }

  const validation = await providerPromise(() =>
    dependencies.validateUpload({
      fileName: input.intent.originalFileName,
      mimeType: input.intent.mimeType,
      byteSize: input.intent.byteSize,
      expectedSha256Hex: input.intent.sha256Hex,
      bytes,
    }),
  );
  if (!validation.accepted) {
    const rejectionCode = validationRejection(validation.code);
    if (rejectionCode === null) {
      throw new PrivateEvidenceBoundaryError("temporarily_unavailable");
    }
    const rejection = await privilegedReject(privileged, {
      intent: input.intent,
      actorId: session.actorId,
      rejectionCode,
      idempotencyKey: input.commandIdempotencyKey,
      correlationId: input.correlationId,
    });
    return {
      status: "rejected",
      reason: rejectionCode,
      replayed: rejection.replayed,
    };
  }
  if (validation.upload.fileName !== input.intent.originalFileName) {
    throw new PrivateEvidenceBoundaryError("temporarily_unavailable");
  }

  return finalizeVerifiedEvidence(privileged, {
    intent: input.intent,
    actorId: session.actorId,
    mimeType: validation.upload.mimeType,
    byteSize: validation.upload.byteSize,
    sha256Hex: validation.upload.sha256Hex,
    commandIdempotencyKey: input.commandIdempotencyKey,
    correlationId: input.correlationId,
  });
}

function decodedPathSegments(pathname: string): string[] | null {
  const encoded = pathname.split("/");
  if (encoded[0] !== "" || encoded.slice(1).some((segment) => segment.length === 0)) {
    return null;
  }
  try {
    const decoded = encoded.slice(1).map((segment) => decodeURIComponent(segment));
    return decoded.some((segment) => segment.includes("/") || segment.includes("\\"))
      ? null
      : decoded;
  } catch {
    return null;
  }
}

export function isExactPrivateEvidenceSignedUrl(
  candidate: unknown,
  input: {
    readonly configuredUrl: string;
    readonly bucketId: string;
    readonly objectKey: string;
    readonly downloadName: string;
  },
): candidate is string {
  if (typeof candidate !== "string") return false;
  let signed: URL;
  let configured: URL;
  try {
    signed = new URL(candidate);
    configured = new URL(input.configuredUrl);
  } catch {
    return false;
  }
  if (
    signed.origin !== configured.origin ||
    signed.username.length > 0 ||
    signed.password.length > 0 ||
    signed.hash.length > 0
  ) {
    return false;
  }
  const expected = [
    "storage",
    "v1",
    "object",
    "sign",
    input.bucketId,
    ...input.objectKey.split("/"),
  ];
  const actual = decodedPathSegments(signed.pathname);
  if (actual === null || actual.length !== expected.length) return false;
  if (actual.some((segment, index) => segment !== expected[index])) return false;
  if (signed.searchParams.getAll("token").length !== 1) return false;
  if (!(signed.searchParams.get("token")?.length)) return false;
  if (signed.searchParams.getAll("download").length !== 1) return false;
  if (signed.searchParams.get("download") !== input.downloadName) return false;
  return [...signed.searchParams.keys()].every(
    (key) => key === "token" || key === "download",
  );
}

async function resolveDownload(
  dependencies: PrivateEvidenceUploadServerDependencies,
  unknownInput: unknown,
): Promise<PrivateEvidenceDownloadResolution> {
  let gateway: ActorEvidenceGateway;
  try {
    gateway = await actorGatewayFor(dependencies);
    await authenticateActor(gateway);
  } catch (error) {
    return error instanceof PrivateEvidenceBoundaryError &&
      error.code === "authentication_required"
      ? { status: "authentication_required" }
      : { status: "temporarily_unavailable" };
  }

  const parsedInput = PrivateEvidenceDownloadRequestSchema.safeParse(unknownInput);
  if (!parsedInput.success) return { status: "not_found" };
  let result: { data: unknown; error: unknown };
  try {
    result = await providerPromise(() =>
      gateway.rpc(RPC.downloadTarget, {
        p_evidence_id: parsedInput.data.evidenceId,
      }),
    );
  } catch {
    return { status: "temporarily_unavailable" };
  }
  if (result.error !== null) return { status: "temporarily_unavailable" };
  if (Array.isArray(result.data) && result.data.length === 0) {
    return { status: "not_found" };
  }
  let row: z.infer<typeof PrivateEvidenceDownloadTargetRpcRowSchema>;
  try {
    row = singletonRpcRow(
      PrivateEvidenceDownloadTargetRpcRowSchema,
      result.data,
      "not_found",
    );
  } catch (error) {
    return error instanceof PrivateEvidenceBoundaryError && error.code === "not_found"
      ? { status: "not_found" }
      : { status: "temporarily_unavailable" };
  }
  if (row.evidence_id !== parsedInput.data.evidenceId) {
    return { status: "not_found" };
  }

  let signedResult: { data: unknown; error: unknown };
  try {
    signedResult = await providerPromise(() =>
      gateway.createSignedUrl(
        row.bucket_id,
        row.object_key,
        PRIVATE_EVIDENCE_SIGNED_URL_TTL_SECONDS,
        row.original_file_name,
      ),
    );
  } catch {
    return { status: "temporarily_unavailable" };
  }
  if (signedResult.error !== null) return { status: "temporarily_unavailable" };
  const signed = SignedUrlResultSchema.safeParse(signedResult.data);
  let environment: { readonly url: string; readonly publishableKey: string };
  try {
    environment = storageEnvironmentFor(dependencies);
  } catch {
    return { status: "temporarily_unavailable" };
  }
  if (
    !signed.success ||
    !isExactPrivateEvidenceSignedUrl(signed.data.signedUrl, {
      configuredUrl: environment.url,
      bucketId: row.bucket_id,
      objectKey: row.object_key,
      downloadName: row.original_file_name,
    })
  ) {
    return { status: "temporarily_unavailable" };
  }
  return { status: "ready", signedUrl: signed.data.signedUrl };
}

function storageObjectWasAbsent(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const record = error as Record<string, unknown>;
  return (
    record.status === 404 ||
    record.statusCode === 404 ||
    record.statusCode === "404" ||
    record.code === "404" ||
    record.code === "not_found" ||
    record.code === "NoSuchKey"
  );
}

function cleanupRetryAt(now: Date, cleanupAttempt: number): string {
  const exponent = Math.min(Math.max(cleanupAttempt - 1, 0), 10);
  const delayMs = Math.min(60_000 * 2 ** exponent, 24 * 60 * 60 * 1_000);
  return new Date(now.getTime() + delayMs).toISOString();
}

async function completeCleanup(
  gateway: PrivilegedEvidenceGateway,
  input: {
    readonly uploadId: string;
    readonly workerId: string;
    readonly claimToken: string;
    readonly deleted: boolean;
    readonly errorCode: string | null;
    readonly retryAt: string | null;
  },
): Promise<boolean> {
  let result: { data: unknown; error: unknown };
  try {
    result = await providerPromise(() =>
      gateway.rpc(RPC.completeCleanup, {
        p_upload_id: input.uploadId,
        p_worker_id: input.workerId,
        p_claim_token: input.claimToken,
        p_deleted: input.deleted,
        p_error_code: input.errorCode,
        p_retry_at: input.retryAt,
      }),
    );
  } catch {
    return false;
  }
  if (result.error !== null) return false;
  try {
    const row = singletonRpcRow(
      PrivateEvidenceCleanupCompletionRpcRowSchema,
      result.data,
    );
    return row.upload_id === input.uploadId;
  } catch {
    return false;
  }
}

async function cleanupBatch(
  dependencies: PrivateEvidenceUploadServerDependencies,
  unknownInput: unknown,
): Promise<PrivateEvidenceCleanupSummary> {
  const input = safeInput(PrivateEvidenceCleanupBatchInputSchema, unknownInput);
  const gateway = privilegedGatewayFor(dependencies);
  const claimToken = providerValue(() => dependencies.randomUuid());
  if (!z.string().uuid().safeParse(claimToken).success) {
    throw new PrivateEvidenceBoundaryError("temporarily_unavailable");
  }
  const claimResult = await providerPromise(() =>
    gateway.rpc(RPC.claimCleanup, {
      p_limit: input.limit,
      p_worker_id: input.workerId,
      p_claim_token: claimToken,
    }),
  );
  if (claimResult.error !== null || !Array.isArray(claimResult.data)) {
    throw new PrivateEvidenceBoundaryError("temporarily_unavailable");
  }
  if (
    claimResult.data.length > input.limit ||
    claimResult.data.length > MAX_RPC_ROWS
  ) {
    throw new PrivateEvidenceBoundaryError("temporarily_unavailable");
  }
  const claims = claimResult.data.map((row) => {
    const parsed = PrivateEvidenceCleanupClaimRpcRowSchema.safeParse(row);
    if (!parsed.success) {
      throw new PrivateEvidenceBoundaryError("temporarily_unavailable");
    }
    const identity = parsePrivateEvidenceObjectKey(parsed.data.object_key);
    if (identity === null || identity.uploadId !== parsed.data.upload_id) {
      throw new PrivateEvidenceBoundaryError("temporarily_unavailable");
    }
    return parsed.data;
  });

  let deleted = 0;
  let deferred = 0;
  let completionFailed = 0;
  for (const claim of claims) {
    let removal: { data: unknown; error: unknown };
    try {
      removal = await gateway.removeObject(claim.bucket_id, claim.object_key);
    } catch {
      removal = { data: null, error: { code: "storage_unavailable" } };
    }
    const objectDeleted =
      removal.error === null || storageObjectWasAbsent(removal.error);
    let retryAt: string | null = null;
    if (!objectDeleted) {
      try {
        retryAt = cleanupRetryAt(
          providerValue(() => dependencies.now()),
          claim.cleanup_attempt,
        );
      } catch {
        completionFailed += 1;
        continue;
      }
    }
    const completed = await completeCleanup(gateway, {
      uploadId: claim.upload_id,
      workerId: input.workerId,
      claimToken,
      deleted: objectDeleted,
      errorCode: objectDeleted ? null : "storage_remove_failed",
      retryAt,
    });
    if (!completed) {
      completionFailed += 1;
    } else if (objectDeleted) {
      deleted += 1;
    } else {
      deferred += 1;
    }
  }
  return { claimed: claims.length, deleted, deferred, completionFailed };
}

export function createPrivateEvidenceUploadServer(
  overrides: Partial<PrivateEvidenceUploadServerDependencies> = {},
) {
  const dependencies = { ...defaultDependencies, ...overrides };
  return {
    createIntent: (input: unknown) => createIntent(dependencies, input),
    validateAndFinalize: (input: unknown) =>
      validateAndFinalize(dependencies, input),
    resolveDownload: (input: unknown) => resolveDownload(dependencies, input),
    cleanupBatch: (input: unknown) => cleanupBatch(dependencies, input),
  };
}

export async function createPrivateEvidenceUploadIntent(input: unknown) {
  return createPrivateEvidenceUploadServer().createIntent(input);
}

export async function validateAndFinalizePrivateEvidenceUpload(input: unknown) {
  return createPrivateEvidenceUploadServer().validateAndFinalize(input);
}

export async function resolvePrivateEvidenceDownload(input: unknown) {
  return createPrivateEvidenceUploadServer().resolveDownload(input);
}

export async function runPrivateEvidenceCleanupBatch(input: unknown) {
  return createPrivateEvidenceUploadServer().cleanupBatch(input);
}
