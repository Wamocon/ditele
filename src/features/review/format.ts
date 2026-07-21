import type { Translate } from "./i18n";

/**
 * One date and duration voice for every trainer screen. No date library —
 * `Intl` is in the platform (00_MASTER_PLAN §6.1).
 */

/**
 * Dates delegate to `src/shared/format.ts` (WS-7 consistency pass). WS-4's local
 * copies already matched the house style, so no trainer screen changes; the
 * duplication does.
 */
export { formatDate, formatDateTime } from "@/shared/format";

/** "vor 3 Std." — the queue's whole job is showing how long someone has waited. */
export function formatWaiting(hours: number, t: Translate): string {
  if (hours < 1) {
    const minutes = Math.max(0, Math.round(hours * 60));
    return minutes < 1 ? t("trainer.shared.justNow") : t("trainer.shared.minutesAgo", { count: minutes });
  }
  if (hours < 48) return t("trainer.shared.hoursAgo", { count: Math.round(hours) });
  return t("trainer.shared.daysAgo", { count: Math.round(hours / 24) });
}

export function formatDuration(seconds: number, t: Translate): string {
  return t("trainer.shared.duration", { minutes: Math.max(1, Math.round(seconds / 60)) });
}

/** German needs a real singular here — "1 Einträge" reads like a bug. */
export function formatCount(total: number, t: Translate): string {
  if (total === 0) return t("trainer.shared.resultsNone");
  if (total === 1) return t("trainer.shared.resultsOne");
  return t("trainer.shared.results", { count: total });
}

/** Amber past 24 h, red past 72 h (WS-4 brief). */
export type AgeTone = "neutral" | "warning" | "danger";

export function ageTone(hours: number): AgeTone {
  if (hours > 72) return "danger";
  if (hours > 24) return "warning";
  return "neutral";
}
