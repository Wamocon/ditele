import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Principal } from "@/shared/auth/types";

import type { Database } from "./database.types";
import { createServerClient } from "./server";

export interface RepositoryContext {
  client: SupabaseClient<Database>;
  principal: Principal;
}

export type RepositoryFactory<TRepository> = (
  context: RepositoryContext,
) => TRepository;

export async function createRepositoryContext(
  principal: Principal,
): Promise<RepositoryContext> {
  return {
    client: await createServerClient(),
    principal,
  };
}

