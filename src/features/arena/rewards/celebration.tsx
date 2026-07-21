"use client";

import { useState, useTransition } from "react";
import { Award, Sparkles } from "lucide-react";
import { Button, useReducedMotion } from "@/shared/ui";
import type { Celebration } from "./model";

/**
 * The level-up / badge celebration — `06_…` §8 item 7.
 *
 * **What it celebrates is a notification, not a new kind of state.** An unread
 * `badge.awarded` or `level.up` row IS the queue: it dedupes for free
 * (`notifications` is unique on recipient + key), it survives a reload, and
 * dismissing is the shipped `mark_notification_read` RPC rather than a new
 * write path. Nothing here invents a "seen" column.
 *
 * ⚠️ **`prefers-reduced-motion` is honoured, and honoured properly.** The hook
 * answers `true` on the server — the still, safe render — so the first paint
 * never animates before hydration has said whether animation is allowed. With
 * motion reduced this is a plain card that appears; with motion allowed it
 * scales and the sparks drift. Both render the same text and the same button,
 * so nothing about the reduced version is a lesser experience.
 *
 * It is also not a modal. A celebration that traps focus is a celebration that
 * interrupts, and a learner who opened the Arena to check their hunts should
 * not have to dismiss a party first. `role="status"` announces it once, politely.
 */

/**
 * ⚠️ Every field is a plain string, and `levelTitle` is a TEMPLATE rather than
 * a formatter function. This is a Client Component, and a function prop that is
 * not a Server Action cannot cross the boundary — React fails the whole render
 * with "Functions cannot be passed directly to Client Components", which
 * surfaces in production as a digest-only error with no message. The Server
 * Components in `hub-sections.tsx` take formatter props quite happily; this one
 * cannot, and the difference is only visible at runtime.
 */
export interface CelebrationStrings {
  badgeTitle: string;
  /** Carries `{level}`, interpolated here rather than by the caller. */
  levelTitle: string;
  dismiss: string;
  regionLabel: string;
}

export function CelebrationBanner({
  celebrations,
  strings,
  onDismiss,
}: {
  celebrations: Celebration[];
  strings: CelebrationStrings;
  /** Marks the notification read. Server Action — see `actions.ts`. */
  onDismiss: (notificationId: string, rowVersion: number) => Promise<void>;
}) {
  const reduceMotion = useReducedMotion();
  const [dismissed, setDismissed] = useState<string[]>([]);
  const [pending, startTransition] = useTransition();

  const visible = celebrations.filter((c) => !dismissed.includes(c.notificationId));
  if (visible.length === 0) return null;

  return (
    <div className="flex flex-col gap-3" role="status" aria-label={strings.regionLabel}>
      {visible.map((celebration) => (
        <div
          key={celebration.notificationId}
          className={[
            "relative flex items-center gap-4 overflow-hidden rounded-(--radius-lg)",
            "border border-(--color-brand) bg-(--color-brand-soft) p-4",
            // Motion is additive: without it the card is simply there.
            reduceMotion ? "" : "animate-scale-in",
          ].join(" ")}
        >
          {reduceMotion ? null : <Sparks />}

          <span className="grid size-11 shrink-0 place-items-center rounded-full bg-(--color-brand) text-(--color-brand-fg)">
            {celebration.kind === "level" ? (
              <Sparkles className="size-5" aria-hidden />
            ) : (
              <Award className="size-5" aria-hidden />
            )}
          </span>

          <p className="min-w-0 flex-1 text-[15px] font-semibold leading-6 text-(--color-brand)">
            {celebration.kind === "level"
              ? strings.levelTitle.replace("{level}", celebration.reference)
              : `${strings.badgeTitle}: ${celebration.label || celebration.reference}`}
          </p>

          <Button
            variant="ghost"
            size="sm"
            disabled={pending}
            onClick={() => {
              // Optimistic: the card goes immediately, the write follows. If the
              // write fails the row stays unread and the celebration returns on
              // the next load — which is the right failure, because the reward
              // itself is not in doubt, only whether it has been seen.
              setDismissed((current) => [...current, celebration.notificationId]);
              startTransition(async () => {
                await onDismiss(celebration.notificationId, celebration.rowVersion);
              });
            }}
          >
            {strings.dismiss}
          </Button>
        </div>
      ))}
    </div>
  );
}

/**
 * Six drifting sparks. Deliberately CSS-only and `aria-hidden` — no canvas, no
 * dependency, nothing to clean up on unmount, and nothing for a screen reader
 * to read out. Rendered only when motion is allowed, so there is no still frame
 * of confetti sitting on the card.
 */
function Sparks() {
  return (
    <span aria-hidden className="pointer-events-none absolute inset-0">
      {[12, 28, 44, 60, 76, 92].map((left, index) => (
        <span
          key={left}
          className="absolute top-0 size-1.5 rounded-full bg-(--color-brand) opacity-70 animate-fade-in-down"
          style={{ left: `${left}%`, animationDelay: `${index * 90}ms` }}
        />
      ))}
    </span>
  );
}
