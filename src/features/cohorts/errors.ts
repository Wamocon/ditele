export type CohortErrorCode =
  | "COHORT_NOT_FOUND"
  | "COHORT_FORBIDDEN"
  | "COHORT_INVALID_INPUT"
  | "COHORT_INVALID_TRANSITION"
  | "COHORT_VERSION_CONFLICT"
  | "COHORT_IMPACT_CONFIRMATION_REQUIRED"
  | "COHORT_FEATURE_DISABLED";

export class CohortError extends Error {
  constructor(
    readonly code: CohortErrorCode,
    message: string,
    readonly details: Readonly<Record<string, string | number>> = {},
  ) {
    super(message);
    this.name = "CohortError";
  }
}
