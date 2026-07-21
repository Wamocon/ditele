import type { Route } from "next";
import Link from "next/link";
import { cn } from "@/shared/ui";

/**
 * `Pagination` is a Wave 0b component that has not landed. This is the
 * documented fallback: two links plus a count, state in the URL.
 * Every WS-5 list query already takes `limit`/`offset` (§5.5 rule 2).
 */
export function Pager({
  basePath,
  query,
  page,
  pageSize,
  total,
  previousLabel,
  nextLabel,
  className,
}: {
  basePath: string;
  query: Record<string, string | undefined>;
  page: number;
  pageSize: number;
  total: number;
  previousLabel: string;
  nextLabel: string;
  className?: string;
}) {
  const lastPage = Math.max(1, Math.ceil(total / pageSize));
  if (lastPage <= 1) return null;

  const href = (target: number): Route => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      if (value) params.set(key, value);
    }
    if (target > 1) params.set("page", String(target));
    const search = params.toString();
    return (search ? `${basePath}?${search}` : basePath) as Route;
  };

  const first = (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, total);

  return (
    <nav
      className={cn("mt-4 flex flex-wrap items-center justify-between gap-3", className)}
      aria-label="Seitennavigation"
    >
      <p className="tabular text-[13px] text-(--color-fg-muted)">
        {first}–{last} von {total}
      </p>
      <div className="flex items-center gap-2">
        {page > 1 && (
          <Link
            href={href(page - 1)}
            className="inline-flex min-h-11 items-center rounded-(--radius-md) border border-(--color-border-strong) px-4 text-[15px] font-semibold hover:bg-(--color-surface)"
          >
            {previousLabel}
          </Link>
        )}
        {page < lastPage && (
          <Link
            href={href(page + 1)}
            className="inline-flex min-h-11 items-center rounded-(--radius-md) border border-(--color-border-strong) px-4 text-[15px] font-semibold hover:bg-(--color-surface)"
          >
            {nextLabel}
          </Link>
        )}
      </div>
    </nav>
  );
}
