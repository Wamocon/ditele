import { Bell, BookOpen, ClipboardCheck, FileQuestion, FolderKanban, GraduationCap, History, Home, LayoutDashboard, Medal, Settings, ShieldCheck, UserRound, Users } from "lucide-react";
import type { Route } from "next";
import type { ReactNode } from "react";

import type { Locale } from "@/shared/i18n/config";
import type { Messages } from "@/shared/i18n/get-messages";
import { localizedRoute } from "@/shared/i18n/routes";
import { BrandLink } from "@/shared/ui/brand-link";
import { AppShellNavLink } from "@/shared/ui/app-shell-nav-link";
import { LocaleSwitcher } from "@/shared/ui/locale-switcher";
import { ThemeToggle } from "@/shared/ui/theme-toggle";

export type ShellRole = "student" | "trainer" | "admin" | "contentAdmin" | "organizationAdmin";

type NavItem = {
  href: Route;
  icon: typeof Home;
  label: string;
};

function getNavigation(role: ShellRole, locale: Locale, messages: Messages): NavItem[] {
  if (role === "student") {
    return [
      { href: localizedRoute(locale, "/learn"), icon: Home, label: messages.nav.home },
      { href: localizedRoute(locale, "/learn/notifications"), icon: Bell, label: messages.nav.notifications },
      { href: localizedRoute(locale, "/learn/questions"), icon: FileQuestion, label: messages.nav.questions },
      { href: localizedRoute(locale, "/learn/skills"), icon: GraduationCap, label: messages.nav.skills },
      { href: localizedRoute(locale, "/learn/portfolio"), icon: FolderKanban, label: messages.nav.portfolio },
      { href: localizedRoute(locale, "/learn/certificates"), icon: Medal, label: messages.nav.certificates },
      { href: localizedRoute(locale, "/learn/history"), icon: History, label: messages.nav.learningHistory },
      { href: localizedRoute(locale, "/learn/profile"), icon: UserRound, label: messages.nav.profile }
    ];
  }
  if (role === "trainer") {
    return [
      { href: localizedRoute(locale, "/trainer"), icon: LayoutDashboard, label: messages.nav.workQueue },
      { href: localizedRoute(locale, "/trainer/groups"), icon: Users, label: messages.nav.groups },
      { href: localizedRoute(locale, "/trainer/submissions"), icon: ClipboardCheck, label: messages.nav.submissions },
      { href: localizedRoute(locale, "/trainer/questions"), icon: FileQuestion, label: messages.nav.questions },
      { href: localizedRoute(locale, "/trainer/progress"), icon: GraduationCap, label: messages.nav.learnerProgress },
      { href: localizedRoute(locale, "/trainer/history"), icon: History, label: messages.nav.reviewHistory }
    ];
  }
  if (role === "organizationAdmin") {
    return [
      { href: localizedRoute(locale, "/organization"), icon: LayoutDashboard, label: messages.nav.overview },
    ];
  }
  if (role === "contentAdmin") {
    return [
      { href: localizedRoute(locale, "/admin/courses"), icon: BookOpen, label: messages.nav.courses },
      { href: localizedRoute(locale, "/admin/tasks"), icon: ClipboardCheck, label: messages.nav.tasks },
    ];
  }
  return [
    { href: localizedRoute(locale, "/admin"), icon: LayoutDashboard, label: messages.nav.overview },
    { href: localizedRoute(locale, "/admin/courses"), icon: BookOpen, label: messages.nav.courses },
    { href: localizedRoute(locale, "/admin/tasks"), icon: ClipboardCheck, label: messages.nav.tasks },
    { href: localizedRoute(locale, "/admin/groups"), icon: Users, label: messages.nav.groups },
    { href: localizedRoute(locale, "/admin/users"), icon: ShieldCheck, label: messages.nav.users },
    { href: localizedRoute(locale, "/admin/applications"), icon: FileQuestion, label: messages.nav.applications },
    { href: localizedRoute(locale, "/admin/settings"), icon: Settings, label: messages.nav.settings }
  ];
}

type AppShellProps = {
  activeHref: string;
  breadcrumbs: string;
  children: ReactNode;
  impersonating?: boolean;
  locale: Locale;
  messages: Messages;
  role: ShellRole;
  signOutAction?: ((formData: FormData) => Promise<void>) | undefined;
  userName: string;
};

export function AppShell({ activeHref, breadcrumbs, children, impersonating = false, locale, messages, role, signOutAction, userName }: AppShellProps) {
  const navigation = getNavigation(role, locale, messages);
  const navigationHrefs = navigation.map((item) => item.href);
  const initials = userName.split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase();

  return (
    <div className="app-shell">
      <aside className="app-shell__sidebar" aria-label={`${messages.roles[role]} navigation`}>
        <div className="app-shell__brand"><BrandLink locale={locale} /></div>
        <nav className="app-shell__nav">
          {navigation.map(({ href, icon: Icon, label }) => (
            <AppShellNavLink
              allHrefs={navigationHrefs}
              fallbackActiveHref={activeHref}
              href={href}
              key={`${href}-${label}`}
            >
              <Icon aria-hidden="true" />
              <span>{label}</span>
            </AppShellNavLink>
          ))}
        </nav>
        <p className="app-shell__role">{messages.roles[role]}</p>
      </aside>

      <header className="app-shell__header">
        <details className="mobile-nav">
          <summary aria-label={messages.common.openMenu}>
            <span aria-hidden="true">☰</span>
            <span
              aria-label={`${userName}, ${messages.roles[role]}`}
              className="mobile-nav__identity"
              role="group"
            >
              {messages.roles[role]}
            </span>
          </summary>
          <nav className="mobile-nav__panel" aria-label={`${messages.roles[role]} mobile navigation`}>
            {navigation.map(({ href, label }) => (
              <AppShellNavLink
                allHrefs={navigationHrefs}
                fallbackActiveHref={activeHref}
                href={href}
                key={`${href}-${label}`}
              >
                {label}
              </AppShellNavLink>
            ))}
            <div className="mobile-nav__controls">
              <span>{userName}</span>
              <ThemeToggle label={messages.common.theme} />
            </div>
          </nav>
        </details>
        <div className="app-shell__crumbs">{breadcrumbs}</div>
        <div className="app-shell__tools">
          <LocaleSwitcher locale={locale} />
          <ThemeToggle label={messages.common.theme} />
          <div className="app-shell__profile">
            <span className="avatar" aria-hidden="true">{initials}</span>
            <span>{userName}</span>
          </div>
          {signOutAction ? (
            <form action={signOutAction}>
              <input name="locale" type="hidden" value={locale} />
              <button className="button button--secondary app-shell__signout" type="submit">
                {messages.common.signOut}
              </button>
            </form>
          ) : null}
        </div>
      </header>

      <main className="app-shell__main" id="main-content">
        {impersonating ? (
          <aside className="impersonation-banner" role="status">
            <span>{messages.admin.impersonation}</span>
            <button className="button button--secondary" type="button">{messages.admin.endRoleView}</button>
          </aside>
        ) : null}
        <div className="app-shell__content">{children}</div>
      </main>
    </div>
  );
}
