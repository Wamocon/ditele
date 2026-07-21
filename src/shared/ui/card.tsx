import type { ElementType, HTMLAttributes } from "react";
import { cn } from "./cn";

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** Adds the desktop-only hover lift. Use for cards that navigate somewhere. */
  interactive?: boolean;
  padded?: boolean;
  as?: ElementType;
  /**
   * Gradient rim. Reserve it for the one card on a screen that outranks the
   * rest — if every card has a rim, the rim stops meaning anything.
   */
  rim?: boolean;
}

/**
 * The opaque half of the surface system.
 *
 * Cards hold data, so they stay fully opaque and sit on a hairline border
 * rather than a fill — glass and blur are for chrome that floats (header,
 * menus, modals). Anything a reader has to rest their eye on to get a value
 * out of is rendered on a solid ground.
 */
export function Card({
  className,
  interactive = false,
  padded = true,
  as: Tag = "div",
  rim = false,
  ...props
}: CardProps) {
  return (
    <Tag
      className={cn(
        "rounded-(--radius-lg) border border-(--color-border) bg-(--color-bg) shadow-(--shadow-sm)",
        padded && "p-4 lg:p-5",
        rim && "rim",
        interactive &&
          "transition-[transform,box-shadow,border-color] duration-(--duration-base) ease-(--ease-out) lg:hover:-translate-y-0.5 lg:hover:border-(--color-border-strong) lg:hover:shadow-(--shadow-md)",
        className
      )}
      {...props}
    />
  );
}

export function CardTitle({ className, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn("text-[18px] font-semibold leading-6", className)} {...props} />;
}

export function CardDescription({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("text-[13px] leading-5 text-(--color-fg-muted)", className)} {...props} />;
}
