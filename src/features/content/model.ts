export const CONTENT_LOCALES = ["en", "de", "ru"] as const;
export type ContentLocale = (typeof CONTENT_LOCALES)[number];
export type ContentVersionState = "draft" | "in_review" | "published" | "archived";
export type ContentPermission =
  | "content:read"
  | "content:write"
  | "content:publish"
  | "content:archive";

export interface ContentPrincipal {
  readonly userId: string;
  readonly organizationId: string;
  readonly role: "admin";
  readonly permissions: readonly ContentPermission[];
}

export interface LocalizedText {
  readonly en: string;
  readonly de: string;
  readonly ru: string;
}

export interface LocalizedCourseMetadata {
  readonly name: LocalizedText;
  readonly description: LocalizedText;
}

export interface ContentMedia {
  readonly id: string;
  readonly kind: "image" | "video" | "document";
  readonly locale?: ContentLocale;
  readonly storageKey: string;
  readonly fileName: string;
  readonly mimeType: string;
  readonly sizeBytes: number;
  readonly status: "uploading" | "ready" | "failed";
  readonly checksum?: string;
}

export interface TestAnswerDefinition {
  readonly id: string;
  readonly label: LocalizedText;
  readonly isCorrect: boolean;
  readonly position: number;
}

export interface TaskTestDefinition {
  readonly question: LocalizedText;
  readonly answers: readonly TestAnswerDefinition[];
}

export interface ContentTaskDefinition {
  readonly id: string;
  readonly title: LocalizedText;
  readonly description: LocalizedText;
  readonly expectedAnswer: LocalizedText;
  readonly hint: LocalizedText;
  readonly targetUrl?: string;
  readonly beforeMediaIds: readonly string[];
  readonly afterMediaIds: readonly string[];
  readonly bugCategoryIds: readonly string[];
  readonly skillIds: readonly string[];
  readonly prerequisiteTaskIds: readonly string[];
  readonly test?: TaskTestDefinition;
  readonly position: number;
}

export interface CourseStageDefinition {
  readonly id: string;
  readonly title: LocalizedText;
  readonly position: number;
  readonly startMediaIds: readonly string[];
  readonly endMediaIds: readonly string[];
  readonly tasks: readonly ContentTaskDefinition[];
}

export interface BugCategoryDefinition {
  readonly id: string;
  readonly name: LocalizedText;
}

export interface CourseContentVersion {
  readonly id: string;
  readonly organizationId: string;
  readonly courseId: string;
  readonly versionNumber: number;
  readonly revision: number;
  readonly state: ContentVersionState;
  readonly metadata: LocalizedCourseMetadata;
  readonly stages: readonly CourseStageDefinition[];
  readonly media: readonly ContentMedia[];
  readonly bugCategories: readonly BugCategoryDefinition[];
  readonly prerequisiteCourseIds: readonly string[];
  readonly createdBy: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly submittedAt?: string;
  readonly publishedAt?: string;
  readonly publishedBy?: string;
}

export type ValidationIssueCode =
  | "missing_translation"
  | "missing_stage"
  | "missing_task"
  | "invalid_test"
  | "media_not_ready"
  | "invalid_position"
  | "duplicate_reference";

export interface ContentValidationIssue {
  readonly code: ValidationIssueCode;
  readonly path: string;
  readonly message: string;
  readonly locale?: ContentLocale;
}

export interface ContentAuditRequest {
  readonly eventName: string;
  readonly actorId: string;
  readonly organizationId: string;
  readonly resourceType: "content_version";
  readonly resourceId: string;
  readonly correlationId: string;
  readonly metadata: Readonly<Record<string, string | number | boolean>>;
}

export interface SaveDraftCommand {
  readonly content: CourseContentVersion;
  readonly expectedRevision: number;
  readonly actorId: string;
  readonly idempotencyKey: string;
}

export interface ContentTransitionCommand {
  readonly contentVersionId: string;
  readonly expectedRevision: number;
  readonly actorId: string;
  readonly idempotencyKey: string;
}

export interface ArchiveContentCommand extends ContentTransitionCommand {
  readonly impactFingerprint: string;
}

export interface ContentCommandPort {
  getVersion(contentVersionId: string): Promise<CourseContentVersion | null>;
  saveDraft(
    command: SaveDraftCommand,
    audit: ContentAuditRequest,
  ): Promise<CourseContentVersion>;
  submitForReview(
    command: ContentTransitionCommand,
    audit: ContentAuditRequest,
  ): Promise<CourseContentVersion>;
  /** Must publish an immutable snapshot using an atomic revision compare-and-set. */
  publish(
    command: ContentTransitionCommand,
    audit: ContentAuditRequest,
  ): Promise<CourseContentVersion>;
  archive(
    command: ArchiveContentCommand,
    audit: ContentAuditRequest,
  ): Promise<CourseContentVersion>;
}

export interface MediaUploadRequest {
  readonly contentVersionId: string;
  readonly fileName: string;
  readonly mimeType: string;
  readonly sizeBytes: number;
  readonly checksum?: string;
  readonly locale?: ContentLocale;
  readonly kind: ContentMedia["kind"];
  readonly idempotencyKey: string;
}

export interface MediaUploadSession {
  readonly uploadId: string;
  readonly contentVersionId: string;
  readonly offset: number;
  readonly expiresAt: string;
  readonly status: "ready" | "uploading" | "complete";
}

export interface MediaUploadPort {
  initiateResumableUpload(
    request: MediaUploadRequest & { readonly actorId: string },
    audit: ContentAuditRequest,
  ): Promise<MediaUploadSession>;
}
