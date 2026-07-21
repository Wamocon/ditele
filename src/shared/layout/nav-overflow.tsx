"use client";

import { useEffect, useRef, useState } from "react";
import type { Route } from "next";
import Link from "next/link";
import { ChevronDown } from "lucide-react";

import { cn } from "@/shared/ui";
import type { NavItem } from "./nav-config";

export interface NavOverflowProps {
  locale: string;
  /** Nav entries that did not fit the primary row. */
  items: NavItem[];
  /** Winner from `activeNavHref`, so the trigger can show a selected state. */
  currentHref: string | null;
  label: string;
}

/**
 * The desktop half of the "Mehr" menu.
 *
 * The header only renders nav entries flagged `primary`. On mobile the rest were
 * reachable through the tab bar's "Mehr" sheet — but that whole bar is
 * `lg:hidden`, so above 1024px five admin routes (Aufgaben, Kursanfragen,
 * Fehlermeldungen, Einstellungen, Profil) and four trainer routes had no entry
 * point anywhere in the application. You could only reach them by typing the URL.
 *
 * This is the desktop counterpart of that sheet, so every nav entry is reachable
 * at every width.
 *
 * Behaviour matches `AccountMenu` deliberately — outside click and Escape both
 * close, and Escape returns focus to the trigger rather than dropping the user
 * at the top of the document.
 */
export function NavOverflow({ locale, items, currentHref, label }: NavOverflowProps) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (items.length === 0) return null;

  // If the current page lives in here, the trigger carries the selected state —
  // otherwise the header reads as though nothing is open on those routes.
  const holdsCurrent = items.some((i) => `/${locale}${i.path}` === currentHref);

  return (
    <div ref={wrapRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className={cn(
          "relative flex h-(--header-height) items-center gap-1 px-3 text-[15px] font-semibold",
          "transition-colors duration-(--duration-base)",
          holdsCurrent
            ? "text-(--color-brand)"
            : "text-(--color-fg) hover:text-(--color-brand)"
        )}
      >
        {label}
        <ChevronDown
          className={cn(
            "size-4 transition-transform duration-(--duration-base) ease-(--ease-out)",
            open && "rotate-180"
          )}
          aria-hidden
        />
        {holdsCurrent && (
          <span className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-(--color-brand)" />
        )}
      </button>

      {open && (
        <div
          role="menu"
          aria-label={label}
          className={cn(
            "animate-scale-in absolute right-0 top-[calc(100%-8px)] z-50 w-56 origin-top-right",
            "overflow-hidden rounded-(--radius-lg) border border-(--color-border)",
            "bg-(--color-bg) py-1 shadow-(--shadow-lg)"
          )}
        >
          {items.map((item) => {
            const href = `/${locale}${item.path}`;
            const active = href === currentHref;
            return (
              <Link
                key={item.path}
                href={href as Route}
                role="menuitem"
                aria-current={active ? "page" : undefined}
                onClick={() => setOpen(false)}
                className={cn(
                  "flex w-full items-center px-3 py-2 text-left text-[14px] transition-colors",
                  "hover:bg-(--color-surface-2) focus-visible:bg-(--color-surface-2)",
                  active ? "font-semibold text-(--color-brand)" : "text-(--color-fg)"
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
