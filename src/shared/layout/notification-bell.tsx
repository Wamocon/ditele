import type { Route } from "next";
import Link from "next/link";
import { Bell } from "lucide-react";

import { cn } from "@/shared/ui";

/**
 * Notification bell — a first-class header control with the unread count on it.
 *
 * It was a plain link buried in the account menu, so an unread notification was
 * invisible until you opened a dropdown. A count nobody can see is not a
 * notification. Server component: the count comes from the layout, so there is
 * no client fetch and no loading flash.
 */
export function NotificationBell({
  locale,
  unread = 0,
  // German defaults match the old hardcoding, so any caller that has not been
  // updated renders exactly as before. AppShell passes the localised strings.
  notificationsLabel = "Benachrichtigungen",
  notificationsUnreadLabel = "Benachrichtigungen, {count} ungelesen",
}: {
  locale: string;
  unread?: number;
  notificationsLabel?: string | undefined;
  /** Carries a `{count}` placeholder; substituted here, the only place that knows it. */
  notificationsUnreadLabel?: string | undefined;
}) {
  const label =
    unread > 0
      ? notificationsUnreadLabel.replace("{count}", String(unread))
      : notificationsLabel;

  return (
    <Link
      href={`/${locale}/learn/notifications` as Route}
      aria-label={label}
      className={cn(
        // 44px is the mandatory mobile touch target (MASTER_PLAN §6.5); it
        // relaxes to the header's 36px rhythm from lg up, where the pointer is
        // a mouse. Same pattern as ThemeToggle.
        "relative flex size-11 items-center justify-center rounded-(--radius-md) lg:size-9",
        "text-(--color-fg) transition-colors duration-(--duration-base)",
        "hover:bg-(--color-surface-2)"
      )}
    >
      <Bell className="size-[18px]" aria-hidden />
      {unread > 0 && (
        <span
          aria-hidden
          className={cn(
            "tabular absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center",
            "rounded-full bg-(--color-brand) px-1 text-[10px] font-bold leading-none",
            "text-(--color-brand-fg) ring-2 ring-(--color-bg)"
          )}
        >
          {unread > 9 ? "9+" : unread}
        </span>
      )}
    </Link>
  );
}
