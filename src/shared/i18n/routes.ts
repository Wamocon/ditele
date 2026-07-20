import type { Route } from "next";

import type { Locale } from "@/shared/i18n/config";

export type StaticLocalizedPath =
  | ""
  | "/about"
  | "/catalog"
  | "/faq"
  | "/privacy"
  | "/legal"
  | "/auth/login"
  | "/auth/register"
  | "/auth/reset-password"
  | "/learn"
  | "/learn/notifications"
  | "/learn/profile"
  | "/learn/questions"
  | "/learn/skills"
  | "/learn/portfolio"
  | "/learn/certificates"
  | "/learn/history"
  | "/trainer"
  | "/trainer/groups"
  | "/trainer/submissions"
  | "/trainer/questions"
  | "/trainer/progress"
  | "/trainer/history"
  | "/organization"
  | "/admin"
  | "/admin/courses"
  | "/admin/tasks"
  | "/admin/groups"
  | "/admin/users"
  | "/admin/applications"
  | "/admin/settings";

export function localizedRoute(locale: Locale, path: StaticLocalizedPath): Route {
  return `/${locale}${path}` as Route;
}

export function localizedDynamicRoute(locale: Locale, path: `/${string}`): Route {
  return `/${locale}${path}` as Route;
}
