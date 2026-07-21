"use client";

import { useEffect, useRef, useState } from "react";
import type { Route } from "next";
import Link from "next/link";
import { LogOut, User } from "lucide-react";

import { cn } from "@/shared/ui";
import type { UiRole } from "@/shared/auth/role";
import { signOutAction } from "./account-actions";

/** Profile lives at a different path per role. */
function profilePath(role: UiRole): string {
  if (role === "admin") return "/admin/profile";
  if (role === "trainer") return "/trainer/profile";
  return "/learn/profile";
}

export interface AccountMenuProps {
  locale: string;
  role: UiRole;
  displayName: string;
  email?: string | undefined;
}

/**
 * The account menu behind the header avatar.
 *
 * Before this existed the avatar was a plain `<span>`: there was no way to sign
 * out, reach your profile, or change language anywhere in the application.
 */
export function AccountMenu({ locale, role, displayName, email }: AccountMenuProps) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Close on outside click and on Escape. Escape returns focus to the trigger so
  // keyboard users are not dropped at the top of the document.
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

  // Never leave the menu hanging open across a navigation. Closing on the click
  // itself rather than in an effect on `pathname`: setting state from an effect
  // costs a second render pass, and react-hooks/set-state-in-effect rightly
  // flags it.
  const close = () => setOpen(false);


  const itemClass =
    "flex w-full items-center gap-2.5 px-3 py-2 text-left text-[14px] transition-colors " +
    "hover:bg-(--color-surface-2) focus-visible:bg-(--color-surface-2)";

  return (
    <div ref={wrapRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Konto: ${displayName}`}
        className={cn(
          // 44px on mobile per MASTER_PLAN §6.5, relaxing to the header's 36px
          // rhythm from lg up. Matches ThemeToggle and NotificationBell.
          "flex size-11 items-center justify-center rounded-full lg:size-9",
          "bg-(--color-brand) text-[13px] font-semibold text-(--color-brand-fg)",
          "transition-transform duration-(--duration-fast) hover:scale-105 active:scale-95"
        )}
      >
        {initials(displayName)}
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Kontomenü"
          className={cn(
            "animate-scale-in absolute right-0 top-[calc(100%+8px)] z-50 w-60 origin-top-right",
            "overflow-hidden rounded-(--radius-lg) border border-(--color-border)",
            "bg-(--color-bg) shadow-(--shadow-lg)"
          )}
        >
          <div className="border-b border-(--color-border) px-3 py-2.5">
            <p className="truncate text-[14px] font-semibold">{displayName}</p>
            {email && (
              <p className="truncate text-[12px] text-(--color-fg-muted)">{email}</p>
            )}
          </div>

          <Link
            href={`/${locale}${profilePath(role)}` as Route}
            role="menuitem"
            onClick={close}
            className={itemClass}
          >
            <User className="size-4 shrink-0" aria-hidden />
            Profil
          </Link>



          <form
            action={async () => {
              setPending(true);
              await signOutAction(locale);
            }}
            className="border-t border-(--color-border)"
          >
            <button
              type="submit"
              role="menuitem"
              disabled={pending}
              className={cn(itemClass, "text-(--color-danger) disabled:opacity-60")}
            >
              <LogOut className="size-4 shrink-0" aria-hidden />
              {pending ? "Wird abgemeldet…" : "Abmelden"}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return parts
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}
