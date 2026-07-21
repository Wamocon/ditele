"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/shared/ui";

/**
 * Reveals its children with `fade-in-up` the first time they scroll into view.
 *
 * The stagger is capped at 240ms (MASTER_PLAN §6.6) so a long list never feels
 * slow. `prefers-reduced-motion` is handled globally in `globals.css`, which
 * collapses every animation to 0.01ms — the element still ends up visible.
 *
 * Falls back to "always visible" when IntersectionObserver is missing, so
 * content is never hidden by a failed animation.
 */
export function Reveal({
  children,
  delayMs = 0,
  className,
}: {
  children: ReactNode;
  /** Position in a group; multiplied by 40ms and capped at 240ms. */
  delayMs?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node || typeof IntersectionObserver === "undefined") {
      setShown(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setShown(true);
            observer.disconnect();
          }
        }
      },
      { rootMargin: "0px 0px -10% 0px", threshold: 0.05 }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      style={shown ? { animationDelay: `${Math.min(delayMs, 240)}ms` } : undefined}
      className={cn(shown ? "animate-fade-in-up" : "opacity-0", className)}
    >
      {children}
    </div>
  );
}
