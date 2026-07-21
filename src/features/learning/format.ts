/**
 * WS-2's date helpers now delegate to `src/shared/format.ts`.
 *
 * They used to be the odd one out: `dateStyle: "medium"` rendered
 * `21. Juli 2026` while every other workstream rendered `21.07.2026`, so a
 * learner saw two different formats moving between the course page and their
 * history. The shared module owns the decision now (WS-7 consistency pass).
 *
 * The empty-value fallback stays `""` rather than the shared default `"—"`:
 * these dates appear inline inside sentences and card meta rows, where a stray
 * em dash reads as a bug rather than as "unknown".
 *
 * ⚠️ Only call the date helpers from a Server Component, or from a Client
 * Component after mount. Server and browser can sit in different time zones, and
 * formatting the same instant in both during hydration produces a mismatch.
 */
import { formatDate as sharedDate, formatDateTime as sharedDateTime, formatTime as sharedTime } from "@/shared/format";

export function formatDate(iso: string | null, locale: string): string {
  return sharedDate(iso, locale, { fallback: "" });
}

export function formatDateTime(iso: string | null, locale: string): string {
  return sharedDateTime(iso, locale, { fallback: "" });
}

export function formatTime(iso: string | null, locale: string): string {
  return sharedTime(iso, locale, { fallback: "" });
}

/** Percent complete, clamped, safe when the total is zero. */
export function progressPercent(done: number, total: number): number {
  if (total <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((done / total) * 100)));
}
