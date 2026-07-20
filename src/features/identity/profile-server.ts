import "server-only";

import type { Principal } from "@/shared/auth/types";
import { AuthorizationDeniedError } from "@/shared/auth/errors";
import { hasPermission, hasRole } from "@/shared/auth/authorization";
import { createServerClient } from "@/shared/database/server";

import { projectLearnerProfile, type LearnerProfile } from "./profile-model";

export async function readLearnerProfile(
  principal: Principal,
): Promise<LearnerProfile> {
  if (
    !hasRole(principal, "learner")
    || !hasPermission(principal, "profile.read_self")
  ) {
    throw new AuthorizationDeniedError("profile.read_self");
  }

  const client = await createServerClient();
  const { data, error } = await client
    .from("profiles")
    .select(
      "user_id, display_name, locale, timezone, row_version, updated_at",
    )
    .eq("user_id", principal.userId)
    .maybeSingle();

  if (error) {
    throw new Error("profile.self_read_failed", { cause: error });
  }
  if (!data) throw new AuthorizationDeniedError("profile.read_self");
  return projectLearnerProfile(data);
}
