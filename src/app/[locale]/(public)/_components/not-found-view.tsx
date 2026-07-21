"use client";

import { useParams } from "next/navigation";
import type { Route } from "next";
import Link from "next/link";
import { Compass } from "lucide-react";

import { Button } from "@/shared/ui";
import { defaultLocale } from "@/shared/i18n/config";
import { getDict } from "../_lib/i18n";

/**
 * The branded 404.
 *
 * A client component so it can read the locale from `useParams()` — a
 * `not-found.tsx` receives no props at all.
 *
 * ⚠️ Next does **not** pick up a `not-found.tsx` placed in a route group
 * (`(public)/not-found.tsx`) — a `notFound()` from a nested page falls through
 * to Next's own black-and-white default. So this view is re-exported from a
 * `not-found.tsx` in each segment that actually calls `notFound()`.
 * A catch-all 404 for unmatched URLs needs `app/[locale]/not-found.tsx`, which
 * is outside WS-1's tree — filed as I-022.
 */
export function NotFoundView() {
  const params = useParams<{ locale?: string }>();
  const locale = params?.locale ?? defaultLocale;
  const dict = getDict(locale);

  return (
    <div className="mx-auto flex max-w-[520px] flex-col items-center gap-4 px-4 py-16 text-center">
      <span className="flex size-14 items-center justify-center rounded-full bg-[--color-surface-2] text-[--color-fg-muted]">
        <Compass className="size-7" aria-hidden />
      </span>

      <p className="tabular text-[40px] font-bold leading-[44px] text-[--color-brand]">404</p>
      <h1 className="text-[22px] font-semibold leading-7">{dict.public.notFound.title}</h1>
      <p className="text-[15px] leading-6 text-[--color-fg-muted]">{dict.public.notFound.body}</p>

      <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
        <Link href={`/${locale}/catalog` as Route}>
          <Button>{dict.public.notFound.catalog}</Button>
        </Link>
        <Link href={`/${locale}` as Route}>
          <Button variant="outline">{dict.public.notFound.home}</Button>
        </Link>
      </div>
    </div>
  );
}
