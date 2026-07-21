"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

type Theme = "light" | "dark";

/**
 * Reads the theme the inline script in layout.tsx already applied, so there is
 * no flash and no hydration mismatch.
 */
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme | null>(null);

  useEffect(() => {
    const current = document.documentElement.dataset.theme;
    setTheme(current === "dark" ? "dark" : "light");
  }, []);

  function toggle() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem("ditele-theme", next);
    } catch {
      /* private mode — the toggle still works for this session */
    }
    setTheme(next);
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={theme === "dark" ? "Zu hellem Design wechseln" : "Zu dunklem Design wechseln"}
      className="flex size-9 items-center justify-center rounded-[--radius-md] text-[--color-fg-muted] transition-colors hover:bg-[--color-surface] hover:text-[--color-fg]"
    >
      {/* Render nothing until mounted so server and client markup agree. */}
      {theme === "dark" ? <Moon className="size-4" /> : theme === "light" ? <Sun className="size-4" /> : null}
    </button>
  );
}
