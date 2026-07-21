import type { ReactNode } from "react";
import Link from "next/link";
import Image from "next/image";

import { getMessages } from "@/shared/i18n/get-messages";
import { defaultLocale, isLocale } from "@/shared/i18n/config";

/** WS-0 owns this file. Centred card, no nav — auth pages stand alone. */
export default async function AuthLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  // The auth screens build their own header instead of using AppShell, so the
  // wordmark's accessible name has to be resolved here too. It was hardcoded
  // German, which is what a screen reader announced on /en/login.
  const messages = await getMessages(isLocale(locale) ? locale : defaultLocale);
  const common = messages.common as Record<string, string | undefined>;
  const brandHomeLabel = common.brandHome ?? "DiTeLe — zur Startseite";
  return (
    // No background of its own. A full-bleed opaque wrapper here sat on top of
    // the ambient field in globals.css, so the auth screens were the only ones
    // in the app with a flat ground. The centred card already separates itself
    // from the page with its own border and shadow.
    <div className="flex min-h-dvh flex-col items-center justify-center px-4 py-10">
      {/* The wordmark is 17px tall but it is the only way back out of the auth
          screens, so the hit area is padded to the mandatory 44px on mobile
          (MASTER_PLAN §6.5). Matches app-header.tsx. */}
      <Link
        href={`/${locale}`}
        className="mb-8 flex min-h-11 items-center lg:min-h-0"
        aria-label={brandHomeLabel}
      >
        <Image src="/logo.svg" alt="DiTeLe" width={167} height={17} priority className="h-[17px] w-auto" />
      </Link>
      {/* ⭐ `<main id="main">`, not a `<div>` — added by WS-13.
          The auth group build its own chrome instead of using AppShell, and in
          doing so it was the only part of the application with NO `main`
          landmark at all: /login, /register and /reset-password rendered zero
          of them. So a screen-reader user had no "skip to main content" target
          and no landmark to jump to on the three screens every single user
          meets first. Found by the regression check asserting `<main>` is not
          empty and getting "there is no `<main>`" instead. */}
      <main
        id="main"
        className="w-full max-w-[420px] animate-scale-in rounded-(--radius-lg) border border-(--color-border) bg-(--color-bg) p-6 shadow-(--shadow-md)"
      >
        {children}
      </main>
    </div>
  );
}
