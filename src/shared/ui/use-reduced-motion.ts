"use client";

import { useSyncExternalStore } from "react";

/**
 * `prefers-reduced-motion`, read as external state.
 *
 * Same shape as `theme-toggle.tsx`: the value lives outside React, so
 * `useSyncExternalStore` reads it directly instead of mirroring it into state
 * inside an effect. That also means it updates live when someone changes the OS
 * setting with the tab open, which a one-shot `matchMedia` read in an effect
 * would miss.
 *
 * The server has no `matchMedia`. It answers `true` — the still, safe render —
 * so the first paint never animates before hydration has had a chance to say
 * whether animation is allowed.
 */
const QUERY = "(prefers-reduced-motion: reduce)";

function subscribe(onChange: () => void) {
  const mql = window.matchMedia(QUERY);
  mql.addEventListener("change", onChange);
  return () => mql.removeEventListener("change", onChange);
}

const getSnapshot = () => window.matchMedia(QUERY).matches;
const getServerSnapshot = () => true;

export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
