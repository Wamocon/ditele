import { cache } from "react";
import type { Route } from "next";
import { redirect } from "next/navigation";

import { AuthenticationRequiredError } from "@/shared/auth/errors";
import { requirePrincipal } from "@/shared/auth/principal";
import type { AppRole } from "@/shared/auth/types";
import type { Locale } from "@/shared/i18n/config";

export const getPrincipal = cache(requirePrincipal);

export async function canRenderProtectedPage(
  locale: Locale,
  nextPath: string,
  allowedRoles: readonly AppRole[],
): Promise<boolean> {
  try {
    const principal = await getPrincipal();
    return allowedRoles.some((role) => principal.roles.includes(role));
  } catch (error) {
    if (error instanceof AuthenticationRequiredError) {
      redirect(
        `/${locale}/auth/login?next=${encodeURIComponent(nextPath)}` as Route,
      );
    }
    throw error;
  }
}
