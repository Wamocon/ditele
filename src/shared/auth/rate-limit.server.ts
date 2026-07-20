import "server-only";

import { headers } from "next/headers";

import { createServiceRoleClient } from "@/shared/database/service-role";
import { getSupabaseServiceRoleEnvironment } from "@/shared/database/environment";

import {
  createAuthenticationRateLimitSubjects,
  type AuthenticationRateLimitOperation,
} from "./rate-limit";

type AuthenticationRateLimitRpcResult = {
  data: boolean | null;
  error: unknown;
};

type AuthenticationRateLimitRpcClient = {
  rpc(
    functionName: "consume_authentication_rate_limit",
    parameters: {
      p_operation: AuthenticationRateLimitOperation;
      p_email_subject: string;
      p_client_subject: string;
    },
  ): PromiseLike<AuthenticationRateLimitRpcResult>;
};

/**
 * Consumes a shared database throttle bucket. Every infrastructure or contract
 * failure denies the request; no subject or provider error is logged here.
 */
export async function consumeAuthenticationRateLimit(
  operation: AuthenticationRateLimitOperation,
  email: unknown,
): Promise<boolean> {
  try {
    const environment = getSupabaseServiceRoleEnvironment();
    const hmacKey =
      process.env.DITELE_AUTH_RATE_LIMIT_HMAC_KEY ?? environment.serviceRoleKey;
    const requestHeaders = await headers();
    const subjects = createAuthenticationRateLimitSubjects({
      email,
      requestHeaders,
      hmacKey,
    });
    const client =
      createServiceRoleClient() as unknown as AuthenticationRateLimitRpcClient;
    const result = await client.rpc("consume_authentication_rate_limit", {
      p_operation: operation,
      p_email_subject: subjects.emailSubject,
      p_client_subject: subjects.clientSubject,
    });

    return result.error === null && result.data === true;
  } catch {
    return false;
  }
}
