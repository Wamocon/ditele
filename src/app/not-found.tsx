import Link from "next/link";
import type { Route } from "next";

import { defaultLocale } from "@/shared/i18n/config";

/**
 * Root-level 404 — the last resort for a URL that never matched the `[locale]`
 * segment at all (`/nonsense`, `/xx/learn`, a bad asset path).
 *
 * Deliberately server-rendered and dependency-free: it must not need a locale
 * param, a dictionary, or any data, because by definition nothing about the
 * request was recognised. Anything under `/[locale]/…` gets the richer,
 * localised `[locale]/not-found.tsx` instead.
 */
export default function RootNotFound() {
  return (
    <main className="mx-auto flex min-h-[70vh] max-w-[520px] flex-col items-center justify-center gap-4 px-4 text-center">
      <p className="text-[40px] font-bold leading-[44px] text-[--color-brand] tabular-nums">404</p>
      <h1 className="text-[22px] font-semibold leading-7">Seite nicht gefunden</h1>
      <p className="text-[15px] leading-6 text-[--color-fg-muted]">
        Diese Adresse gibt es nicht. Vielleicht wurde sie verschoben oder der Link ist alt.
      </p>
      <Link
        href={`/${defaultLocale}` as Route}
        className="mt-2 inline-flex h-10 items-center rounded-[--radius-md] bg-[--color-brand] px-4 text-[15px] font-semibold text-[--color-brand-fg] transition-colors hover:bg-[--color-brand-hover]"
      >
        Zur Startseite
      </Link>
    </main>
  );
}
