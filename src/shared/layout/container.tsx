import type { ElementType, HTMLAttributes } from "react";
import { cn } from "@/shared/ui";

export interface ContainerProps extends HTMLAttributes<HTMLDivElement> {
  as?: ElementType;
}

/** max-width 1200px, centred, with the responsive page gutters from §6.5. */
export function Container({ className, as: Tag = "div", ...props }: ContainerProps) {
  return (
    <Tag
      className={cn("mx-auto w-full max-w-(--content-max) px-4 md:px-6 lg:px-8", className)}
      {...props}
    />
  );
}
