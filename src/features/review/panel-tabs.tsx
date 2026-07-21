"use client";

import { useRef, useState, type ReactNode } from "react";
import { cn } from "@/shared/ui";

/**
 * Below `lg` the review screen is tabbed — a 375px column cannot show a task
 * and an answer side by side and stay readable. At `lg` and above the tabs
 * disappear and every panel is laid out by the page.
 *
 * WS-0's `Tabs` is Wave 0b and had not landed; this is the local fallback and
 * keeps the same keyboard contract (roving arrow keys, `role="tablist"`).
 */
export interface PanelTabsProps {
  tabs: { id: string; label: string; content: ReactNode }[];
  /** Rendered instead of the tabs from this breakpoint up. */
  desktop: ReactNode;
}

export function PanelTabs({ tabs, desktop }: PanelTabsProps) {
  const [active, setActive] = useState(0);
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  function onKeyDown(event: React.KeyboardEvent) {
    const last = tabs.length - 1;
    let next: number | null = null;
    if (event.key === "ArrowRight") next = active === last ? 0 : active + 1;
    if (event.key === "ArrowLeft") next = active === 0 ? last : active - 1;
    if (event.key === "Home") next = 0;
    if (event.key === "End") next = last;
    if (next === null) return;
    event.preventDefault();
    setActive(next);
    refs.current[next]?.focus();
  }

  return (
    <>
      <div className="lg:hidden">
        <div
          role="tablist"
          aria-orientation="horizontal"
          onKeyDown={onKeyDown}
          className="mb-4 flex gap-1 rounded-[--radius-md] bg-[--color-surface] p-1"
        >
          {tabs.map((tab, index) => (
            <button
              key={tab.id}
              ref={(node) => {
                refs.current[index] = node;
              }}
              type="button"
              role="tab"
              id={`tab-${tab.id}`}
              aria-selected={index === active}
              aria-controls={`panel-${tab.id}`}
              tabIndex={index === active ? 0 : -1}
              onClick={() => setActive(index)}
              className={cn(
                "min-h-11 flex-1 rounded-[--radius-sm] px-3 text-[13px] font-semibold",
                "transition-colors duration-[--duration-fast]",
                index === active
                  ? "bg-[--color-bg] text-[--color-brand] shadow-[--shadow-sm]"
                  : "text-[--color-fg-muted]"
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {tabs.map((tab, index) => (
          <div
            key={tab.id}
            role="tabpanel"
            id={`panel-${tab.id}`}
            aria-labelledby={`tab-${tab.id}`}
            hidden={index !== active}
          >
            {index === active && <div className="animate-fade-in">{tab.content}</div>}
          </div>
        ))}
      </div>

      <div className="hidden lg:block">{desktop}</div>
    </>
  );
}
