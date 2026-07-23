import "server-only";

import type { Route } from "next";

import type { Locale } from "@/shared/i18n/config";
import { localizedRoute } from "@/shared/i18n/routes";

import { requirePrincipal } from "./principal";
import type { Principal } from "./types";

const INTERNAL_ORIGIN = "https://ditele.invalid";

/** True if the string contains an ASCII control character (0x00–0x1f or 0x7f). */
function hasControlChar(value: string): boolean {
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code <= 0x1f || code === 0x7f) return true;
  }
  return false;
}

export function safePostAuthenticationNext(
  locale: Locale,
  value: unknown,
): Route | null {
  if (
    typeof value !== "string" ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.includes("\\") ||
    hasControlChar(value)
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
    hasControlChar(decodedPath) ||
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
  switch (principal.role) {
    case "admin":
      return localizedRoute(locale, "/admin");
    case "trainer":
      return localizedRoute(locale, "/trainer");
    default:
      return localizedRoute(locale, "/learn");
  }
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
