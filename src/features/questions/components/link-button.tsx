import type { Route } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/shared/ui";

/**
 * A link that looks like a `Button`.
 *
 * WS-0's `Button` has no `asChild`, and `<Link><Button/></Link>` nests an
 * interactive element inside an anchor, which is invalid HTML and breaks
 * keyboard semantics. So the button's token classes are mirrored here once
 * rather than pasted into five pages.
 *
 * Deliberately only the three variants WS-3 needs. If WS-0 ever adds `asChild`
 * to `Button`, WS-7 can delete this file and swap the call sites.
 */
export function LinkButton({
  href,
  variant = "primary",
  size = "md",
  iconLeft,
  fullWidth = false,
  className,
  children,
}: {
  href: string;
  variant?: "primary" | "outline" | "ghost";
  size?: "sm" | "md";
  iconLeft?: ReactNode;
  fullWidth?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Link
      href={href as Route}
      className={cn(
        "inline-flex items-center justify-center gap-2 whitespace-nowrap font-semibold",
        "transition-[background-color,box-shadow,color] duration-[--duration-base] ease-[--ease-out]",
        size === "sm"
          ? "min-h-11 rounded-[--radius-sm] px-3 text-[13px]"
          : "min-h-11 rounded-[--radius-md] px-4 text-[15px]",
        variant === "primary" &&
          "bg-[--color-brand] text-[--color-brand-fg] shadow-[--shadow-sm] hover:bg-[--color-brand-hover]",
        variant === "outline" &&
          "border border-[--color-border-strong] text-[--color-fg] hover:bg-[--color-surface]",
        variant === "ghost" && "text-[--color-fg] hover:bg-[--color-surface]",
        fullWidth && "w-full",
        className
      )}
    >
      {iconLeft}
      {children}
    </Link>
  );
}
