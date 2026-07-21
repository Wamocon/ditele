import deMessages from "@/shared/i18n/messages/de.json";
import { defaultLocale, isLocale, type Locale } from "@/shared/i18n/config";

/**
 * WS-6's slice of the message catalogue.
 *
 * Per 02_WORKSTREAMS §5.5 rule 1, a workstream writes **German only** — `en.json`
 * and `ru.json` get one dedicated translation pass at the end. Until that pass
 * lands, `adminOps` exists in `de.json` alone, so this resolver falls back to
 * German for the other locales. It merges screen by screen, which means a
 * partially translated file starts working the moment WS-7 fills it in — no
 * change is needed here.
 */
export type AdminDict = typeof deMessages.adminOps;
export type AdminScreen = keyof AdminDict;

const GERMAN: AdminDict = deMessages.adminOps;

const messageFiles: Record<Locale, () => Promise<{ default: unknown }>> = {
  de: () => import("@/shared/i18n/messages/de.json"),
  en: () => import("@/shared/i18n/messages/en.json"),
  ru: () => import("@/shared/i18n/messages/ru.json"),
};

export async function getAdminDict(locale: string): Promise<AdminDict> {
  const resolved: Locale = isLocale(locale) ? locale : defaultLocale;
  if (resolved === "de") return GERMAN;

  try {
    const loaded = (await messageFiles[resolved]()).default as {
      adminOps?: Partial<Record<AdminScreen, Record<string, string>>>;
    };
    const translated = loaded.adminOps;
    if (!translated) return GERMAN;

    return Object.fromEntries(
      Object.entries(GERMAN).map(([screen, german]) => [
        screen,
        { ...german, ...(translated[screen as AdminScreen] ?? {}) },
      ])
    ) as AdminDict;
  } catch {
    return GERMAN;
  }
}

/**
 * The database keeps 8 roles (MASTER_PLAN §9.2). The nav shows 3, but the user
 * list must show the real one — an admin managing accounts needs to see that
 * someone is `content_admin`, not just "Administrator".
 */
export function roleLabel(dict: AdminDict, code: string | null | undefined): string {
  if (!code) return dict.common.none;
  const labels: Record<string, string | undefined> = dict.roleLabels;
  return labels[code] ?? code;
}

/** `"{from}–{to} von {total}"` + `{from: 1, …}` → `"1–25 von 42"`. */
export function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in values ? String(values[key]) : match
  );
}
