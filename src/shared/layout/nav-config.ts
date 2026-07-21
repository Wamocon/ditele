import type { UiRole } from "@/shared/auth/role";

/**
 * ⭐ SINGLE SOURCE OF TRUTH for navigation and for the 42-route map.
 *
 * Desktop nav, mobile tab bar, the "Mehr" sheet and scripts/smoke.mjs all read
 * from this file. **Only WS-0 edits it.** If you need a nav entry, append a row
 * to plan/status/ISSUES.md — do not add it yourself.
 *
 * `path` is the locale-relative path. The real URL is `/${locale}${path}`.
 */
export interface NavItem {
  path: string;
  label: string;
  /** Show in the primary nav / tab bar. Max 5 per role, the 5th being "Mehr". */
  primary?: boolean;
  /** Owning workstream — so an unfinished route is traceable. */
  owner: string;
}

/** Routes reachable without a session. */
export const PUBLIC_NAV: NavItem[] = [
  { path: "", label: "Start", owner: "WS-1" },
  { path: "/catalog", label: "Kurse", primary: true, owner: "WS-1" },
  { path: "/about", label: "Über uns", primary: true, owner: "WS-1" },
  { path: "/faq", label: "FAQ", primary: true, owner: "WS-1" },
  { path: "/privacy", label: "Datenschutz", owner: "WS-1" },
  { path: "/legal", label: "Impressum", owner: "WS-1" },
];

export const AUTH_NAV: NavItem[] = [
  { path: "/login", label: "Anmelden", owner: "WS-1" },
  { path: "/register", label: "Registrieren", owner: "WS-1" },
  { path: "/reset-password", label: "Passwort vergessen", owner: "WS-1" },
  { path: "/update-password", label: "Neues Passwort", owner: "WS-1" },
];

export const STUDENT_NAV: NavItem[] = [
  { path: "/learn", label: "Start", primary: true, owner: "WS-2" },
  { path: "/learn/courses", label: "Kurse", primary: true, owner: "WS-2" },
  { path: "/learn/tasks", label: "Aufgaben", primary: true, owner: "WS-2" },
  { path: "/learn/questions", label: "Fragen", primary: true, owner: "WS-3" },
  { path: "/learn/history", label: "Verlauf", owner: "WS-3" },
  { path: "/learn/certificates", label: "Zertifikate", owner: "WS-3" },
  { path: "/learn/notifications", label: "Benachrichtigungen", owner: "WS-3" },
  { path: "/learn/profile", label: "Profil", owner: "WS-3" },
];

export const TRAINER_NAV: NavItem[] = [
  { path: "/trainer", label: "Übersicht", primary: true, owner: "WS-4" },
  { path: "/trainer/submissions", label: "Reviews", primary: true, owner: "WS-4" },
  { path: "/trainer/questions", label: "Fragen", primary: true, owner: "WS-4" },
  { path: "/trainer/progress", label: "Fortschritt", owner: "WS-4" },
  { path: "/trainer/history", label: "Verlauf", owner: "WS-4" },
  { path: "/trainer/questions/archive", label: "Frage-Archiv", owner: "WS-4" },
  { path: "/trainer/profile", label: "Profil", owner: "WS-4" },
];

export const ADMIN_NAV: NavItem[] = [
  { path: "/admin", label: "Übersicht", primary: true, owner: "WS-5" },
  { path: "/admin/courses", label: "Kurse", primary: true, owner: "WS-5" },
  { path: "/admin/users", label: "Benutzer", primary: true, owner: "WS-6" },
  { path: "/admin/tasks", label: "Aufgaben", owner: "WS-5" },
  { path: "/admin/applications", label: "Kursanfragen", owner: "WS-6" },
  { path: "/admin/issues", label: "Fehlermeldungen", owner: "WS-6" },
  { path: "/admin/ratings", label: "Bewertungen", owner: "WS-6" },
  { path: "/admin/settings", label: "Einstellungen", owner: "WS-6" },
  { path: "/admin/profile", label: "Profil", owner: "WS-6" },
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

/**
 * Every dynamic route, with a concrete sample id so smoke.mjs can request it.
 * Ids come from the seeded data recorded in plan/status/RPC_CONTRACTS.md §11.
 */
export const DYNAMIC_ROUTES: { path: string; owner: string }[] = [
  { path: "/catalog/practical-software-testing", owner: "WS-1" },
  { path: "/learn/courses/01980a20-0000-7000-8000-000000000001", owner: "WS-2" },
  { path: "/learn/tasks/01980a26-0000-7000-8000-000000000001", owner: "WS-2" },
  { path: "/learn/enroll/01980a20-0000-7000-8000-000000000001", owner: "WS-3" },
  { path: "/learn/questions/new", owner: "WS-3" },
  { path: "/admin/courses/new", owner: "WS-5" },
  { path: "/admin/courses/01980a20-0000-7000-8000-000000000001", owner: "WS-5" },
  { path: "/admin/users/new", owner: "WS-6" },
];
