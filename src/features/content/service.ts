import { z } from "zod";

import { ContentError } from "./errors";
import type {
  ContentAuditRequest,
  ContentCommandPort,
  ContentLocale,
  ContentPermission,
  ContentPrincipal,
  CourseContentVersion,
  MediaUploadPort,
  MediaUploadRequest,
  MediaUploadSession,
} from "./model";
import { CONTENT_LOCALES } from "./model";
import { validateContentVersion } from "./validation";

const commandSchema = z.object({
  contentVersionId: z.string().min(1),
  expectedRevision: z.number().int().nonnegative(),
  idempotencyKey: z.string().min(8).max(200),
  correlationId: z.string().min(8).max(200),
});

const archiveSchema = commandSchema.extend({ impactFingerprint: z.string().min(8).max(500) });
const uploadSchema = z.object({
  contentVersionId: z.string().min(1),
  fileName: z.string().trim().min(1).max(255),
  mimeType: z.string().trim().min(1).max(100),
  sizeBytes: z.number().int().positive(),
  checksum: z.string().min(8).max(200).optional(),
  locale: z.enum(CONTENT_LOCALES).optional(),
  kind: z.enum(["image", "video", "document"]),
  idempotencyKey: z.string().min(8).max(200),
  correlationId: z.string().min(8).max(200),
});

export interface ContentServiceOptions {
  readonly requiredLocales: readonly ContentLocale[];
  readonly allowedUploadMimeTypes: ReadonlySet<string>;
  readonly maximumUploadBytes: number;
}

export interface SaveContentDraftInput {
  readonly content: CourseContentVersion;
  readonly expectedRevision: number;
  readonly idempotencyKey: string;
  readonly correlationId: string;
}

function assertPermission(
  principal: ContentPrincipal,
  content: CourseContentVersion,
  permission: ContentPermission,
): void {
  if (
    !principal.permissions.includes(permission)
    || principal.organizationId !== content.organizationId
  ) {
    throw new ContentError(
      "CONTENT_FORBIDDEN",
      "The administrator is not authorized for this content version.",
    );
  }
}

function assertRevision(content: CourseContentVersion, expectedRevision: number): void {
  if (content.revision !== expectedRevision) {
    throw new ContentError(
      "CONTENT_VERSION_CONFLICT",
      "The content draft changed after it was opened.",
      { expectedRevision, actualRevision: content.revision },
    );
  }
}

function audit(input: {
  readonly principal: ContentPrincipal;
  readonly content: CourseContentVersion;
  readonly eventName: string;
  readonly correlationId: string;
  readonly metadata: Readonly<Record<string, string | number | boolean>>;
}): ContentAuditRequest {
  return {
    eventName: input.eventName,
    actorId: input.principal.userId,
    organizationId: input.principal.organizationId,
    resourceType: "content_version",
    resourceId: input.content.id,
    correlationId: input.correlationId,
    metadata: input.metadata,
  };
}

export class ContentService {
  constructor(
    private readonly port: ContentCommandPort,
    private readonly uploads: MediaUploadPort,
    private readonly options: ContentServiceOptions,
  ) {}

  async saveDraft(
    principal: ContentPrincipal,
    input: SaveContentDraftInput,
  ): Promise<CourseContentVersion> {
    if (
      input.content.id.length === 0
      || input.idempotencyKey.length < 8
      || input.correlationId.length < 8
    ) {
      throw new ContentError("CONTENT_INVALID_INPUT", "The content draft command is invalid.");
    }
    assertPermission(principal, input.content, "content:write");
    assertRevision(input.content, input.expectedRevision);
    if (input.content.state !== "draft") {
      throw new ContentError(
        "CONTENT_INVALID_STATE",
        "Published and review snapshots are immutable; create or reopen a draft instead.",
      );
    }

    return this.port.saveDraft(
      {
        content: input.content,
        expectedRevision: input.expectedRevision,
        actorId: principal.userId,
        idempotencyKey: input.idempotencyKey,
      },
      audit({
        principal,
        content: input.content,
        eventName: "content.draft_saved",
        correlationId: input.correlationId,
        metadata: { expectedRevision: input.expectedRevision },
      }),
    );
  }

  async submitForReview(principal: ContentPrincipal, rawInput: unknown): Promise<CourseContentVersion> {
    const input = commandSchema.safeParse(rawInput);
    if (!input.success) {
      throw new ContentError("CONTENT_INVALID_INPUT", "The submit command is invalid.");
    }
    const content = await this.requireVersion(input.data.contentVersionId);
    assertPermission(principal, content, "content:write");
    assertRevision(content, input.data.expectedRevision);
    if (content.state !== "draft") {
      throw new ContentError("CONTENT_INVALID_STATE", "Only a draft can be submitted for review.");
    }
    const issues = validateContentVersion(content, this.options.requiredLocales);
    if (issues.length > 0) {
      throw new ContentError(
        "CONTENT_VALIDATION_FAILED",
        "The draft is incomplete and cannot enter review.",
        { issueCount: issues.length },
      );
    }
    return this.port.submitForReview(
      {
        contentVersionId: content.id,
        expectedRevision: input.data.expectedRevision,
        actorId: principal.userId,
        idempotencyKey: input.data.idempotencyKey,
      },
      audit({
        principal,
        content,
        eventName: "content.submitted_for_review",
        correlationId: input.data.correlationId,
        metadata: { expectedRevision: input.data.expectedRevision },
      }),
    );
  }

  async publish(principal: ContentPrincipal, rawInput: unknown): Promise<CourseContentVersion> {
    const input = commandSchema.safeParse(rawInput);
    if (!input.success) {
      throw new ContentError("CONTENT_INVALID_INPUT", "The publish command is invalid.");
    }
    const content = await this.requireVersion(input.data.contentVersionId);
    assertPermission(principal, content, "content:publish");
    assertRevision(content, input.data.expectedRevision);
    if (content.state !== "in_review") {
      throw new ContentError("CONTENT_INVALID_STATE", "Only a reviewed version can be published.");
    }
    const issues = validateContentVersion(content, this.options.requiredLocales);
    if (issues.length > 0) {
      throw new ContentError(
        "CONTENT_VALIDATION_FAILED",
        "The content version does not pass the publishing checklist.",
        { issueCount: issues.length },
      );
    }
    return this.port.publish(
      {
        contentVersionId: content.id,
        expectedRevision: input.data.expectedRevision,
        actorId: principal.userId,
        idempotencyKey: input.data.idempotencyKey,
      },
      audit({
        principal,
        content,
        eventName: "content.published",
        correlationId: input.data.correlationId,
        metadata: {
          expectedRevision: input.data.expectedRevision,
          versionNumber: content.versionNumber,
        },
      }),
    );
  }

  async archive(principal: ContentPrincipal, rawInput: unknown): Promise<CourseContentVersion> {
    const input = archiveSchema.safeParse(rawInput);
    if (!input.success) {
      throw new ContentError("CONTENT_INVALID_INPUT", "The archive command is invalid.");
    }
    const content = await this.requireVersion(input.data.contentVersionId);
    assertPermission(principal, content, "content:archive");
    assertRevision(content, input.data.expectedRevision);
    if (content.state !== "published") {
      throw new ContentError("CONTENT_INVALID_STATE", "Only a published version can be archived.");
    }
    const expectedImpactFingerprint = `${content.courseId}:${content.versionNumber}:${content.id}`;
    if (input.data.impactFingerprint !== expectedImpactFingerprint) {
      throw new ContentError(
        "CONTENT_IMPACT_CONFIRMATION_REQUIRED",
        "Archiving requires confirmation of the affected course version.",
      );
    }
    return this.port.archive(
      {
        contentVersionId: content.id,
        expectedRevision: input.data.expectedRevision,
        actorId: principal.userId,
        idempotencyKey: input.data.idempotencyKey,
        impactFingerprint: input.data.impactFingerprint,
      },
      audit({
        principal,
        content,
        eventName: "content.archived",
        correlationId: input.data.correlationId,
        metadata: { versionNumber: content.versionNumber, impactConfirmed: true },
      }),
    );
  }

  async initiateUpload(
    principal: ContentPrincipal,
    rawInput: MediaUploadRequest & { readonly correlationId: string },
  ): Promise<MediaUploadSession> {
    const input = uploadSchema.safeParse(rawInput);
    if (!input.success) {
      throw new ContentError("CONTENT_INVALID_INPUT", "The upload request is invalid.");
    }
    const content = await this.requireVersion(input.data.contentVersionId);
    assertPermission(principal, content, "content:write");
    if (content.state !== "draft") {
      throw new ContentError("CONTENT_INVALID_STATE", "Media can only be added to a draft.");
    }
    if (
      !this.options.allowedUploadMimeTypes.has(input.data.mimeType)
      || input.data.sizeBytes > this.options.maximumUploadBytes
    ) {
      throw new ContentError(
        "CONTENT_UPLOAD_REJECTED",
        "The upload type or size is not allowed.",
        { sizeBytes: input.data.sizeBytes },
      );
    }
    const request: MediaUploadRequest & { readonly actorId: string } = {
      contentVersionId: input.data.contentVersionId,
      fileName: input.data.fileName,
      mimeType: input.data.mimeType,
      sizeBytes: input.data.sizeBytes,
      kind: input.data.kind,
      idempotencyKey: input.data.idempotencyKey,
      actorId: principal.userId,
      ...(input.data.checksum === undefined ? {} : { checksum: input.data.checksum }),
      ...(input.data.locale === undefined ? {} : { locale: input.data.locale }),
    };
    return this.uploads.initiateResumableUpload(
      request,
      audit({
        principal,
        content,
        eventName: "content.media_upload_started",
        correlationId: input.data.correlationId,
        metadata: {
          fileName: input.data.fileName,
          mimeType: input.data.mimeType,
          sizeBytes: input.data.sizeBytes,
        },
      }),
    );
  }

  private async requireVersion(contentVersionId: string): Promise<CourseContentVersion> {
    const content = await this.port.getVersion(contentVersionId);
    if (!content) {
      throw new ContentError("CONTENT_NOT_FOUND", "The content version does not exist.");
    }
    return content;
  }
}
