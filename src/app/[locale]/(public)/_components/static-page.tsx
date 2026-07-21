import type { ReactNode } from "react";
import { Info } from "lucide-react";

import { Skeleton } from "@/shared/ui";

/**
 * The shared furniture for the four static pages (about, FAQ, privacy, legal),
 * so they cannot drift into four different looks.
 */

/** One heading plus its paragraphs, held to a 68ch reading measure. */
export function ProseSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-[22px] font-semibold leading-7">{title}</h2>
      <div className="prose-measure flex flex-col gap-3 text-[15px] leading-6 text-(--color-fg-muted)">
        {children}
      </div>
    </section>
  );
}

/**
 * The visible "this still needs real data" banner on `/privacy` and `/legal`.
 *
 * Deliberately visible rather than hidden: a legal page with invented company
 * details is worse than one that says which details are still missing (I-019).
 */
export function PendingDataNotice({ children }: { children: string }) {
  return (
    <p
      role="note"
      className="flex items-start gap-2 rounded-(--radius-md) border border-(--color-warning) bg-(--color-warning-soft) px-3 py-2.5 text-[13px] leading-5 text-(--color-fg)"
    >
      <Info className="mt-0.5 size-4 shrink-0 text-(--color-warning)" aria-hidden />
      <span>{children}</span>
    </p>
  );
}

/** Loading state for a text page: a title and a few lines, not card outlines. */
export function TextPageSkeleton({ sections = 4 }: { sections?: number }) {
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-3">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-5 w-full max-w-[460px]" />
      </div>
      {Array.from({ length: sections }, (_, i) => (
        <div key={i} className="flex flex-col gap-2">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-full max-w-[68ch]" />
          <Skeleton className="h-4 w-full max-w-[68ch]" />
          <Skeleton className="h-4 w-2/3 max-w-[68ch]" />
        </div>
      ))}
    </div>
  );
}
