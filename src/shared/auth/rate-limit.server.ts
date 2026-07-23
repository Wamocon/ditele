import "server-only";

import type { AuthenticationRateLimitOperation } from "./rate-limit";

/**
 * The DB-backed HMAC throttle bucket (`app_private.authentication_rate_limit_buckets`
 * + `consume_authentication_rate_limit`) was removed in the schema reconstruction.
 * Supabase GoTrue already rate-limits auth requests per IP, so this is a no-op that
 * always allows — kept so the auth actions' call sites stay unchanged.
 */
export async function consumeAuthenticationRateLimit(
  _operation: AuthenticationRateLimitOperation,
  _email: unknown,
): Promise<boolean> {
  return true;
}
