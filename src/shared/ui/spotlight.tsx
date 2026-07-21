"use client";

import { useCallback, useRef, type CSSProperties, type ReactNode } from "react";
import { cn } from "./cn";
import { useReducedMotion } from "./use-reduced-motion";

export interface SpotlightProps {
  children: ReactNode;
  className?: string;
  /** Radius of the highlight. Larger surfaces want a larger pool of light. */
  size?: number;
  /** Render as something other than a div — `as="li"` inside a list, etc. */
  as?: "div" | "li" | "article" | "section";
}

/**
 * Pointer-tracked highlight on a surface.
 *
 * The visual lives entirely in the `.spotlight` CSS class; this component only
 * feeds it two custom properties. That split matters:
 *
 *  - Nothing re-renders. The handler writes `--mx` / `--my` straight to the
 *    node's inline style, so React never sees a state change and a grid of
 *    twenty cards costs twenty style writes rather than twenty reconciliations.
 *  - Writes are coalesced to one per animation frame. `pointermove` fires far
 *    faster than the compositor paints, and an uncoalesced version of this is
 *    a reliable way to make a page feel worse rather than better.
 *  - With JavaScript off, the class alone still gives a soft centred sheen on
 *    hover from the 50%/50% defaults, so the effect degrades rather than
 *    disappearing.
 *
 * Under reduced motion the tracking is not registered at all and the plain
 * surface renders — no listener, no highlight.
 */
export function Spotlight({ children, className, size = 420, as: Tag = "div" }: SpotlightProps) {
  const ref = useRef<HTMLElement | null>(null);
  const frame = useRef<number | null>(null);
  const reduced = useReducedMotion();

  const onPointerMove = useCallback((event: React.PointerEvent<HTMLElement>) => {
    const node = ref.current;
    if (!node || frame.current !== null) return;

    const { clientX, clientY } = event;
    frame.current = requestAnimationFrame(() => {
      frame.current = null;
      const box = node.getBoundingClientRect();
      node.style.setProperty("--mx", `${clientX - box.left}px`);
      node.style.setProperty("--my", `${clientY - box.top}px`);
    });
  }, []);

  if (reduced) {
    return <Tag className={className}>{children}</Tag>;
  }

  return (
    <Tag
      ref={ref as never}
      onPointerMove={onPointerMove}
      className={cn("spotlight", className)}
      style={{ "--glow-size": `${size}px` } as CSSProperties}
    >
      {children}
    </Tag>
  );
}
