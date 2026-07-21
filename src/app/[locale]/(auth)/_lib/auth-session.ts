import "server-only";

import { createServerClient } from "@/shared/database/server";

/**
 * Is there a Supabase user attached to this request?
 *
 * Deliberately *not* `getPrincipal()`: that resolves roles, organisation and
 * cohort membership, and returns null for anyone not fully provisioned. A
 * password-recovery session is a valid auth session that may have none of that,
 * and it is exactly the session `/update-password` needs.
 */
export async function hasAuthSession(): Promise<boolean> {
  const supabase = await createServerClient();
  const { data, error } = await supabase.auth.getUser();
  return !error && data.user !== null;
}
