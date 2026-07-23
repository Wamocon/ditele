import "server-only";

import { redirect } from "next/navigation";
import { requirePrincipal } from "./principal";
import type { UiRole } from "./role";
import type { Principal } from "./types";
import { defaultLocale } from "@/shared/i18n/config";

export interface GuardedPrincipal {
  principal: Principal;
  uiRole: UiRole;
}

/**
 * Stops a page rendering unless the actor holds one of `allowed`. The database
 * RLS is the real boundary; every Server Action re-checks independently.
 */
export async function requireRole(
  allowed: readonly UiRole[],
  locale: string = defaultLocale
): Promise<GuardedPrincipal> {
  let principal: Principal;
  try {
    principal = await requirePrincipal();
  } catch {
    redirect(`/${locale}/login`);
  }

  if (!allowed.includes(principal.role)) redirect(`/${locale}/403`);
  return { principal, uiRole: principal.role };
}

/** Never throws. Returns null for a guest — use in the public shell. */
export async function getOptionalPrincipal(): Promise<GuardedPrincipal | null> {
  try {
    const principal = await requirePrincipal();
    return { principal, uiRole: principal.role };
  } catch {
    return null;
  }
}
