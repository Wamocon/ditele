import "server-only";

import { redirect } from "next/navigation";
import { requirePrincipal } from "./principal";
import { toUiRole, type UiRole } from "./role";
import type { Principal } from "./types";
import { defaultLocale } from "@/shared/i18n/config";

export interface GuardedPrincipal {
  principal: Principal;
  uiRole: UiRole;
}

/**
 * Layer 2 of the three permission layers (MASTER_PLAN §9.3).
 * The database is the real boundary; this stops a page rendering at all.
 *
 * ⚠️ A layout guard does NOT protect a POST. Every Server Action re-checks.
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

  const uiRole = toUiRole(principal.roles);
  if (!allowed.includes(uiRole)) redirect(`/${locale}/403`);
  return { principal, uiRole };
}

/** Never throws. Returns null for a guest — use in the public shell. */
export async function getOptionalPrincipal(): Promise<GuardedPrincipal | null> {
  try {
    const principal = await requirePrincipal();
    return { principal, uiRole: toUiRole(principal.roles) };
  } catch {
    return null;
  }
}
