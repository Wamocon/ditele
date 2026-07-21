import type { ElementType, HTMLAttributes } from "react";
import { cn } from "./cn";

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** Adds the desktop-only hover lift. Use for cards that navigate somewhere. */
  interactive?: boolean;
  padded?: boolean;
  as?: ElementType;
}

export function Card({
  className,
  interactive = false,
  padded = true,
  as: Tag = "div",
  ...props
}: CardProps) {
  return (
    <Tag
      className={cn(
        "rounded-[--radius-lg] border border-[--color-border] bg-[--color-bg] shadow-[--shadow-sm]",
        padded && "p-4 lg:p-5",
        interactive &&
          "transition-[transform,box-shadow] duration-[--duration-base] ease-[--ease-out] lg:hover:-translate-y-0.5 lg:hover:shadow-[--shadow-md]",
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
  return <p className={cn("text-[13px] leading-5 text-[--color-fg-muted]", className)} {...props} />;
}
