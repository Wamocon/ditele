export type ContentErrorCode =
  | "CONTENT_NOT_FOUND"
  | "CONTENT_FORBIDDEN"
  | "CONTENT_INVALID_INPUT"
  | "CONTENT_INVALID_STATE"
  | "CONTENT_VERSION_CONFLICT"
  | "CONTENT_VALIDATION_FAILED"
  | "CONTENT_IMPACT_CONFIRMATION_REQUIRED"
  | "CONTENT_UPLOAD_REJECTED";

export class ContentError extends Error {
  constructor(
    readonly code: ContentErrorCode,
    message: string,
    readonly details: Readonly<Record<string, string | number>> = {},
  ) {
    super(message);
    this.name = "ContentError";
  }
}
