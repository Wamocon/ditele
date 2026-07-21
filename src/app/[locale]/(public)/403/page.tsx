import type { Metadata } from "next";
import type { Route } from "next";
import Link from "next/link";
import { ShieldAlert } from "lucide-react";

import { Button } from "@/shared/ui";
import { getPrincipal } from "@/shared/data/session";
import { getDict } from "../_lib/i18n";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const dict = getDict(locale);
  return { title: `${dict.public.forbidden.title} · DiTeLe`, robots: { index: false } };
}

/**
 * Where `requireRole()` sends anyone whose role does not match the route
 * (MASTER_PLAN §9.3, SEC-1). Friendly, branded, and always offers a way out.
 */
export default async function ForbiddenPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = getDict(locale).public.forbidden;
  const session = await getPrincipal();

  return (
    <div className="mx-auto flex max-w-[520px] flex-col items-center gap-4 py-16 text-center">
      <span className="flex size-14 items-center justify-center rounded-full bg-(--color-danger-soft) text-(--color-danger)">
        <ShieldAlert className="size-7" aria-hidden />
      </span>

      <p className="tabular text-[40px] font-bold leading-[44px] text-(--color-brand)">403</p>
      <h1 className="text-[22px] font-semibold leading-7">{t.title}</h1>
      <p className="text-[15px] leading-6 text-(--color-fg-muted)">{t.body}</p>

      <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
        <Link href={`/${locale}` as Route}>
          <Button>{t.home}</Button>
        </Link>
        {/* Signing in as someone else is the actual fix when a guard bounced you. */}
        {session && (
          <Link href={`/${locale}/login` as Route}>
            <Button variant="outline">{t.login}</Button>
          </Link>
        )}
      </div>
    </div>
  );
}
