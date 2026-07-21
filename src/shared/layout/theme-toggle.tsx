"use client";

import { useCallback, useSyncExternalStore } from "react";
import { Moon, Sun } from "lucide-react";

type Theme = "light" | "dark";

/**
 * The theme lives on <html data-theme>, stamped by the inline script in
 * layout.tsx before first paint. That makes it external state, so we read it
 * with useSyncExternalStore rather than mirroring it into React state — no
 * flash, no hydration mismatch, and no setState inside an effect.
 */
const listeners = new Set<() => void>();

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  return () => listeners.delete(onChange);
}

const getSnapshot = (): Theme =>
  document.documentElement.dataset.theme === "dark" ? "dark" : "light";

/** The server has no DOM; render the light icon and let the client correct it. */
const getServerSnapshot = (): Theme => "light";

export function ThemeToggle() {
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const toggle = useCallback(() => {
    const next: Theme = getSnapshot() === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem("ditele-theme", next);
    } catch {
      /* private mode — the toggle still works for this session */
    }
    for (const notify of listeners) notify();
  }, []);

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={theme === "dark" ? "Zu hellem Design wechseln" : "Zu dunklem Design wechseln"}
      className="flex size-9 items-center justify-center rounded-(--radius-md) text-(--color-fg-muted) transition-colors hover:bg-(--color-surface) hover:text-(--color-fg)"
    >
      {theme === "dark" ? <Moon className="size-4" /> : <Sun className="size-4" />}
    </button>
  );
}
