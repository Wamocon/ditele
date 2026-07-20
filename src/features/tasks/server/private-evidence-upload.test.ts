import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  PRIVATE_EVIDENCE_BUCKET,
  PRIVATE_EVIDENCE_SIGNED_URL_TTL_SECONDS,
} from "../model/private-evidence-upload";
import {
  PrivateEvidenceBoundaryError,
  createPrivateEvidenceUploadServer,
  isExactPrivateEvidenceSignedUrl,
} from "./private-evidence-upload";

const organizationId = "11111111-1111-4111-8111-111111111111";
const ownerId = "22222222-2222-4222-8222-222222222222";
const attemptId = "33333333-3333-4333-8333-333333333333";
const uploadId = "44444444-4444-4444-8444-444444444444";
const correlationId = "55555555-5555-4555-8555-555555555555";
const evidenceId = "66666666-6666-4666-8666-666666666666";
const mediaAssetId = "77777777-7777-4777-8777-777777777777";
const claimToken = "88888888-8888-4888-8888-888888888888";
const secondUploadId = "99999999-9999-4999-8999-999999999999";
const objectKey = `${organizationId}/${ownerId}/${attemptId}/${uploadId}`;
const secondObjectKey =
  `${organizationId}/${ownerId}/${attemptId}/${secondUploadId}`;
const sha256Hex = "a".repeat(64);
const bytes = new TextEncoder().encode("payload");

type TestRpc = (
  name: string,
  args: Readonly<Record<string, unknown>>,
) => PromiseLike<{ data: unknown; error: unknown }>;
type TestSigner = (
  bucketId: string,
  targetObjectKey: string,
  expiresIn: number,
  downloadName: string,
) => PromiseLike<{ data: unknown; error: unknown }>;
type TestRemover = (
  bucketId: string,
  targetObjectKey: string,
) => PromiseLike<{ data: unknown; error: unknown }>;

type AuthoritativeUploadState =
  | "pending"
  | "ready"
  | "rejected"
  | "removed"
  | "expired";

function replayedIntentRow(state: AuthoritativeUploadState = "pending") {
  return {
    upload_id: uploadId,
    bucket_id: PRIVATE_EVIDENCE_BUCKET,
    object_key: objectKey,
    upload_state: state,
    rejection_code:
      state === "rejected"
        ? "malformed_content"
        : state === "expired"
          ? "intent_expired"
          : null,
    expires_at: "2099-07-20T10:15:00.000Z",
    replayed: true,
    correlation_id: correlationId,
  };
}

function replayingActorRpc(state: AuthoritativeUploadState = "pending") {
  return vi.fn(async (name: string, args: Readonly<Record<string, unknown>>) => {
    if (name !== "create_task_evidence_upload_intent") {
      return { data: null, error: { code: "unexpected_rpc" } };
    }
    const exact =
      args.p_attempt_id === attemptId &&
      args.p_title === "Browser evidence" &&
      args.p_original_file_name === "report.txt" &&
      args.p_declared_mime_type === "text/plain" &&
      args.p_declared_byte_size === bytes.byteLength &&
      args.p_client_sha256 === sha256Hex &&
      args.p_idempotency_key === "intent-command-0001" &&
      args.p_correlation_id === correlationId;
    return exact
      ? { data: [replayedIntentRow(state)], error: null }
      : { data: null, error: { code: "23505" } };
  });
}

function actorGateway(
  rpc: TestRpc = replayingActorRpc(),
  createSignedUrl: TestSigner = vi.fn(async () => ({
    data: null,
    error: { code: "unexpected_sign" },
  })),
) {
  const getUser = vi.fn<() => Promise<{ data: unknown; error: unknown }>>(
    async () => ({ data: { user: { id: ownerId } }, error: null }),
  );
  const getSession = vi.fn<() => Promise<{ data: unknown; error: unknown }>>(
    async () => ({
      data: {
        session: {
          access_token: "actor-access-token",
          user: { id: ownerId },
        },
      },
      error: null,
    }),
  );
  return { getUser, getSession, rpc, createSignedUrl };
}

function privilegedGateway(
  rpc: TestRpc = vi.fn(async () => ({
    data: null,
    error: { code: "unexpected_rpc" },
  })),
  removeObject: TestRemover = vi.fn(async () => ({
    data: null,
    error: { code: "unexpected_remove" },
  })),
) {
  return { rpc, removeObject };
}

function makeServer(overrides: Record<string, unknown> = {}) {
  return createPrivateEvidenceUploadServer({
    createActorGateway: async () => actorGateway(),
    createPrivilegedGateway: () => privilegedGateway(),
    fetch: vi.fn(async () =>
      new Response(bytes, {
        status: 200,
        headers: {
          "content-length": String(bytes.byteLength),
          "content-type": "text/plain",
        },
      }),
    ),
    getStorageEnvironment: () => ({
      url: "https://project.supabase.co",
      publishableKey: "publishable-test-key",
    }),
    validateUpload: vi.fn(async () => ({
      accepted: true,
      code: "accepted",
      upload: {
        fileName: "report.txt",
        mimeType: "text/plain",
        byteSize: bytes.byteLength,
        sha256Hex,
      },
    })),
    now: () => new Date("2026-07-20T10:00:00.000Z"),
    randomUuid: () => claimToken,
    objectFetchTimeoutMs: 50,
    ...overrides,
  } as never);
}

function intent() {
  return {
    uploadId,
    attemptId,
    title: "Browser evidence",
    originalFileName: "report.txt",
    mimeType: "text/plain",
    byteSize: bytes.byteLength,
    sha256Hex,
    intentIdempotencyKey: "intent-command-0001",
    bucketId: PRIVATE_EVIDENCE_BUCKET,
    objectKey,
    state: "pending",
    expiresAt: "2099-07-20T10:15:00.000Z",
    replayed: false,
    correlationId,
  };
}

function processingInput() {
  return {
    intent: intent(),
    commandIdempotencyKey: "finalize-command-0001",
    correlationId,
  };
}

function finalizedRow() {
  return {
    upload_id: uploadId,
    evidence_id: evidenceId,
    media_asset_id: mediaAssetId,
    title: "Browser evidence",
    original_file_name: "report.txt",
    mime_type: "text/plain",
    byte_size: bytes.byteLength,
    sha256_hex: sha256Hex,
    captured_at: "2026-07-20T10:01:00.000Z",
    replayed: false,
    correlation_id: correlationId,
  };
}

function rejectedRow(replayed = false) {
  return {
    upload_id: uploadId,
    upload_state: "rejected",
    bucket_id: PRIVATE_EVIDENCE_BUCKET,
    object_key: objectKey,
    replayed,
    correlation_id: correlationId,
  };
}

async function rejectionOf(operation: PromiseLike<unknown>): Promise<unknown> {
  try {
    await operation;
    return null;
  } catch (error) {
    return error;
  }
}

describe("private evidence server boundary", () => {
  it("creates an actor-scoped intent and accepts only its exact generated path", async () => {
    const rpc = vi.fn(async () => ({
      data: [
        {
          upload_id: uploadId,
          bucket_id: PRIVATE_EVIDENCE_BUCKET,
          object_key: objectKey,
          upload_state: "pending",
          rejection_code: null,
          expires_at: "2099-07-20T10:15:00.000Z",
          replayed: false,
          correlation_id: correlationId,
        },
      ],
      error: null,
    }));
    const actor = actorGateway(rpc);
    const service = makeServer({ createActorGateway: async () => actor });

    const result = await service.createIntent({
      attemptId,
      title: " Browser evidence ",
      originalFileName: "report.txt",
      mimeType: "text/plain",
      byteSize: bytes.byteLength,
      sha256Hex,
      idempotencyKey: "intent-command-0001",
      correlationId,
    });

    expect(result).toEqual(intent());
    expect(rpc).toHaveBeenCalledWith("create_task_evidence_upload_intent", {
      p_attempt_id: attemptId,
      p_title: "Browser evidence",
      p_original_file_name: "report.txt",
      p_declared_mime_type: "text/plain",
      p_declared_byte_size: bytes.byteLength,
      p_client_sha256: sha256Hex,
      p_idempotency_key: "intent-command-0001",
      p_correlation_id: correlationId,
    });
  });

  it("rejects an intent path owned by another actor", async () => {
    const foreignOwner = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const rpc = vi.fn(async () => ({
      data: [
        {
          upload_id: uploadId,
          bucket_id: PRIVATE_EVIDENCE_BUCKET,
          object_key:
            `${organizationId}/${foreignOwner}/${attemptId}/${uploadId}`,
          upload_state: "pending",
          rejection_code: null,
          expires_at: "2099-07-20T10:15:00.000Z",
          replayed: false,
          correlation_id: correlationId,
        },
      ],
      error: null,
    }));

    await expect(
      makeServer({
        createActorGateway: async () => actorGateway(rpc),
      }).createIntent({
        attemptId,
        title: "Evidence",
        originalFileName: "report.txt",
        mimeType: "text/plain",
        byteSize: bytes.byteLength,
        sha256Hex,
        idempotencyKey: "intent-command-0001",
        correlationId,
      }),
    ).rejects.toEqual(new PrivateEvidenceBoundaryError("not_found"));
  });

  it("replays the actor intent and blocks tampered metadata before object access", async () => {
    const actorRpc = replayingActorRpc();
    const fetchMock = vi.fn();
    const privilegedRpc = vi.fn();

    await expect(
      makeServer({
        createActorGateway: async () => actorGateway(actorRpc),
        createPrivilegedGateway: () => privilegedGateway(privilegedRpc),
        fetch: fetchMock,
      }).validateAndFinalize({
        ...processingInput(),
        intent: { ...intent(), byteSize: bytes.byteLength + 1 },
      }),
    ).rejects.toEqual(
      new PrivateEvidenceBoundaryError("temporarily_unavailable"),
    );
    expect(actorRpc).toHaveBeenCalledWith(
      "create_task_evidence_upload_intent",
      expect.objectContaining({ p_declared_byte_size: bytes.byteLength + 1 }),
    );
    expect(fetchMock).not.toHaveBeenCalled();
    expect(privilegedRpc).not.toHaveBeenCalled();
  });

  it("blocks a replay response that does not match the retained target", async () => {
    const differentUploadId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const actorRpc = vi.fn(async () => ({
      data: [
        {
          ...replayedIntentRow(),
          upload_id: differentUploadId,
          object_key:
            `${organizationId}/${ownerId}/${attemptId}/${differentUploadId}`,
        },
      ],
      error: null,
    }));
    const fetchMock = vi.fn();

    await expect(
      makeServer({
        createActorGateway: async () => actorGateway(actorRpc),
        fetch: fetchMock,
      }).validateAndFinalize(processingInput()),
    ).rejects.toEqual(
      new PrivateEvidenceBoundaryError("temporarily_unavailable"),
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("blocks mismatched and revoked sessions before replay or privileged access", async () => {
    const mismatchedRpc = vi.fn();
    const mismatched = actorGateway(mismatchedRpc);
    mismatched.getSession.mockResolvedValue({
      data: {
        session: {
          access_token: "revoked-or-rebound-token",
          user: { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" },
        },
      },
      error: null,
    });
    const revokedRpc = vi.fn();
    const revoked = actorGateway(revokedRpc);
    revoked.getUser.mockResolvedValue({
      data: { user: null },
      error: { code: "session_revoked", detail: "provider-session-secret" },
    });
    const fetchMock = vi.fn();
    const createPrivilegedGateway = vi.fn(() => privilegedGateway());

    await expect(
      makeServer({
        createActorGateway: async () => mismatched,
        createPrivilegedGateway,
        fetch: fetchMock,
      }).validateAndFinalize(processingInput()),
    ).rejects.toEqual(new PrivateEvidenceBoundaryError("authentication_required"));
    await expect(
      makeServer({
        createActorGateway: async () => revoked,
        createPrivilegedGateway,
        fetch: fetchMock,
      }).validateAndFinalize(processingInput()),
    ).rejects.toEqual(new PrivateEvidenceBoundaryError("authentication_required"));

    expect(mismatchedRpc).not.toHaveBeenCalled();
    expect(revokedRpc).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(createPrivilegedGateway).not.toHaveBeenCalled();
  });

  it("sanitizes rejected actor gateway promises before object access", async () => {
    const secret = "postgres://service-role:secret@internal/private";
    const fetchMock = vi.fn();
    const createPrivilegedGateway = vi.fn(() => privilegedGateway());

    const rejectedUser = actorGateway();
    rejectedUser.getUser.mockRejectedValue(new Error(secret));
    const rejectedSession = actorGateway();
    rejectedSession.getSession.mockRejectedValue(new Error(secret));
    const rejectedRpc = actorGateway(
      vi.fn(async () => {
        throw new Error(secret);
      }),
    );
    const operations = [
      () =>
        makeServer({
          createActorGateway: async () => {
            throw new Error(secret);
          },
          createPrivilegedGateway,
          fetch: fetchMock,
        }).validateAndFinalize(processingInput()),
      () =>
        makeServer({
          createActorGateway: async () => rejectedUser,
          createPrivilegedGateway,
          fetch: fetchMock,
        }).validateAndFinalize(processingInput()),
      () =>
        makeServer({
          createActorGateway: async () => rejectedSession,
          createPrivilegedGateway,
          fetch: fetchMock,
        }).validateAndFinalize(processingInput()),
      () =>
        makeServer({
          createActorGateway: async () => rejectedRpc,
          createPrivilegedGateway,
          fetch: fetchMock,
        }).validateAndFinalize(processingInput()),
    ];

    for (const operation of operations) {
      const error = await rejectionOf(operation());
      expect(error).toEqual(
        new PrivateEvidenceBoundaryError("temporarily_unavailable"),
      );
      expect(String(error)).not.toContain(secret);
      expect(JSON.stringify(error)).not.toContain(secret);
    }
    expect(fetchMock).not.toHaveBeenCalled();
    expect(createPrivilegedGateway).not.toHaveBeenCalled();
  });

  it("recovers an already-ready intent through the exact finalize receipt", async () => {
    const fetchMock = vi.fn();
    const validateUpload = vi.fn();
    const privilegedRpc = vi.fn(async (name: string) =>
      name === "finalize_task_evidence_upload_service"
        ? {
            data: [{ ...finalizedRow(), replayed: true }],
            error: null,
          }
        : { data: null, error: { code: "unexpected_rpc" } },
    );

    const result = await makeServer({
      createActorGateway: async () => actorGateway(replayingActorRpc("ready")),
      createPrivilegedGateway: () => privilegedGateway(privilegedRpc),
      fetch: fetchMock,
      validateUpload,
    }).validateAndFinalize(processingInput());

    expect(result).toMatchObject({ status: "ready", replayed: true });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(validateUpload).not.toHaveBeenCalled();
    expect(privilegedRpc).toHaveBeenCalledWith(
      "finalize_task_evidence_upload_service",
      expect.objectContaining({
        p_idempotency_key: "finalize-command-0001",
        p_verified_sha256: sha256Hex,
      }),
    );
  });

  it("recovers a committed rejection through the retained exact reject receipt", async () => {
    const fetchMock = vi.fn();
    const validateUpload = vi.fn();
    const privilegedRpc = vi.fn(
      async (name: string, args: Readonly<Record<string, unknown>>) => {
        if (
          name !== "reject_task_evidence_upload_service" ||
          args.p_rejection_code !== "malformed_content"
        ) {
          return { data: null, error: { code: "unexpected_rpc" } };
        }
        return { data: [rejectedRow(true)], error: null };
      },
    );

    const result = await makeServer({
      createActorGateway: async () =>
        actorGateway(replayingActorRpc("rejected")),
      createPrivilegedGateway: () => privilegedGateway(privilegedRpc),
      fetch: fetchMock,
      validateUpload,
    }).validateAndFinalize(processingInput());

    expect(result).toEqual({
      status: "rejected",
      reason: "malformed_content",
      replayed: true,
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(validateUpload).not.toHaveBeenCalled();
    expect(privilegedRpc).toHaveBeenCalledTimes(1);
    expect(privilegedRpc).toHaveBeenCalledWith(
      "reject_task_evidence_upload_service",
      {
        p_upload_id: uploadId,
        p_actor_id: ownerId,
        p_rejection_code: "malformed_content",
        p_idempotency_key: "finalize-command-0001",
        p_correlation_id: correlationId,
      },
    );
  });

  it.each(["expired", "removed"] as const)(
    "keeps an authoritative %s upload terminal without object or service access",
    async (state) => {
      const fetchMock = vi.fn();
      const validateUpload = vi.fn();
      const createPrivilegedGateway = vi.fn(() => privilegedGateway());

      await expect(
        makeServer({
          createActorGateway: async () =>
            actorGateway(replayingActorRpc(state)),
          createPrivilegedGateway,
          fetch: fetchMock,
          validateUpload,
        }).validateAndFinalize(processingInput()),
      ).resolves.toEqual({ status: "unavailable", reason: state });
      expect(fetchMock).not.toHaveBeenCalled();
      expect(validateUpload).not.toHaveBeenCalled();
      expect(createPrivilegedGateway).not.toHaveBeenCalled();
    },
  );

  it("streams the exact authenticated object and finalizes only verified facts", async () => {
    const fetchMock = vi.fn<
      (target: RequestInfo | URL, options?: RequestInit) => Promise<Response>
    >(async () =>
      new Response(bytes, {
        status: 200,
        headers: {
          "content-length": String(bytes.byteLength),
          "content-type": "text/plain; charset=utf-8",
        },
      }),
    );
    const validateUpload = vi.fn(async (input: unknown) => {
      void input;
      return {
        accepted: true as const,
        code: "accepted" as const,
        upload: {
          fileName: "report.txt",
          mimeType: "text/plain" as const,
          byteSize: bytes.byteLength,
          sha256Hex,
        },
      };
    });
    const rpc = vi.fn(async (name: string) =>
      name === "finalize_task_evidence_upload_service"
        ? { data: [finalizedRow()], error: null }
        : { data: null, error: { code: "unexpected_rpc" } },
    );
    const result = await makeServer({
      fetch: fetchMock,
      validateUpload,
      createPrivilegedGateway: () => privilegedGateway(rpc),
    }).validateAndFinalize(processingInput());

    expect(result).toEqual({
      status: "ready",
      evidence: {
        id: evidenceId,
        title: "Browser evidence",
        originalFileName: "report.txt",
        mimeType: "text/plain",
        byteSize: bytes.byteLength,
        capturedAt: "2026-07-20T10:01:00.000Z",
      },
      replayed: false,
    });
    expect(JSON.stringify(result)).not.toContain(objectKey);
    expect(JSON.stringify(result)).not.toContain(sha256Hex);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [target, options] = fetchMock.mock.calls[0] ?? [];
    expect(String(target)).toBe(
      `https://project.supabase.co/storage/v1/object/${PRIVATE_EVIDENCE_BUCKET}/${objectKey}`,
    );
    expect(options).toMatchObject({
      method: "GET",
      cache: "no-store",
      redirect: "error",
      headers: {
        accept: "text/plain",
        apikey: "publishable-test-key",
        authorization: "Bearer actor-access-token",
        "cache-control": "no-store",
      },
    });
    const validatedInput = validateUpload.mock.calls[0]?.[0] as
      | { bytes?: Uint8Array }
      | undefined;
    expect(validatedInput).toMatchObject({
      fileName: "report.txt",
      mimeType: "text/plain",
      byteSize: bytes.byteLength,
      expectedSha256Hex: sha256Hex,
    });
    expect(Array.from(validatedInput?.bytes ?? [])).toEqual(Array.from(bytes));
    expect(rpc).toHaveBeenCalledWith("finalize_task_evidence_upload_service", {
      p_upload_id: uploadId,
      p_actor_id: ownerId,
      p_verified_mime_type: "text/plain",
      p_verified_byte_size: bytes.byteLength,
      p_verified_sha256: sha256Hex,
      p_idempotency_key: "finalize-command-0001",
      p_correlation_id: correlationId,
    });
  });

  it("rejects a stream that exceeds the declared size without invoking validation", async () => {
    const oversized = new Uint8Array(bytes.byteLength + 1);
    oversized.set(bytes);
    const fetchMock = vi.fn(async () =>
      new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(oversized);
            controller.close();
          },
        }),
        { status: 200, headers: { "content-type": "text/plain" } },
      ),
    );
    const validateUpload = vi.fn();
    const rpc = vi.fn(async (name: string) =>
      name === "reject_task_evidence_upload_service"
        ? { data: [rejectedRow()], error: null }
        : { data: null, error: { code: "unexpected_rpc" } },
    );

    await expect(
      makeServer({
        fetch: fetchMock,
        validateUpload,
        createPrivilegedGateway: () => privilegedGateway(rpc),
      }).validateAndFinalize(processingInput()),
    ).resolves.toEqual({
      status: "rejected",
      reason: "size_mismatch",
      replayed: false,
    });
    expect(validateUpload).not.toHaveBeenCalled();
    expect(rpc).toHaveBeenCalledWith(
      "reject_task_evidence_upload_service",
      expect.objectContaining({ p_rejection_code: "size_mismatch" }),
    );
  });

  it("maps authoritative validation failures to sanitized rejection codes", async () => {
    const validateUpload = vi.fn(async () => ({
      accepted: false as const,
      code: "sha256_mismatch" as const,
    }));
    const rpc = vi.fn(async (name: string) =>
      name === "reject_task_evidence_upload_service"
        ? { data: [rejectedRow()], error: null }
        : { data: null, error: { code: "unexpected_rpc" } },
    );

    const result = await makeServer({
      validateUpload,
      createPrivilegedGateway: () => privilegedGateway(rpc),
    }).validateAndFinalize(processingInput());

    expect(result).toEqual({
      status: "rejected",
      reason: "hash_mismatch",
      replayed: false,
    });
    expect(rpc).toHaveBeenCalledWith(
      "reject_task_evidence_upload_service",
      expect.objectContaining({ p_rejection_code: "hash_mismatch" }),
    );
  });

  it("keeps provider, timeout, and hash-runtime failures retryable without rejection", async () => {
    const privilegedRpc = vi.fn();
    const unavailable = makeServer({
      fetch: vi.fn(async () => {
        throw new Error("provider https://internal.example.test/secret");
      }),
      createPrivilegedGateway: () => privilegedGateway(privilegedRpc),
    });
    await expect(
      unavailable.validateAndFinalize(processingInput()),
    ).rejects.toEqual(new PrivateEvidenceBoundaryError("temporarily_unavailable"));
    expect(privilegedRpc).not.toHaveBeenCalled();

    const hashUnavailable = makeServer({
      validateUpload: vi.fn(async () => ({
        accepted: false as const,
        code: "hash_unavailable" as const,
      })),
      createPrivilegedGateway: () => privilegedGateway(privilegedRpc),
    });
    await expect(
      hashUnavailable.validateAndFinalize(processingInput()),
    ).rejects.toEqual(new PrivateEvidenceBoundaryError("temporarily_unavailable"));
    expect(privilegedRpc).not.toHaveBeenCalled();

    const timeoutFetch = vi.fn(
      async (_target: RequestInfo | URL, options?: RequestInit) =>
        new Response(
          new ReadableStream<Uint8Array>({
            start(controller) {
              options?.signal?.addEventListener("abort", () => {
                controller.error(
                  new DOMException(
                    "stalled body with provider secret",
                    "AbortError",
                  ),
                );
              });
            },
          }),
          { status: 200, headers: { "content-type": "text/plain" } },
        ),
    );
    await expect(
      makeServer({
        fetch: timeoutFetch,
        objectFetchTimeoutMs: 2,
        createPrivilegedGateway: () => privilegedGateway(privilegedRpc),
      }).validateAndFinalize(processingInput()),
    ).rejects.toEqual(new PrivateEvidenceBoundaryError("temporarily_unavailable"));
    expect(privilegedRpc).not.toHaveBeenCalled();
  });

  it("sanitizes rejected privileged and validation promises", async () => {
    const secret = "service-role-key=provider-secret private-upload-path";
    const operations = [
      () =>
        makeServer({
          createActorGateway: async () =>
            actorGateway(replayingActorRpc("ready")),
          createPrivilegedGateway: () => {
            throw new Error(secret);
          },
        }).validateAndFinalize(processingInput()),
      () =>
        makeServer({
          createActorGateway: async () =>
            actorGateway(replayingActorRpc("ready")),
          createPrivilegedGateway: () =>
            privilegedGateway(
              vi.fn(async () => {
                throw new Error(secret);
              }),
            ),
        }).validateAndFinalize(processingInput()),
      () =>
        makeServer({
          validateUpload: vi.fn(async () => {
            throw new Error(secret);
          }),
        }).validateAndFinalize(processingInput()),
      () =>
        makeServer({
          createActorGateway: async () =>
            actorGateway(replayingActorRpc("rejected")),
          createPrivilegedGateway: () =>
            privilegedGateway(
              vi.fn(async () => {
                throw new Error(secret);
              }),
            ),
        }).validateAndFinalize(processingInput()),
    ];

    for (const operation of operations) {
      const error = await rejectionOf(operation());
      expect(error).toEqual(
        new PrivateEvidenceBoundaryError("temporarily_unavailable"),
      );
      expect(String(error)).not.toContain(secret);
      expect(JSON.stringify(error)).not.toContain(secret);
    }
  });

  it("rejects an authoritative missing object but hides the target", async () => {
    const rpc = vi.fn(async (name: string) =>
      name === "reject_task_evidence_upload_service"
        ? { data: [rejectedRow()], error: null }
        : { data: null, error: { code: "unexpected_rpc" } },
    );
    const result = await makeServer({
      fetch: vi.fn(async () => new Response(null, { status: 404 })),
      createPrivilegedGateway: () => privilegedGateway(rpc),
    }).validateAndFinalize(processingInput());

    expect(result).toEqual({
      status: "rejected",
      reason: "object_unavailable",
      replayed: false,
    });
    expect(JSON.stringify(result)).not.toContain(objectKey);
  });

  it("resolves an actor-scoped target to an exact 30-second attachment URL", async () => {
    const signedUrl =
      `https://project.supabase.co/storage/v1/object/sign/${PRIVATE_EVIDENCE_BUCKET}/${objectKey}` +
      "?token=signed-token&download=report.pdf";
    const rpc = vi.fn(async () => ({
      data: [
        {
          evidence_id: evidenceId,
          bucket_id: PRIVATE_EVIDENCE_BUCKET,
          object_key: objectKey,
          original_file_name: "report.pdf",
          mime_type: "application/pdf",
          byte_size: 1024,
          sha256_hex: sha256Hex,
        },
      ],
      error: null,
    }));
    const sign = vi.fn(async () => ({
      data: { signedUrl },
      error: null,
    }));
    const result = await makeServer({
      createActorGateway: async () => actorGateway(rpc, sign),
    }).resolveDownload({ evidenceId });

    expect(result).toEqual({ status: "ready", signedUrl });
    expect(sign).toHaveBeenCalledWith(
      PRIVATE_EVIDENCE_BUCKET,
      objectKey,
      PRIVATE_EVIDENCE_SIGNED_URL_TTL_SECONDS,
      "report.pdf",
    );
  });

  it("returns 401 before parsing identifiers and 404 for cross-scope targets", async () => {
    const unauthenticated = actorGateway();
    unauthenticated.getUser.mockResolvedValue({
      data: { user: null },
      error: null,
    });
    await expect(
      makeServer({
        createActorGateway: async () => unauthenticated,
      }).resolveDownload({ evidenceId: Symbol("hostile") }),
    ).resolves.toEqual({ status: "authentication_required" });

    const rpc = vi.fn(async () => ({ data: [], error: null }));
    const sign = vi.fn();
    await expect(
      makeServer({
        createActorGateway: async () => actorGateway(rpc, sign),
      }).resolveDownload({ evidenceId }),
    ).resolves.toEqual({ status: "not_found" });
    expect(sign).not.toHaveBeenCalled();
  });

  it("contains rejected download gateway and signer promises", async () => {
    const secret = "signed-url-provider-token=secret private-object-key";
    const targetRow = {
      evidence_id: evidenceId,
      bucket_id: PRIVATE_EVIDENCE_BUCKET,
      object_key: objectKey,
      original_file_name: "report.pdf",
      mime_type: "application/pdf",
      byte_size: 1024,
      sha256_hex: sha256Hex,
    };
    const targetRpc = vi.fn(async () => ({
      data: [targetRow],
      error: null,
    }));
    const signedUrl =
      `https://project.supabase.co/storage/v1/object/sign/${PRIVATE_EVIDENCE_BUCKET}/${objectKey}` +
      "?token=signed-token&download=report.pdf";
    const rejectedRpc = actorGateway(
      vi.fn(async () => {
        throw new Error(secret);
      }),
    );
    const rejectedSigner = actorGateway(
      targetRpc,
      vi.fn(async () => {
        throw new Error(secret);
      }),
    );
    const environmentFailure = actorGateway(
      targetRpc,
      vi.fn(async () => ({ data: { signedUrl }, error: null })),
    );
    const operations = [
      () =>
        makeServer({
          createActorGateway: async () => {
            throw new Error(secret);
          },
        }).resolveDownload({ evidenceId }),
      () =>
        makeServer({
          createActorGateway: async () => rejectedRpc,
        }).resolveDownload({ evidenceId }),
      () =>
        makeServer({
          createActorGateway: async () => rejectedSigner,
        }).resolveDownload({ evidenceId }),
      () =>
        makeServer({
          createActorGateway: async () => environmentFailure,
          getStorageEnvironment: () => {
            throw new Error(secret);
          },
        }).resolveDownload({ evidenceId }),
    ];

    for (const operation of operations) {
      const result = await operation();
      expect(result).toEqual({ status: "temporarily_unavailable" });
      expect(JSON.stringify(result)).not.toContain(secret);
    }
  });

  it.each([
    `https://evil.example.test/storage/v1/object/sign/${PRIVATE_EVIDENCE_BUCKET}/${objectKey}?token=x&download=report.pdf`,
    `https://project.supabase.co/storage/v1/object/sign/${PRIVATE_EVIDENCE_BUCKET}/${organizationId}/%252F/${attemptId}/${uploadId}?token=x&download=report.pdf`,
    `https://project.supabase.co/storage/v1/object/sign/${PRIVATE_EVIDENCE_BUCKET}/${organizationId}/%2F/${attemptId}/${uploadId}?token=x&download=report.pdf`,
    `https://project.supabase.co/storage/v1/object/sign/${PRIVATE_EVIDENCE_BUCKET}/${objectKey}?token=x&download=other.pdf`,
    `https://project.supabase.co/storage/v1/object/sign/${PRIVATE_EVIDENCE_BUCKET}/${objectKey}?token=x&download=report.pdf&provider=secret`,
  ])("rejects a signed URL that escapes the exact configured target", (candidate) => {
    expect(
      isExactPrivateEvidenceSignedUrl(candidate, {
        configuredUrl: "https://project.supabase.co",
        bucketId: PRIVATE_EVIDENCE_BUCKET,
        objectKey,
        downloadName: "report.pdf",
      }),
    ).toBe(false);
  });

  it("deletes only claimed targets and treats provider not-found as success", async () => {
    const claimRows = [
      {
        upload_id: uploadId,
        bucket_id: PRIVATE_EVIDENCE_BUCKET,
        object_key: objectKey,
        cleanup_attempt: 1,
      },
      {
        upload_id: secondUploadId,
        bucket_id: PRIVATE_EVIDENCE_BUCKET,
        object_key: secondObjectKey,
        cleanup_attempt: 2,
      },
    ];
    const rpc = vi.fn(async (name: string, args: Readonly<Record<string, unknown>>) => {
      if (name === "claim_task_evidence_upload_cleanup") {
        return { data: claimRows, error: null };
      }
      if (name === "complete_task_evidence_upload_cleanup") {
        return {
          data: [
            {
              upload_id: args.p_upload_id,
              storage_deleted_at: "2026-07-20T10:00:01.000Z",
              retry_at: null,
              cleanup_attempt:
                args.p_upload_id === uploadId ? 1 : 2,
            },
          ],
          error: null,
        };
      }
      return { data: null, error: { code: "unexpected_rpc" } };
    });
    const remove = vi
      .fn()
      .mockResolvedValueOnce({ data: [], error: null })
      .mockResolvedValueOnce({
        data: null,
        error: { status: 404, message: "private provider path" },
      });

    const result = await makeServer({
      createPrivilegedGateway: () => privilegedGateway(rpc, remove),
    }).cleanupBatch({ workerId: "evidence.worker", limit: 2 });

    expect(result).toEqual({
      claimed: 2,
      deleted: 2,
      deferred: 0,
      completionFailed: 0,
    });
    expect(remove.mock.calls).toEqual([
      [PRIVATE_EVIDENCE_BUCKET, objectKey],
      [PRIVATE_EVIDENCE_BUCKET, secondObjectKey],
    ]);
    expect(JSON.stringify(result)).not.toContain("private provider path");
    expect(rpc).toHaveBeenCalledWith("claim_task_evidence_upload_cleanup", {
      p_limit: 2,
      p_worker_id: "evidence.worker",
      p_claim_token: claimToken,
    });
  });

  it("counts a rejected cleanup completion and continues the claimed batch", async () => {
    const secret = "cleanup-database-password=secret";
    let completionCall = 0;
    const rpc = vi.fn(
      async (name: string, args: Readonly<Record<string, unknown>>) => {
        if (name === "claim_task_evidence_upload_cleanup") {
          return {
            data: [
              {
                upload_id: uploadId,
                bucket_id: PRIVATE_EVIDENCE_BUCKET,
                object_key: objectKey,
                cleanup_attempt: 1,
              },
              {
                upload_id: secondUploadId,
                bucket_id: PRIVATE_EVIDENCE_BUCKET,
                object_key: secondObjectKey,
                cleanup_attempt: 1,
              },
            ],
            error: null,
          };
        }
        if (name === "complete_task_evidence_upload_cleanup") {
          completionCall += 1;
          if (completionCall === 1) throw new Error(secret);
          return {
            data: [
              {
                upload_id: args.p_upload_id,
                storage_deleted_at: "2026-07-20T10:00:01.000Z",
                retry_at: null,
                cleanup_attempt: 1,
              },
            ],
            error: null,
          };
        }
        return { data: null, error: { code: "unexpected_rpc" } };
      },
    );
    const remove = vi.fn(async () => ({ data: [], error: null }));

    const result = await makeServer({
      createPrivilegedGateway: () => privilegedGateway(rpc, remove),
    }).cleanupBatch({ workerId: "evidence.worker", limit: 2 });

    expect(result).toEqual({
      claimed: 2,
      deleted: 1,
      deferred: 0,
      completionFailed: 1,
    });
    expect(remove.mock.calls).toEqual([
      [PRIVATE_EVIDENCE_BUCKET, objectKey],
      [PRIVATE_EVIDENCE_BUCKET, secondObjectKey],
    ]);
    expect(
      rpc.mock.calls.filter(
        ([name]) => name === "complete_task_evidence_upload_cleanup",
      ),
    ).toHaveLength(2);
    expect(JSON.stringify(result)).not.toContain(secret);
  });

  it("sanitizes rejected cleanup claim and remover promises", async () => {
    const secret = "cleanup-provider-secret private-bucket";
    const claimError = await rejectionOf(
      makeServer({
        createPrivilegedGateway: () =>
          privilegedGateway(
            vi.fn(async () => {
              throw new Error(secret);
            }),
          ),
      }).cleanupBatch({ workerId: "evidence.worker", limit: 1 }),
    );
    expect(claimError).toEqual(
      new PrivateEvidenceBoundaryError("temporarily_unavailable"),
    );
    expect(String(claimError)).not.toContain(secret);

    const completionArgs: Readonly<Record<string, unknown>>[] = [];
    const rpc = vi.fn(
      async (name: string, args: Readonly<Record<string, unknown>>) => {
        if (name === "claim_task_evidence_upload_cleanup") {
          return {
            data: [
              {
                upload_id: uploadId,
                bucket_id: PRIVATE_EVIDENCE_BUCKET,
                object_key: objectKey,
                cleanup_attempt: 1,
              },
            ],
            error: null,
          };
        }
        if (name === "complete_task_evidence_upload_cleanup") {
          completionArgs.push(args);
          return {
            data: [
              {
                upload_id: uploadId,
                storage_deleted_at: null,
                retry_at: args.p_retry_at,
                cleanup_attempt: 1,
              },
            ],
            error: null,
          };
        }
        return { data: null, error: { code: "unexpected_rpc" } };
      },
    );
    const result = await makeServer({
      createPrivilegedGateway: () =>
        privilegedGateway(
          rpc,
          vi.fn(async () => {
            throw new Error(secret);
          }),
        ),
    }).cleanupBatch({ workerId: "evidence.worker", limit: 1 });

    expect(result).toEqual({
      claimed: 1,
      deleted: 0,
      deferred: 1,
      completionFailed: 0,
    });
    expect(completionArgs[0]).toMatchObject({
      p_deleted: false,
      p_error_code: "storage_remove_failed",
    });
    expect(JSON.stringify(completionArgs)).not.toContain(secret);
  });

  it("records a sanitized bounded retry without failing the committed learner removal", async () => {
    const completeArgs: Readonly<Record<string, unknown>>[] = [];
    const rpc = vi.fn(async (name: string, args: Readonly<Record<string, unknown>>) => {
      if (name === "claim_task_evidence_upload_cleanup") {
        return {
          data: [
            {
              upload_id: uploadId,
              bucket_id: PRIVATE_EVIDENCE_BUCKET,
              object_key: objectKey,
              cleanup_attempt: 3,
            },
          ],
          error: null,
        };
      }
      if (name === "complete_task_evidence_upload_cleanup") {
        completeArgs.push(args);
        return {
          data: [
            {
              upload_id: uploadId,
              storage_deleted_at: null,
              retry_at: args.p_retry_at,
              cleanup_attempt: 3,
            },
          ],
          error: null,
        };
      }
      return { data: null, error: { code: "unexpected_rpc" } };
    });
    const remove = vi.fn(async () => ({
      data: null,
      error: {
        status: 503,
        message: "s3://private-bucket/user-answer.pdf access-key=secret",
      },
    }));

    const result = await makeServer({
      createPrivilegedGateway: () => privilegedGateway(rpc, remove),
    }).cleanupBatch({ workerId: "evidence.worker", limit: 1 });

    expect(result).toEqual({
      claimed: 1,
      deleted: 0,
      deferred: 1,
      completionFailed: 0,
    });
    expect(completeArgs).toHaveLength(1);
    expect(completeArgs[0]).toMatchObject({
      p_upload_id: uploadId,
      p_deleted: false,
      p_error_code: "storage_remove_failed",
      p_retry_at: "2026-07-20T10:04:00.000Z",
    });
    expect(JSON.stringify(completeArgs)).not.toMatch(/private-bucket|secret|user-answer/u);
  });

  it("rejects corrupt cleanup claim/path bindings before deleting anything", async () => {
    const rpc = vi.fn(async () => ({
      data: [
        {
          upload_id: secondUploadId,
          bucket_id: PRIVATE_EVIDENCE_BUCKET,
          object_key: objectKey,
          cleanup_attempt: 1,
        },
      ],
      error: null,
    }));
    const remove = vi.fn();

    await expect(
      makeServer({
        createPrivilegedGateway: () => privilegedGateway(rpc, remove),
      }).cleanupBatch({ workerId: "evidence.worker", limit: 1 }),
    ).rejects.toEqual(
      new PrivateEvidenceBoundaryError("temporarily_unavailable"),
    );
    expect(remove).not.toHaveBeenCalled();
  });
});
