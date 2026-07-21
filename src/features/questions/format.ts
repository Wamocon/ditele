/**
 * Date and name formatting shared by every WS-3 route.
 *
 * The date helpers delegate to `src/shared/format.ts` (WS-7 consistency pass) —
 * WS-3's local copies already matched the house style, so this changes no
 * output; it removes the fifth duplicate of the same twelve lines and makes
 * the format a single decision instead of six agreeing ones.
 */
export { intlTag as intlLocale, formatDate, formatDateTime, formatTime } from "@/shared/format";

export type DayBucket = "today" | "yesterday" | "earlier";

/** Which day group a timestamp belongs to, in the viewer's own local time. */
export function dayBucket(iso: string, now: Date = new Date()): DayBucket {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "earlier";
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const time = date.getTime();
  if (time >= startOfToday) return "today";
  if (time >= startOfToday - 86_400_000) return "yesterday";
  return "earlier";
}

/** "Lena Learner" → "LL". Used until avatar upload lands (P1). */
export function initials(name: string | null | undefined): string {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
  return (first + last).toUpperCase();
}
