import "server-only";

import { cache } from "react";

import { createServerClient } from "@/shared/database/server";

export interface HeaderIdentity {
  displayName: string;
  email: string | undefined;
}

/**
 * The name and email shown in the header account menu.
 *
 * Every route-group layout was passing `principal.userId` as the display name,
 * so the avatar rendered the first character of a UUID — the "0" in the header.
 *
 * Wrapped in React's `cache` so the extra profile read happens once per request
 * even though several layouts and pages may ask for it.
 */
export const getHeaderIdentity = cache(async (): Promise<HeaderIdentity> => {
  const supabase = await createServerClient();

  const [{ data: auth }, profileResult] = await Promise.all([
    supabase.auth.getUser(),
    supabase.from("profiles").select("display_name").maybeSingle(),
  ]);

  const email = auth?.user?.email ?? undefined;
  const fromProfile = profileResult.data?.display_name?.trim();
  const fromMetadata =
    typeof auth?.user?.user_metadata?.["display_name"] === "string"
      ? (auth.user.user_metadata["display_name"] as string).trim()
      : "";

  // Fall back through profile → signup metadata → the local part of the email.
  // Never the user id: that is what produced the "0" avatar.
  const displayName =
    fromProfile || fromMetadata || email?.split("@")[0] || "Konto";

  return { displayName, email };
});
