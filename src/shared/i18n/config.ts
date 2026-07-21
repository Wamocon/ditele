export const locales = ["en", "de", "ru"] as const;

export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = "de";

export function isLocale(value: string): value is Locale {
  return locales.some((locale) => locale === value);
}
