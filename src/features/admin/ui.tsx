import type { Route } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { Card, CardTitle, cn } from "@/shared/ui";

/** Server-rendered layout pieces shared by every WS-6 screen. Plain on purpose. */

export function Section({
  title,
  description,
  actions,
  children,
  className,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Card as="section" className={cn("flex flex-col gap-4", className)}>
      <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
        <div className="flex flex-col gap-1">
          <CardTitle>{title}</CardTitle>
          {description && (
            <p className="text-[13px] leading-5 text-(--color-fg-muted)">{description}</p>
          )}
        </div>
        {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </div>
      {children}
    </Card>
  );
}

/** Label/value rows. Stacks at 375px, two columns from sm. */
export function DefinitionList({
  items,
}: {
  items: { label: string; value: ReactNode }[];
}) {
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
      {items.map((item) => (
        <div key={item.label} className="flex flex-col gap-0.5">
          <dt className="text-[13px] font-semibold leading-4 text-(--color-fg-muted)">
            {item.label}
          </dt>
          <dd className="text-[15px] leading-6">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * The `Pagination` fallback — WS-0's tier-2 component had not landed.
 * Link-based, so it works without JavaScript and keeps the state in the URL
 * (MASTER_PLAN §13.4). Renders nothing when everything fits on one page.
 */
export function Pagination({
  basePath,
  params,
  total,
  limit,
  offset,
  labels,
}: {
  basePath: string;
  /** Current filters, carried across page changes. `offset` is overwritten. */
  params: Record<string, string | undefined>;
  total: number;
  limit: number;
  offset: number;
  labels: { showing: string; previous: string; next: string };
}) {
  if (total <= limit) return null;

  const href = (nextOffset: number): Route => {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== "") search.set(key, value);
    }
    if (nextOffset > 0) search.set("offset", String(nextOffset));
    else search.delete("offset");
    const query = search.toString();
    return (query ? `${basePath}?${query}` : basePath) as Route;
  };

  const hasPrevious = offset > 0;
  const hasNext = offset + limit < total;
  const linkClass =
    "inline-flex h-11 min-h-11 items-center rounded-(--radius-md) border border-(--color-border-strong) px-4 text-[13px] font-semibold hover:bg-(--color-surface)";

  return (
    <nav
      aria-label="Seitennavigation"
      className="flex flex-wrap items-center justify-between gap-3 pt-2"
    >
      <p className="tabular text-[13px] text-(--color-fg-muted)">{labels.showing}</p>
      <div className="flex items-center gap-2">
        {hasPrevious ? (
          <Link href={href(Math.max(0, offset - limit))} className={linkClass}>
            {labels.previous}
          </Link>
        ) : (
          <span className={cn(linkClass, "opacity-40")} aria-disabled>
            {labels.previous}
          </span>
        )}
        {hasNext ? (
          <Link href={href(offset + limit)} className={linkClass}>
            {labels.next}
          </Link>
        ) : (
          <span className={cn(linkClass, "opacity-40")} aria-disabled>
            {labels.next}
          </span>
        )}
      </div>
    </nav>
  );
}

/**
 * The `SearchInput` fallback: a plain GET form. No debounce and no client
 * JavaScript — the filter lives in the URL, which is what §13.4 asks for and
 * what makes a filtered list shareable and back-button-correct.
 */
export function FilterForm({
  action,
  children,
  submitLabel,
  resetHref,
  resetLabel,
}: {
  action: string;
  children: ReactNode;
  submitLabel: string;
  resetHref: Route;
  resetLabel: string;
}) {
  return (
    <form
      method="get"
      action={action}
      className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end"
    >
      {children}
      <div className="flex items-center gap-2">
        <button
          type="submit"
          className="inline-flex h-11 min-h-11 items-center rounded-(--radius-md) bg-(--color-brand) px-4 text-[15px] font-semibold text-(--color-brand-fg) hover:bg-(--color-brand-hover)"
        >
          {submitLabel}
        </button>
        <Link
          href={resetHref}
          className="inline-flex h-11 min-h-11 items-center rounded-(--radius-md) px-3 text-[13px] font-semibold text-(--color-fg-muted) hover:bg-(--color-surface)"
        >
          {resetLabel}
        </Link>
      </div>
    </form>
  );
}

/** A labelled control inside FilterForm — Field is a client component. */
export function FilterField({
  label,
  htmlFor,
  children,
  className,
}: {
  label: string;
  htmlFor: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex min-w-[12rem] flex-col gap-1.5", className)}>
      <label htmlFor={htmlFor} className="text-[13px] font-semibold leading-4">
        {label}
      </label>
      {children}
    </div>
  );
}

/**
 * A capability the database cannot do yet (I-011, I-012). Shown instead of a
 * form that would fail on submit — a visible, explained blocker beats a
 * mysterious error, and WS-7's stub sweep can find it.
 */
export function BlockedNotice({
  title,
  body,
  ticket,
  workaround,
  action,
}: {
  title: string;
  body: string;
  ticket?: string;
  workaround?: string;
  action?: ReactNode;
}) {
  return (
    <Card className="flex flex-col items-start gap-3 border-(--color-warning) bg-(--color-warning-soft)">
      <p className="text-[18px] font-semibold leading-6 text-(--color-warning)">{title}</p>
      <p className="max-w-prose text-[15px] leading-6">{body}</p>
      {workaround && (
        <p className="max-w-prose text-[13px] leading-5 text-(--color-fg-muted)">{workaround}</p>
      )}
      {ticket && <p className="text-[13px] leading-5 text-(--color-fg-muted)">{ticket}</p>}
      {action}
    </Card>
  );
}
