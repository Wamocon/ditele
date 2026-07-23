import type { TaskKind } from "@/shared/data/review";

const LOCALES: Record<string, string> = { de: "de-DE", en: "en-GB", ru: "ru-RU" };

/** A short date + time for the given interface locale. */
export function formatDateTime(iso: string | null, locale: string): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString(LOCALES[locale] ?? "de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** German label for the two kinds of task a submission can belong to. */
export function taskKindLabel(kind: TaskKind): string {
  return kind === "arena" ? "Arena" : "Kursaufgabe";
}
