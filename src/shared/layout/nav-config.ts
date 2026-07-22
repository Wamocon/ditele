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
  /**
   * German label. Used as-is for `de`, and as the fallback whenever `labelKey`
   * has no translation in the active locale.
   */
  label: string;
  /**
   * Key into the `nav.*` namespace. Without this the label stays German in
   * every locale, which is exactly the bug this closes: the nav read
   * "Start Kurse Aufgaben Fragen" on /en because these strings never went
   * through i18n at all.
   */
  labelKey?: string;
  /** Show in the primary nav / tab bar. Max 5 per role, the 5th being "Mehr". */
  primary?: boolean;
  /** Owning workstream — so an unfinished route is traceable. */
  owner: string;
}

/** Routes reachable without a session. */
export const PUBLIC_NAV: NavItem[] = [
  { path: "", label: "Start", labelKey: "home", owner: "WS-1" },
  { path: "/catalog", label: "Kurse", labelKey: "courses", primary: true, owner: "WS-1" },
  { path: "/about", label: "Über uns", labelKey: "about", primary: true, owner: "WS-1" },
  { path: "/faq", label: "FAQ", labelKey: "faq", primary: true, owner: "WS-1" },
  { path: "/privacy", label: "Datenschutz", labelKey: "privacy", owner: "WS-1" },
  { path: "/legal", label: "Impressum", labelKey: "legal", owner: "WS-1" },
];

export const AUTH_NAV: NavItem[] = [
  { path: "/login", label: "Anmelden", owner: "WS-1" },
  { path: "/register", label: "Registrieren", owner: "WS-1" },
  { path: "/reset-password", label: "Passwort vergessen", owner: "WS-1" },
  { path: "/update-password", label: "Neues Passwort", owner: "WS-1" },
];

export const STUDENT_NAV: NavItem[] = [
  { path: "/learn", label: "Start", labelKey: "home", primary: true, owner: "WS-2" },
  { path: "/learn/courses", label: "Kurse", labelKey: "courses", primary: true, owner: "WS-2" },
  { path: "/learn/tasks", label: "Aufgaben", labelKey: "tasks", primary: true, owner: "WS-2" },
  /**
   * ⭐ The Bug Arena hub.
   *
   * Added under the narrow, written exception to this file's "Only WS-0 edits
   * it" rule, granted to WS-8 for the Arena entry and the `primary` flags and
   * nothing else — `06_ARENA_WORKSTREAMS.md` §7, recorded in `ISSUES.md` I-038.
   * No other Arena workstream touches this file; a later nav change goes
   * through `ISSUES.md` to WS-13.
   *
   * "Fragen" gives up its primary slot rather than Start/Kurse/Aufgaben,
   * because the mobile tab bar caps at 5 including "Mehr". It keeps its place
   * in the sheet, so nothing became unreachable.
   *
   * The route itself is WS-11's (`learn/arena/**`). It did not exist when this
   * entry landed, and because Next prefetches every nav link in the viewport,
   * every student page took a 404 on every load until it did (ISSUES.md I-043).
   * WS-11 shipped it in `6844509`; verified live by WS-13.
   */
  { path: "/learn/arena", label: "Arena", labelKey: "arena", primary: true, owner: "WS-11" },
  /**
   * ⭐ The course catalogue, for a signed-in learner.
   *
   * `/catalog` was in `PUBLIC_NAV` only, so a student had no link to it
   * anywhere — and that is not merely a missing shortcut. `/learn/courses`
   * shows the courses a learner is ALREADY enrolled in, and the enrolment
   * request lives at `/learn/enroll/[courseId]`, which is reached from a
   * catalogue card. With no catalogue entry, a signed-in learner could not
   * discover or request a single course they were not already in; the only way
   * through was typing the URL.
   *
   * Non-primary on purpose. The mobile tab bar caps at 5 including "Mehr", the
   * four primary slots are the daily loop (Start · Kurse · Aufgaben · Arena),
   * and browsing the catalogue is something a learner does occasionally rather
   * than every day. It sits first in the sheet, directly under "Kurse", because
   * "my courses" and "all courses" are the pair a learner is choosing between.
   */
  { path: "/catalog", label: "Katalog", labelKey: "catalog", owner: "WS-1" },
  { path: "/learn/questions", label: "Fragen", labelKey: "questions", owner: "WS-3" },
  { path: "/learn/history", label: "Verlauf", labelKey: "learningHistory", owner: "WS-3" },
  { path: "/learn/certificates", label: "Zertifikate", labelKey: "certificates", owner: "WS-3" },
  { path: "/learn/notifications", label: "Benachrichtigungen", labelKey: "notifications", owner: "WS-3" },
  { path: "/learn/profile", label: "Profil", labelKey: "profile", owner: "WS-3" },
];

export const TRAINER_NAV: NavItem[] = [
  { path: "/trainer", label: "Übersicht", labelKey: "overview", primary: true, owner: "WS-4" },
  { path: "/trainer/submissions", label: "Reviews", labelKey: "submissions", primary: true, owner: "WS-4" },
  { path: "/trainer/questions", label: "Fragen", labelKey: "questions", primary: true, owner: "WS-4" },
  { path: "/trainer/progress", label: "Fortschritt", labelKey: "learnerProgress", owner: "WS-4" },
  { path: "/trainer/history", label: "Verlauf", labelKey: "learningHistory", owner: "WS-4" },
  { path: "/trainer/questions/archive", label: "Frage-Archiv", labelKey: "reviewHistory", owner: "WS-4" },
  { path: "/trainer/profile", label: "Profil", labelKey: "profile", owner: "WS-4" },
];

export const ADMIN_NAV: NavItem[] = [
  { path: "/admin", label: "Übersicht", labelKey: "overview", primary: true, owner: "WS-5" },
  { path: "/admin/courses", label: "Kurse", labelKey: "courses", primary: true, owner: "WS-5" },
  { path: "/admin/users", label: "Benutzer", labelKey: "users", primary: true, owner: "WS-6" },
  { path: "/admin/tasks", label: "Aufgaben", labelKey: "tasks", owner: "WS-5" },
  /**
   * The learner progress board. Added by WS-13 under `ISSUES.md` I-056 — WS-12
   * built the route but §7 grants the nav exception to WS-8 only, so it shipped
   * reachable by URL and by URL alone.
   *
   * Two things closed with this one line: an administrator can find the board,
   * and `scripts/smoke.mjs` — which enumerates its route list from this file —
   * starts covering it. It was outside the 42/42 run until now.
   */
  { path: "/admin/progress", label: "Fortschritt", labelKey: "learnerProgress", owner: "WS-12" },
  { path: "/admin/applications", label: "Kursanfragen", labelKey: "applications", owner: "WS-6" },
  { path: "/admin/issues", label: "Fehlermeldungen", labelKey: "reports", owner: "WS-6" },
  { path: "/admin/settings", label: "Einstellungen", labelKey: "settings", owner: "WS-6" },
  { path: "/admin/profile", label: "Profil", labelKey: "profile", owner: "WS-6" },
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
