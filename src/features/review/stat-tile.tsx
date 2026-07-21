import type { Route } from "next";
import Link from "next/link";
import { Card, cn } from "@/shared/ui";

/**
 * `StatTile` is Wave 0b and had not landed. Local equivalent: a number, its
 * label, and — when the number means "work is waiting" — a link straight to it.
 */
export interface StatTileProps {
  label: string;
  value: string;
  href?: string;
  /** Turns the number red when there is something to act on. */
  alert?: boolean;
}

export function StatTile({ label, value, href, alert = false }: StatTileProps) {
  const body = (
    <>
      <span className="text-[11px] font-semibold uppercase tracking-[0.04em] text-(--color-fg-muted)">
        {label}
      </span>
      <span
        className={cn(
          "text-[30px] font-semibold leading-9 tabular",
          alert ? "text-(--color-brand)" : "text-(--color-fg)"
        )}
      >
        {value}
      </span>
    </>
  );

  if (!href) {
    return <Card className="flex flex-col gap-1">{body}</Card>;
  }

  return (
    <Card interactive padded={false}>
      <Link href={href as Route} className="flex flex-col gap-1 p-4 lg:p-5">
        {body}
      </Link>
    </Card>
  );
}
