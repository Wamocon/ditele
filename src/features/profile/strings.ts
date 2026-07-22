import deMessages from "@/shared/i18n/messages/de.json";
import type { UiRole } from "@/shared/auth/role";

/**
 * The profile dictionary, resolved for one reader.
 *
 * German addresses learners with "du" and staff with "Sie", everywhere in the
 * product. One shared screen must not flatten that, so `profile.informal`
 * carries learner variants of the six sentences that actually contain an
 * address form; every label and noun is shared. English and Russian repeat the
 * base copy there, because a missing key falls back to *German* and would put
 * German sentences on a translated page.
 */
type ProfileDict = typeof deMessages.profile;

export type ProfileStrings = Omit<ProfileDict, "informal">;

export function profileStrings(dictionary: ProfileDict, role: UiRole): ProfileStrings {
  const { informal, ...base } = dictionary;
  return role === "student" ? { ...base, ...informal } : base;
}
