import { NextResponse, type NextRequest } from "next/server";

import { createServerClient } from "@/shared/database/server";
import { getPrincipal, postAuthDestination } from "@/shared/data/session";
import { defaultLocale, isLocale } from "@/shared/i18n/config";

/**
 * WS-1 owns this file. The one non-locale route in the app.
 *
 * Supabase sends every email link here: account confirmation and password
 * recovery both arrive as `?code=…`. We exchange the code for a session and
 * forward the user on.
 *
 * Not locale-prefixed on purpose — `redirectTo` is configured once in Supabase
 * and cannot vary per user language. The locale is carried in `next` instead.
 */

/** Only same-origin, single-slash paths. Anything else is an open redirect. */
function safeNext(value: string | null): string | null {
  if (!value) return null;
  if (!value.startsWith("/") || value.startsWith("//")) return null;
  return value;
}

/** `/de/update-password` → `de`. Falls back to the default locale. */
function localeOf(path: string | null): string {
  const segment = path?.split("/")[1] ?? "";
  return isLocale(segment) ? segment : defaultLocale;
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = safeNext(url.searchParams.get("next"));
  const locale = localeOf(next);
  const origin = url.origin;

  // Supabase reports a refused or expired link as query parameters, not as a
  // failed exchange. Send those to the login page with a readable flag rather
  // than rendering a blank callback.
  if (url.searchParams.get("error") || !code) {
    return NextResponse.redirect(`${origin}/${locale}/login?error=callback`);
  }

  const supabase = await createServerClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(`${origin}/${locale}/login?error=callback`);
  }

  if (next) return NextResponse.redirect(`${origin}${next}`);

  // No explicit target: send each role to its own dashboard.
  const session = await getPrincipal();
  return NextResponse.redirect(
    session ? `${origin}/${locale}${postAuthDestination(session.uiRole)}` : `${origin}/${locale}/login`
  );
}
