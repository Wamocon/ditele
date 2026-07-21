"use client";

import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "./use-reduced-motion";

export interface CountUpProps {
  value: number;
  /** BCP-47 tag, so 1038 renders as "1.038" in de and "1,038" in en. */
  locale?: string;
  durationMs?: number;
}

/**
 * Count a figure up from zero, once, the first time it is seen.
 *
 * The final value is what renders on the server and what a reduced-motion or
 * no-JS reader gets — the animation is layered on top of a correct number
 * rather than replacing it. A stat that reads "0" because a script did not run
 * is worse than a stat that never animated.
 *
 * Runs once and disconnects. Re-counting on every scroll-past turns a flourish
 * into a distraction.
 */
export function CountUp({ value, locale = "de-DE", durationMs = 900 }: CountUpProps) {
  const ref = useRef<HTMLSpanElement | null>(null);
  const reduced = useReducedMotion();
  const [display, setDisplay] = useState(value);

  useEffect(() => {
    if (reduced || typeof IntersectionObserver === "undefined" || value === 0) return;

    const node = ref.current;
    if (!node) return;

    let raf = 0;
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting) return;
        io.disconnect();

        const start = performance.now();
        const step = (now: number) => {
          const t = Math.min((now - start) / durationMs, 1);
          // Cubic ease-out: fast commitment, soft landing on the real figure.
          setDisplay(Math.round(value * (1 - Math.pow(1 - t, 3))));
          if (t < 1) raf = requestAnimationFrame(step);
        };
        setDisplay(0);
        raf = requestAnimationFrame(step);
      },
      { threshold: 0.4 }
    );

    io.observe(node);
    return () => {
      io.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [value, durationMs, reduced]);

  return (
    <span ref={ref} className="tabular-nums">
      {display.toLocaleString(locale)}
    </span>
  );
}
