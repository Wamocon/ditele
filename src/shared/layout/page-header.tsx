import type { Route } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { cn } from "@/shared/ui";
import { uiStrings } from "@/shared/i18n/ui-strings";

export interface Breadcrumb {
  label: string;
  href?: string;
}

export interface PageHeaderProps {
  title: string;
  description?: string;
  breadcrumbs?: Breadcrumb[];
  actions?: ReactNode;
  className?: string;
  /**
   * Accessible name for the breadcrumb landmark. Usually left unset — pass
   * `locale` instead and it resolves from `common.breadcrumbNav`.
   */
  breadcrumbNavLabel?: string;
  /**
   * Active locale, used to name the breadcrumb landmark.
   *
   * Every breadcrumbed page passed neither this nor `breadcrumbNavLabel`, so
   * the landmark fell back to the hardcoded "Brotkrümelnavigation" and a screen
   * reader announced German on /en and /ru. Optional so the pages outside the
   * learner tree keep their current output until they are localised in turn.
   */
  locale?: string;
}

export function PageHeader({
  title,
  description,
  breadcrumbs,
  actions,
  className,
  breadcrumbNavLabel,
  locale,
}: PageHeaderProps) {
  const navLabel = breadcrumbNavLabel ?? uiStrings(locale).common.breadcrumbNav;
  return (
    <div className={cn("mb-6 flex flex-col gap-3 lg:mb-8", className)}>
      {breadcrumbs && breadcrumbs.length > 0 && (
        <nav aria-label={navLabel}>
          <ol className="flex flex-wrap items-center gap-1.5 text-[13px] text-(--color-fg-muted)">
            {breadcrumbs.map((c, i) => (
              <li key={`${c.label}-${i}`} className="flex items-center gap-1.5">
                {i > 0 && <span aria-hidden>/</span>}
                {c.href ? (
                  <Link href={c.href as Route} className="hover:text-(--color-brand) hover:underline">
                    {c.label}
                  </Link>
                ) : (
                  <span aria-current="page">{c.label}</span>
                )}
              </li>
            ))}
          </ol>
        </nav>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="text-[26px] font-semibold leading-8 lg:text-[30px] lg:leading-9">
            {title}
          </h1>
          {description && (
            <p className="max-w-prose text-[15px] leading-6 text-(--color-fg-muted)">
              {description}
            </p>
          )}
        </div>
        {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}
