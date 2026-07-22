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

export function ThemeToggle({
  // German defaults match the old hardcoding; AppShell passes the localised
  // strings, so a screen reader no longer announces German on /en and /ru.
  toLightLabel = "Zu hellem Design wechseln",
  toDarkLabel = "Zu dunklem Design wechseln",
}: {
  toLightLabel?: string | undefined;
  toDarkLabel?: string | undefined;
} = {}) {
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
      aria-label={theme === "dark" ? toLightLabel : toDarkLabel}
      /* size-11 = 44×44, the mandatory mobile touch target (MASTER_PLAN §6.5).
         The icon stays 16px; only the hit area grows. From lg up it relaxes to
         the header's 36px rhythm, where the pointer is a mouse. */
      className="flex size-11 items-center justify-center rounded-(--radius-md) text-(--color-fg-muted) transition-colors hover:bg-(--color-surface) hover:text-(--color-fg) lg:size-9"
    >
      {theme === "dark" ? <Moon className="size-4" /> : <Sun className="size-4" />}
    </button>
  );
}
