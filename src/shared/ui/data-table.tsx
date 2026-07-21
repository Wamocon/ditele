import type { ReactNode } from "react";
import { cn } from "./cn";

export interface Column<T> {
  key: string;
  header: string;
  /** Rendered in both the desktop table cell and the mobile card row. */
  cell: (row: T) => ReactNode;
  /** Right-align and use tabular numerals. */
  numeric?: boolean;
  /** Hide this column in the mobile card list (e.g. a redundant id). */
  hideOnMobile?: boolean;
}

export interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  /** Whole-row link/click target. Keep the row itself non-interactive otherwise. */
  onRowClick?: (row: T) => void;
  emptyState?: ReactNode;
  stickyHeader?: boolean;
  caption?: string;
  className?: string;
}

/**
 * Table at md and above, card list below — never a horizontally scrolling
 * table on mobile (MASTER_PLAN §7.2).
 */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  onRowClick,
  emptyState,
  stickyHeader = false,
  caption,
  className,
}: DataTableProps<T>) {
  if (rows.length === 0 && emptyState) return <>{emptyState}</>;

  return (
    <div className={className}>
      {/* ── Desktop ─────────────────────────────────────────────── */}
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full border-collapse text-left text-[15px]">
          {caption && <caption className="sr-only">{caption}</caption>}
          <thead>
            <tr className={cn("border-b border-(--color-border)", stickyHeader && "sticky top-0 z-10 bg-(--color-bg)")}>
              {columns.map((c) => (
                <th
                  key={c.key}
                  scope="col"
                  className={cn(
                    "px-3 py-2.5 text-[13px] font-semibold leading-4 text-(--color-fg-muted)",
                    c.numeric && "text-right"
                  )}
                >
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={rowKey(row)}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={cn(
                  "border-b border-(--color-border) last:border-0",
                  onRowClick && "cursor-pointer transition-colors hover:bg-(--color-surface)"
                )}
              >
                {columns.map((c) => (
                  <td
                    key={c.key}
                    className={cn("px-3 py-3 align-middle", c.numeric && "text-right tabular")}
                  >
                    {c.cell(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── Mobile: card list ───────────────────────────────────── */}
      <ul className="flex flex-col gap-3 md:hidden">
        {rows.map((row) => (
          <li key={rowKey(row)}>
            <div
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              className={cn(
                "rounded-(--radius-lg) border border-(--color-border) bg-(--color-bg) p-4",
                onRowClick && "cursor-pointer"
              )}
            >
              {columns
                .filter((c) => !c.hideOnMobile)
                .map((c) => (
                  <div key={c.key} className="flex items-start justify-between gap-3 py-1">
                    <span className="text-[13px] font-semibold leading-4 text-(--color-fg-muted)">
                      {c.header}
                    </span>
                    <span className={cn("text-right text-[15px]", c.numeric && "tabular")}>
                      {c.cell(row)}
                    </span>
                  </div>
                ))}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
