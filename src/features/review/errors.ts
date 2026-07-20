export type ReviewErrorCode =
  | "REVIEW_NOT_FOUND"
  | "REVIEW_FORBIDDEN"
  | "REVIEW_INVALID_INPUT"
  | "REVIEW_INVALID_STATE"
  | "REVIEW_VERSION_CONFLICT"
  | "REVIEW_RUBRIC_INVALID";

export class ReviewError extends Error {
  constructor(
    readonly code: ReviewErrorCode,
    message: string,
    readonly details: Readonly<Record<string, string | number>> = {},
  ) {
    super(message);
    this.name = "ReviewError";
  }
}
