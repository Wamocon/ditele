import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "./database.types";
import { getSupabaseServiceRoleEnvironment } from "./environment";

/**
 * Restricted to trusted background jobs, migrations, and provider callbacks.
 * Never use this client to serve a user request: it bypasses RLS.
 */
export function createServiceRoleClient(): SupabaseClient<Database> {
  const environment = getSupabaseServiceRoleEnvironment();

  return createClient<Database>(environment.url, environment.serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });
}

