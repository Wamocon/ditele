import "server-only";

import { createHmac } from "node:crypto";
import { isIP } from "node:net";

export const authenticationRateLimitOperations = [
  "sign_in",
  "register",
  "password_reset",
] as const;

export type AuthenticationRateLimitOperation =
  (typeof authenticationRateLimitOperations)[number];

const INVALID_EMAIL_SUBJECT = "invalid";
const UNAVAILABLE_CLIENT_SUBJECT = "unavailable";
const MAX_EMAIL_LENGTH = 254;
const MAX_FORWARDED_HEADER_LENGTH = 1024;
const MAX_HMAC_KEY_LENGTH = 4096;

type HeaderReader = Pick<Headers, "get">;

export type AuthenticationRateLimitSubjects = Readonly<{
  emailSubject: string;
  clientSubject: string;
}>;

/**
 * Canonicalizes an email only for pseudonymous throttling. Application-level
 * validity still belongs to the authentication action schema.
 */
export function normalizeAuthenticationRateLimitEmail(value: unknown): string {
  if (typeof value !== "string") return INVALID_EMAIL_SUBJECT;

  const normalized = value.trim().normalize("NFKC").toLowerCase();
  if (
    normalized.length === 0 ||
    normalized.length > MAX_EMAIL_LENGTH ||
    normalized.includes("\0") ||
    !normalized.includes("@")
  ) {
    return INVALID_EMAIL_SUBJECT;
  }

  return normalized;
}

function normalizedIpCandidate(value: string): string | null {
  const candidate = value.trim();
  if (candidate.length === 0 || candidate.length > 64) return null;

  const withoutBrackets =
    candidate.startsWith("[") && candidate.endsWith("]")
      ? candidate.slice(1, -1)
      : candidate;

  return isIP(withoutBrackets) > 0 ? withoutBrackets.toLowerCase() : null;
}

/**
 * Returns one bounded client network subject. Reverse proxies must replace,
 * rather than append to, these headers at the trusted application boundary.
 */
export function authenticationRateLimitClientSubject(
  requestHeaders: HeaderReader,
): string {
  for (const headerName of [
    "cf-connecting-ip",
    "x-real-ip",
    "x-forwarded-for",
  ] as const) {
    const rawHeader = requestHeaders.get(headerName);
    if (!rawHeader || rawHeader.length > MAX_FORWARDED_HEADER_LENGTH) continue;

    const firstHop = rawHeader.split(",", 1)[0];
    if (firstHop === undefined) continue;

    const candidate = normalizedIpCandidate(firstHop);
    if (candidate) return candidate;
  }

  return UNAVAILABLE_CLIENT_SUBJECT;
}

function hmacSubject(
  kind: "email" | "client",
  value: string,
  hmacKey: string,
): string {
  if (hmacKey.length < 32 || hmacKey.length > MAX_HMAC_KEY_LENGTH) {
    throw new Error("Invalid authentication rate-limit HMAC key");
  }

  return createHmac("sha256", hmacKey)
    .update(`ditele-auth-rate-limit:v1:${kind}\0${value}`, "utf8")
    .digest("hex");
}

export function createAuthenticationRateLimitSubjects(input: {
  email: unknown;
  requestHeaders: HeaderReader;
  hmacKey: string;
}): AuthenticationRateLimitSubjects {
  return {
    emailSubject: hmacSubject(
      "email",
      normalizeAuthenticationRateLimitEmail(input.email),
      input.hmacKey,
    ),
    clientSubject: hmacSubject(
      "client",
      authenticationRateLimitClientSubject(input.requestHeaders),
      input.hmacKey,
    ),
  };
}
