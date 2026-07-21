import { cva, type VariantProps } from "class-variance-authority";
import type { HTMLAttributes } from "react";
import { cn } from "./cn";

const badge = cva(
  "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-[0.04em]",
  {
    variants: {
      tone: {
        neutral: "bg-(--color-surface-2) text-(--color-fg-muted)",
        brand: "bg-(--color-brand-soft) text-(--color-brand)",
        success: "bg-(--color-success-soft) text-(--color-success)",
        warning: "bg-(--color-warning-soft) text-(--color-warning)",
        danger: "bg-(--color-danger-soft) text-(--color-danger)",
        info: "bg-(--color-info-soft) text-(--color-info)",
      },
    },
    defaultVariants: { tone: "neutral" },
  }
);

export interface BadgeProps
  extends HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badge> {
  /** Adds a leading dot. Status is never communicated by colour alone. */
  dot?: boolean;
}

export function Badge({ className, tone, dot, children, ...props }: BadgeProps) {
  return (
    <span className={cn(badge({ tone }), className)} {...props}>
      {dot && <span className="size-1.5 rounded-full bg-current" aria-hidden />}
      {children}
    </span>
  );
}
