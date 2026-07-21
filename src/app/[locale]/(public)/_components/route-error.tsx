"use client";

import { useParams } from "next/navigation";
import type { Route } from "next";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";

import { Button } from "@/shared/ui";
import { defaultLocale } from "@/shared/i18n/config";
import { getDict } from "../_lib/i18n";

/**
 * WS-1's error boundary, used by every `(public)` and `(auth)` route.
 *
 * Two deliberate choices:
 *  - The user is never shown `error.message`. A server error message can carry
 *    internals; the `digest` is what a support request actually needs.
 *  - The locale comes from `useParams()`, because an `error.tsx` receives only
 *    `error` and `reset` — no route params.
 */
export function RouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const params = useParams<{ locale?: string }>();
  const locale = params?.locale ?? defaultLocale;
  const dict = getDict(locale);

  return (
    <div
      role="alert"
      className="mx-auto flex max-w-[520px] flex-col items-center gap-4 rounded-[--radius-lg] border border-[--color-border] bg-[--color-bg] px-6 py-12 text-center"
    >
      <span className="flex size-12 items-center justify-center rounded-full bg-[--color-danger-soft] text-[--color-danger]">
        <AlertTriangle className="size-6" aria-hidden />
      </span>

      <h1 className="text-[22px] font-semibold leading-7">{dict.public.error.title}</h1>
      <p className="text-[15px] leading-6 text-[--color-fg-muted]">{dict.public.error.body}</p>

      {error.digest && (
        <p className="tabular text-[13px] text-[--color-fg-subtle]">
          {dict.public.error.reference}: <code>{error.digest}</code>
        </p>
      )}

      <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
        <Button onClick={reset}>{dict.public.error.retry}</Button>
        <Link href={`/${locale}` as Route}>
          <Button variant="outline">{dict.public.error.home}</Button>
        </Link>
      </div>
    </div>
  );
}
