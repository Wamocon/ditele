"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { cn } from "./cn";
import { useReducedMotion } from "./use-reduced-motion";

export interface RevealProps {
  children: ReactNode;
  className?: string;
  /** Milliseconds. Capped by the caller — see the stagger cap in globals.css. */
  delay?: number;
  variant?: "up" | "fade" | "scale";
}

const VARIANT: Record<NonNullable<RevealProps["variant"]>, string> = {
  up: "translate-y-2",
  fade: "",
  scale: "scale-[0.98]",
};

/**
 * Reveal a block as it scrolls into view.
 *
 * Deliberately *not* the reference file's pattern of starting at `opacity: 0`
 * in CSS and waiting for JavaScript to add a class. That approach hides content
 * permanently for anyone whose JS fails to run, and hides it from the first
 * paint even when it is already on screen. Here the hidden state is only ever
 * applied by the client after it has confirmed it can also remove it, so the
 * server render is fully visible and the content is never at risk.
 *
 * Anything already in the viewport on mount is revealed immediately rather than
 * animating in — a block the user is already looking at should not move.
 *
 * Browsers with `animation-timeline: view()` get the CSS-only path from
 * globals.css instead, which runs off the main thread.
 */
export function Reveal({ children, className, delay = 0, variant = "up" }: RevealProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const reduced = useReducedMotion();
  const [armed, setArmed] = useState(false);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    if (reduced || typeof IntersectionObserver === "undefined") return;

    const node = ref.current;
    if (!node) return;

    // Already on screen: skip the animation entirely, don't arm the hidden state.
    if (node.getBoundingClientRect().top < window.innerHeight * 0.92) {
      setShown(true);
      return;
    }

    setArmed(true);

    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          setShown(true);
          io.disconnect();
        }
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.05 }
    );

    io.observe(node);
    return () => io.disconnect();
  }, [reduced]);

  const hidden = armed && !shown;

  return (
    <div
      ref={ref}
      className={cn(
        "motion-safe:transition-[opacity,transform] motion-safe:duration-(--duration-slow) motion-safe:ease-(--ease-out)",
        hidden && cn("opacity-0", VARIANT[variant]),
        className
      )}
      style={hidden ? undefined : ({ transitionDelay: `${delay}ms` } as CSSProperties)}
    >
      {children}
    </div>
  );
}
