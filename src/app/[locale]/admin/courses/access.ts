import "server-only";

import type { Route } from "next";
import { redirect } from "next/navigation";

import { getPrincipal } from "@/app/[locale]/_data/principal";
import { AuthenticationRequiredError } from "@/shared/auth/errors";
import { hasPermission } from "@/shared/auth/authorization";
import type { Principal } from "@/shared/auth/types";
import type { Locale } from "@/shared/i18n/config";

export interface ContentStudioAccess {
  readonly principal: Principal;
  readonly canManage: boolean;
  readonly canPublish: boolean;
}

export async function readContentStudioAccess(
  locale: Locale,
  nextPath: string,
): Promise<ContentStudioAccess> {
  let principal: Principal;
  try {
    principal = await getPrincipal();
  } catch (error) {
    if (error instanceof AuthenticationRequiredError) {
      redirect(`/${locale}/auth/login?next=${encodeURIComponent(nextPath)}` as Route);
    }
    throw error;
  }
  return {
    principal,
    canManage: hasPermission(principal, "content.manage"),
    canPublish: hasPermission(principal, "content.publish"),
  };
}
