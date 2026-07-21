import type { Metadata } from "next";
import { ChevronDown } from "lucide-react";

import { PageHeader } from "@/shared/layout";
import { getDict } from "../_lib/i18n";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const dict = getDict(locale);
  return { title: `${dict.public.faq.title} · DiTeLe`, description: dict.public.faq.description };
}

export default async function FaqPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = getDict(locale).public.faq;

  const entries = [
    { q: t.q1, a: t.a1 },
    { q: t.q2, a: t.a2 },
    { q: t.q3, a: t.a3 },
    { q: t.q4, a: t.a4 },
    { q: t.q5, a: t.a5 },
    { q: t.q6, a: t.a6 },
    { q: t.q7, a: t.a7 },
    { q: t.q8, a: t.a8 },
    { q: t.q9, a: t.a9 },
    { q: t.q10, a: t.a10 },
  ];

  return (
    <>
      <PageHeader title={t.title} description={t.description} />

      {/*
        Native <details>: keyboard-operable, screen-reader-announced and
        searchable by the browser's own find-in-page, with no JavaScript and no
        dependency. A hand-built accordion would be worse on all four counts.
      */}
      <div className="flex flex-col gap-2">
        {entries.map((entry) => (
          <details
            key={entry.q}
            className="group rounded-[--radius-lg] border border-[--color-border] bg-[--color-bg] open:shadow-[--shadow-sm]"
          >
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-4 text-[15px] font-semibold leading-6 marker:content-none lg:px-5">
              {entry.q}
              <ChevronDown
                className="size-4 shrink-0 text-[--color-fg-muted] transition-transform duration-[--duration-base] group-open:rotate-180"
                aria-hidden
              />
            </summary>
            <p className="prose-measure px-4 pb-4 text-[15px] leading-6 text-[--color-fg-muted] lg:px-5">
              {entry.a}
            </p>
          </details>
        ))}
      </div>
    </>
  );
}
