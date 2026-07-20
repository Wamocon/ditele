"use client";

import type { Route } from "next";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

function normalizedPath(value: string): string {
  if (value.length > 1 && value.endsWith("/")) return value.slice(0, -1);
  return value;
}

export function resolveActiveNavigationHref(
  pathname: string,
  hrefs: readonly string[],
): string | undefined {
  const currentPath = normalizedPath(pathname);
  return hrefs
    .map(normalizedPath)
    .filter((href) => currentPath === href || currentPath.startsWith(`${href}/`))
    .toSorted((left, right) => right.length - left.length)[0];
}

export function closeParentDisclosure(element: HTMLElement): void {
  const disclosure = element.closest("details");
  if (disclosure instanceof HTMLDetailsElement) {
    disclosure.open = false;
  }
}

export function AppShellNavLink({
  allHrefs,
  children,
  fallbackActiveHref,
  href,
}: {
  readonly allHrefs: readonly string[];
  readonly children: ReactNode;
  readonly fallbackActiveHref: string;
  readonly href: Route;
}) {
  const pathname = usePathname();
  const activeHref = pathname
    ? resolveActiveNavigationHref(pathname, allHrefs)
    : normalizedPath(fallbackActiveHref);

  return (
    <Link
      aria-current={normalizedPath(href) === activeHref ? "page" : undefined}
      href={href}
      onClick={(event) => closeParentDisclosure(event.currentTarget)}
    >
      {children}
    </Link>
  );
}
