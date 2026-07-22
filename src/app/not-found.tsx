"use client";

import Link from "next/link";
import type { Route } from "next";
import { usePathname } from "next/navigation";

import { defaultLocale, isLocale } from "@/shared/i18n/config";
import deMessages from "@/shared/i18n/messages/de.json";
import enMessages from "@/shared/i18n/messages/en.json";
import ruMessages from "@/shared/i18n/messages/ru.json";
import { overlayMessages } from "@/shared/i18n/overlay";

/**
 * Root-level 404 — and, in practice, the 404 for *every* miss.
 *
 * The comment this replaces assumed anything under `/[locale]/…` would get the
 * localised `[locale]/not-found.tsx`. It does not: Next resolves an unmatched
 * URL to this file regardless of how much of the path matched, and a catch-all
 * page plus a neighbouring boundary does not change that. So this file is what
 * a user actually reads when they mistype a path — and hardcoded German meant
 * `/en/typo` answered an English session with "Seite nicht gefunden".
 *
 * The locale therefore has to come from the URL itself. There is no params
 * object on this route, but a client component can read the path off
 * `usePathname()`. An unrecognised or absent first segment falls back to German,
 * which is both the default locale and the right answer for `/nonsense`.
 *
 * Messages are overlaid on the German base per key, matching `getMessages`, so
 * an untranslated key shows German rather than `undefined`.
 */
const catalogues = { de: deMessages, en: enMessages, ru: ruMessages } as const;

export default function RootNotFound() {
  const pathname = usePathname();
  const segment = pathname?.split("/").filter(Boolean)[0] ?? "";
  const locale = isLocale(segment) ? segment : defaultLocale;
  const t = overlayMessages(deMessages, catalogues[locale]).public.notFound;

  return (
    <main className="mx-auto flex min-h-[70vh] max-w-[520px] flex-col items-center justify-center gap-4 px-4 text-center">
      <p className="text-[40px] font-bold leading-[44px] text-(--color-brand) tabular-nums">404</p>
      <h1 className="text-[22px] font-semibold leading-7">{t.title}</h1>
      <p className="text-[15px] leading-6 text-(--color-fg-muted)">{t.body}</p>
      <Link
        href={`/${locale}` as Route}
        className="mt-2 inline-flex h-10 items-center rounded-(--radius-md) bg-(--color-brand) px-4 text-[15px] font-semibold text-(--color-brand-fg) transition-colors hover:bg-(--color-brand-hover)"
      >
        {t.home}
      </Link>
    </main>
  );
}
