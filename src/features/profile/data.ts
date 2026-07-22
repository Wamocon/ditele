import "server-only";

import { z } from "zod";

import { createServerClient } from "@/shared/database/server";
import { requirePrincipal } from "@/shared/auth/principal";
import { toUiRole, type UiRole } from "@/shared/auth/role";
import { err, ok, type Result } from "@/shared/data/result";
import { failPostgrest, shapeError } from "@/shared/data/profile";

/**
 * The one read behind the profile screen, for every role.
 *
 * Three separate readers used to exist — `getMyProfile` (learner),
 * `getTrainerProfile` and `getOwnProfile` (admin) — and each returned a
 * different subset. That is why the three screens showed different facts about
 * the same account: the learner never saw "member since", the trainer never saw
 * badges, and only the admin read `last_seen_at`. None of that was a decision
 * about roles; it was three chats reading three column lists.
 *
 * Every field is on the caller's OWN row, which `profiles_self_read` allows
 * whatever the role, so one function serves all three.
 *
 * The role comes from the session principal rather than a `user_roles` query.
 * The principal already carries it, and a learner has no read grant on
 * `user_roles` — the admin-only reader got away with that query precisely
 * because only admins ran it.
 */

export interface ProfileBadge {
  id: string;
  awardedAt: string;
  code: string;
  label: string;
}

export interface MyProfile {
  userId: string;
  displayName: string;
  /** Kept, never shown. `update_own_profile` requires it; the picker is gone. */
  locale: string;
  timezone: string;
  email: string | null;
  role: UiRole;
  rowVersion: number;
  /** Storage key in the public `avatars` bucket, or null for initials. */
  avatarObjectKey: string | null;
  createdAt: string;
  lastSeenAt: string | null;
  badges: ProfileBadge[];
}

const ProfileRowSchema = z.object({
  user_id: z.string(),
  display_name: z.string(),
  locale: z.string(),
  timezone: z.string(),
  row_version: z.number(),
  avatar_object_key: z.string().nullable(),
  created_at: z.string(),
  last_seen_at: z.string().nullable(),
});

export async function getMyFullProfile(locale: string): Promise<Result<MyProfile>> {
  const principal = await requirePrincipal().catch(() => null);
  if (!principal) {
    return err({ code: "AUTH", message: "Nicht angemeldet.", retryable: false });
  }

  const supabase = await createServerClient();
  const role = toUiRole(principal.roles);

  // Badges are only read for a learner. They are a learner-facing reward and
  // the section is not rendered for the other two roles, so fetching them would
  // be a round trip whose result is thrown away.
  const [profileResponse, userResponse, awardsResponse] = await Promise.all([
    supabase
      .from("profiles")
      .select(
        "user_id, display_name, locale, timezone, row_version, avatar_object_key, created_at, last_seen_at"
      )
      .eq("user_id", principal.userId)
      .maybeSingle(),
    supabase.auth.getUser(),
    role === "student"
      ? supabase
          .from("badge_awards")
          .select("id, awarded_at, badges(code, labels)")
          .eq("learner_id", principal.userId)
          .order("awarded_at", { ascending: false })
      : Promise.resolve({ data: [], error: null } as const),
  ]);

  if (profileResponse.error) return failPostgrest(profileResponse.error);
  const parsed = ProfileRowSchema.safeParse(profileResponse.data);
  if (!parsed.success) return shapeError("Das Profil");

  return ok({
    userId: parsed.data.user_id,
    displayName: parsed.data.display_name,
    locale: parsed.data.locale,
    timezone: parsed.data.timezone,
    email: userResponse.data.user?.email ?? null,
    role,
    rowVersion: parsed.data.row_version,
    avatarObjectKey: parsed.data.avatar_object_key,
    createdAt: parsed.data.created_at,
    lastSeenAt: parsed.data.last_seen_at,
    badges: (awardsResponse.data ?? []).map((award) => ({
      id: award.id,
      awardedAt: award.awarded_at,
      code: award.badges?.code ?? "?",
      // The badge catalogue stores `{de,en,ru}`; fall back to German, then the
      // code, so a missing translation is never an empty chip.
      label:
        (award.badges?.labels as Record<string, string> | null)?.[locale] ??
        (award.badges?.labels as Record<string, string> | null)?.de ??
        award.badges?.code ??
        "?",
    })),
  });
}
