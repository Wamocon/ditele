"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { Route } from "next";
import { Check, Globe } from "lucide-react";

import { cn } from "@/shared/ui";
import { locales, type Locale } from "@/shared/i18n/config";

const LABEL: Record<Locale, string> = {
  de: "Deutsch",
  en: "English",
  ru: "Русский",
};

const SHORT: Record<Locale, string> = { de: "DE", en: "EN", ru: "RU" };

/**
 * Language switcher — a first-class header control, next to the theme toggle.
 *
 * It was buried inside the account menu, which is the wrong place: changing
 * language is not an account action, and a visitor should be able to see which
 * language they are in without opening a menu. The trigger shows the current
 * locale so that state is visible at a glance.
 */
export function LocaleSwitcher({ locale }: { locale: string }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
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

  function switchTo(next: Locale) {
    setOpen(false);
    if (next === locale) return;
    // Swap only the leading locale segment; stay on the same screen.
    const rest = pathname.replace(/^\/[^/]+/, "");
    router.push(`/${next}${rest || ""}` as Route);
    router.refresh(); // server components must re-render with the new locale
  }

  const current = locales.includes(locale as Locale) ? (locale as Locale) : "de";

  return (
    <div ref={wrapRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Sprache: ${LABEL[current]}`}
        className={cn(
          "flex h-9 items-center gap-1.5 rounded-(--radius-md) px-2",
          "text-[13px] font-semibold text-(--color-fg)",
          "transition-colors duration-(--duration-base) hover:bg-(--color-surface-2)"
        )}
      >
        <Globe className="size-4 shrink-0" aria-hidden />
        <span className="hidden sm:inline">{SHORT[current]}</span>
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Sprache wählen"
          className={cn(
            "animate-scale-in absolute right-0 top-[calc(100%+8px)] z-50 w-44 origin-top-right",
            "overflow-hidden rounded-(--radius-lg) border border-(--color-border)",
            "bg-(--color-bg) shadow-(--shadow-lg)"
          )}
        >
          {locales.map((code) => (
            <button
              key={code}
              type="button"
              role="menuitemradio"
              aria-checked={code === current}
              onClick={() => switchTo(code)}
              className={cn(
                "flex w-full items-center gap-2 px-3 py-2 text-left text-[14px]",
                "transition-colors hover:bg-(--color-surface-2) focus-visible:bg-(--color-surface-2)"
              )}
            >
              <span className="flex-1">{LABEL[code]}</span>
              {code === current && (
                <Check className="size-4 shrink-0 text-(--color-brand)" aria-hidden />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
