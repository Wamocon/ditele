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
}: {
  locale: string;
  unread?: number;
}) {
  const label =
    unread > 0
      ? `Benachrichtigungen, ${unread} ungelesen`
      : "Benachrichtigungen";

  return (
    <Link
      href={`/${locale}/learn/notifications` as Route}
      aria-label={label}
      className={cn(
        "relative flex size-9 items-center justify-center rounded-(--radius-md)",
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
