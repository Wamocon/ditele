import "server-only";

import type { Route } from "next";

import type { Locale } from "@/shared/i18n/config";
import { localizedRoute } from "@/shared/i18n/routes";

import { requirePrincipal } from "./principal";
import type { Principal } from "./types";

const INTERNAL_ORIGIN = "https://ditele.invalid";
const unsafeControlCharacter = /[\u0000-\u001f\u007f]/;

export function safePostAuthenticationNext(
  locale: Locale,
  value: unknown,
): Route | null {
  if (
    typeof value !== "string" ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.includes("\\") ||
    unsafeControlCharacter.test(value)
  ) {
    return null;
  }

  let parsed: URL;
  try {
    parsed = new URL(value, INTERNAL_ORIGIN);
  } catch {
    return null;
  }

  if (parsed.origin !== INTERNAL_ORIGIN) return null;
  const localeRoot = `/${locale}`;
  if (
    parsed.pathname !== localeRoot &&
    !parsed.pathname.startsWith(`${localeRoot}/`)
  ) {
    return null;
  }

  let decodedPath: string;
  try {
    decodedPath = decodeURIComponent(parsed.pathname);
  } catch {
    return null;
  }
  if (
    /%[0-9a-f]{2}/i.test(decodedPath) ||
    decodedPath.includes("\\") ||
    unsafeControlCharacter.test(decodedPath) ||
    (decodedPath !== localeRoot &&
      !decodedPath.startsWith(`${localeRoot}/`)) ||
    decodedPath.startsWith(`${localeRoot}//`)
  ) {
    return null;
  }

  return value as Route;
}

export function principalLandingDestination(
  locale: Locale,
  principal: Principal,
): Route {
  if (principal.roles.includes("admin")) {
    return localizedRoute(locale, "/admin");
  }
  if (principal.roles.includes("content_admin")) {
    return localizedRoute(locale, "/admin/courses");
  }
  if (principal.roles.includes("organization_admin")) {
    return localizedRoute(locale, "/organization");
  }
  if (principal.roles.includes("trainer")) {
    return localizedRoute(locale, "/trainer");
  }
  if (principal.roles.includes("learner")) {
    return localizedRoute(locale, "/learn");
  }
  return localizedRoute(locale, "");
}

export async function resolvePostAuthenticationDestination(
  locale: Locale,
  requestedNext: unknown,
): Promise<Route> {
  const explicitNext = safePostAuthenticationNext(locale, requestedNext);
  if (explicitNext) return explicitNext;

  const principal = await requirePrincipal();
  return principalLandingDestination(locale, principal);
}
