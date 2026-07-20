import "server-only";

import type enMessages from "./messages/en.json";
import { defaultLocale, type Locale } from "./config";

export type Messages = typeof enMessages;

const loaders: Record<Locale, () => Promise<{ default: Messages }>> = {
  en: () => import("./messages/en.json"),
  de: () => import("./messages/de.json"),
  ru: () => import("./messages/ru.json")
};

export async function getMessages(locale: Locale): Promise<Messages> {
  try {
    const loadedMessages = await loaders[locale]();
    return loadedMessages.default;
  } catch {
    const fallback = await loaders[defaultLocale]();
    return fallback.default;
  }
}
