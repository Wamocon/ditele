import type { Translate } from "./i18n";

/**
 * One date and duration voice for every trainer screen. No date library —
 * `Intl` is in the platform (00_MASTER_PLAN §6.1).
 */

const LOCALE_TAGS: Record<string, string> = { de: "de-DE", en: "en-GB", ru: "ru-RU" };

function tag(locale: string): string {
  return LOCALE_TAGS[locale] ?? "de-DE";
}

export function formatDateTime(iso: string, locale: string): string {
  return new Intl.DateTimeFormat(tag(locale), {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

export function formatDate(iso: string | null, locale: string): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat(tag(locale), {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(iso));
}

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

/** Amber past 24 h, red past 72 h (WS-4 brief). */
export type AgeTone = "neutral" | "warning" | "danger";

export function ageTone(hours: number): AgeTone {
  if (hours > 72) return "danger";
  if (hours > 24) return "warning";
  return "neutral";
}
