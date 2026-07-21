import { cn } from "@/shared/ui";

/**
 * The numbers a trainer reads before anything else: who, which attempt, how
 * long they took, whether they used a hint. `StatTile` is Wave 0b, so this is
 * the local equivalent — deliberately dense, one line per fact.
 */
export interface MetaItem {
  label: string;
  value: string;
  /** Draws attention without colour alone — pairs with the label. */
  emphasis?: boolean;
}

export function MetaStrip({ items, className }: { items: MetaItem[]; className?: string }) {
  return (
    <dl
      className={cn(
        "grid grid-cols-2 gap-px overflow-hidden rounded-(--radius-lg) border border-(--color-border) bg-(--color-border)",
        "sm:grid-cols-3 lg:grid-cols-6",
        className
      )}
    >
      {items.map((item) => (
        <div key={item.label} className="flex flex-col gap-0.5 bg-(--color-bg) px-4 py-3">
          <dt className="text-[11px] font-semibold uppercase tracking-[0.04em] text-(--color-fg-muted)">
            {item.label}
          </dt>
          <dd
            className={cn(
              "truncate text-[15px] leading-6 tabular",
              item.emphasis ? "font-semibold text-(--color-brand)" : "text-(--color-fg)"
            )}
            title={item.value}
          >
            {item.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
