export class AuthenticationRequiredError extends Error {
  readonly code = "AUTHENTICATION_REQUIRED";

  constructor() {
    super("A valid server session is required");
    this.name = "AuthenticationRequiredError";
  }
}

export class AuthorizationDeniedError extends Error {
  readonly code = "AUTHORIZATION_DENIED";

  constructor(permission: string) {
    super(`Required permission was not granted: ${permission}`);
    this.name = "AuthorizationDeniedError";
  }
}

