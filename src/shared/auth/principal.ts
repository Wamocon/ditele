import "server-only";

import { createServerClient } from "@/shared/database/server";

import { AuthenticationRequiredError } from "./errors";
import type { AppRole, Principal } from "./types";

/** Resolve the signed-in actor from `auth.users` + `profiles`. Throws for a guest. */
export async function requirePrincipal(): Promise<Principal> {
  const client = await createServerClient();
  const { data: userData, error: userError } = await client.auth.getUser();

  if (userError || !userData.user) {
    throw new AuthenticationRequiredError();
  }

  const { data: profile, error: profileError } = await client
    .from("profiles")
    .select("role, display_name, is_active")
    .eq("id", userData.user.id)
    .maybeSingle();

  if (profileError || !profile || !profile.is_active) {
    throw new AuthenticationRequiredError();
  }

  return {
    userId: userData.user.id,
    role: profile.role as AppRole,
    email: userData.user.email ?? null,
    displayName: profile.display_name,
  };
}
