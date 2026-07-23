import type { UiRole } from "@/shared/auth/role";

/**
 * Single source of truth for navigation, per the clean model (see ditele_schema.md
 * and docs/TEST_PLAN.md). `path` is locale-relative; the URL is `/${locale}${path}`.
 */
export interface NavItem {
  path: string;
  label: string;        // German label; fallback when labelKey has no translation
  labelKey?: string;    // key into the `nav.*` i18n namespace
  primary?: boolean;    // show in the primary nav / tab bar (max 4 + "Mehr")
}

export const PUBLIC_NAV: NavItem[] = [
  { path: "", label: "Start", labelKey: "home" },
  { path: "/catalog", label: "Kurse", labelKey: "courses", primary: true },
  { path: "/about", label: "Über uns", labelKey: "about", primary: true },
  { path: "/faq", label: "FAQ", labelKey: "faq", primary: true },
  { path: "/privacy", label: "Datenschutz", labelKey: "privacy" },
  { path: "/legal", label: "Impressum", labelKey: "legal" },
];

export const AUTH_NAV: NavItem[] = [
  { path: "/login", label: "Anmelden" },
  { path: "/register", label: "Registrieren" },
  { path: "/reset-password", label: "Passwort vergessen" },
  { path: "/update-password", label: "Neues Passwort" },
];

export const STUDENT_NAV: NavItem[] = [
  { path: "/learn", label: "Start", labelKey: "home", primary: true },
  { path: "/learn/courses", label: "Kurse", labelKey: "courses", primary: true },
  { path: "/learn/tasks", label: "Aufgaben", labelKey: "tasks", primary: true },
  { path: "/learn/arena", label: "Arena", labelKey: "arena", primary: true },
  { path: "/learn/profile", label: "Profil", labelKey: "profile" },
];

export const TRAINER_NAV: NavItem[] = [
  { path: "/trainer", label: "Übersicht", labelKey: "overview", primary: true },
  { path: "/trainer/submissions", label: "Reviews", labelKey: "submissions", primary: true },
  { path: "/trainer/progress", label: "Fortschritt", labelKey: "learnerProgress", primary: true },
  { path: "/trainer/profile", label: "Profil", labelKey: "profile" },
];

export const ADMIN_NAV: NavItem[] = [
  { path: "/admin", label: "Übersicht", labelKey: "overview", primary: true },
  { path: "/admin/courses", label: "Kurse", labelKey: "courses", primary: true },
  { path: "/admin/arena", label: "Arena", labelKey: "arenaAdmin", primary: true },
  { path: "/admin/badges", label: "Badges", labelKey: "badges" },
  { path: "/admin/users", label: "Benutzer", labelKey: "users" },
  { path: "/admin/feedback", label: "Feedback", labelKey: "feedbackAdmin" },
  { path: "/admin/progress", label: "Fortschritt", labelKey: "learnerProgress" },
  { path: "/admin/profile", label: "Profil", labelKey: "profile" },
];

export function navForRole(role: UiRole): NavItem[] {
  switch (role) {
    case "admin":
      return ADMIN_NAV;
    case "trainer":
      return TRAINER_NAV;
    default:
      return STUDENT_NAV;
  }
}

/** Max 5 tabs; the 5th is always "Mehr", added by the tab bar itself. */
export function primaryNav(role: UiRole): NavItem[] {
  return navForRole(role).filter((i) => i.primary).slice(0, 4);
}

/** Everything not in the tab bar — the contents of the "Mehr" sheet. */
export function secondaryNav(role: UiRole): NavItem[] {
  const primary = new Set(primaryNav(role).map((i) => i.path));
  return navForRole(role).filter((i) => !primary.has(i.path));
}
