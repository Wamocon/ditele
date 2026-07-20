import "server-only";

import { createServerClient as createSupabaseServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

import type { Database } from "./database.types";
import { getSupabaseServerEnvironment } from "./environment";

export async function createServerClient(): Promise<SupabaseClient<Database>> {
  const cookieStore = await cookies();
  const environment = getSupabaseServerEnvironment();

  return createSupabaseServerClient<Database>(
    environment.url,
    environment.publishableKey,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookiesToSet) => {
          try {
            for (const cookie of cookiesToSet) {
              cookieStore.set(cookie.name, cookie.value, cookie.options);
            }
          } catch (error) {
            // Server Components cannot mutate cookies. Middleware/route handlers
            // refresh the session; unexpected failures still surface.
            if (!(error instanceof Error) || !error.message.includes("Cookies")) {
              throw error;
            }
          }
        },
      },
    },
  );
}

