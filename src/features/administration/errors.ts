export type AdministrationErrorCode =
  | "ADMIN_FORBIDDEN"
  | "ADMIN_INVALID_INPUT"
  | "ADMIN_NOT_FOUND"
  | "ADMIN_VERSION_CONFLICT"
  | "ADMIN_INVALID_STATE"
  | "ADMIN_NOT_ELIGIBLE";

export class AdministrationError extends Error {
  constructor(
    readonly code: AdministrationErrorCode,
    message: string,
    readonly details: Readonly<Record<string, string | number>> = {},
  ) {
    super(message);
    this.name = "AdministrationError";
  }
}
