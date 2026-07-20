import { type NextRequest, NextResponse } from "next/server";

import { AuthenticationRequiredError } from "@/shared/auth/errors";
import { resolvePostAuthenticationDestination } from "@/shared/auth/post-auth-destination";
import { getServerEnvironment } from "@/shared/config/server-env";
import { isLocale } from "@/shared/i18n/config";
import { createServerClient } from "@/shared/database/server";

function canonicalRedirect(destination: string): URL {
  return new URL(destination, getServerEnvironment().DITELE_APP_ORIGIN);
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ locale: string }> },
) {
  const { locale } = await context.params;
  if (!isLocale(locale)) {
    return NextResponse.redirect(canonicalRedirect("/en/auth/login?error=invalid"));
  }

  const code = request.nextUrl.searchParams.get("code");
  const requestedNext = request.nextUrl.searchParams.get("next");

  if (code) {
    const client = await createServerClient();
    const { error } = await client.auth.exchangeCodeForSession(code);
    if (!error) {
      try {
        const destination = await resolvePostAuthenticationDestination(
          locale,
          requestedNext,
        );
        return NextResponse.redirect(canonicalRedirect(destination));
      } catch (principalError) {
        if (!(principalError instanceof AuthenticationRequiredError)) {
          throw principalError;
        }
      }
    }
  }

  return NextResponse.redirect(
    canonicalRedirect(`/${locale}/auth/login?error=invalid`),
  );
}
