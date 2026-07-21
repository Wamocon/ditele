import type { HTMLAttributes, ReactNode } from "react";
import { uiStrings } from "@/shared/i18n/ui-strings";
import { cn } from "./cn";
import { Button } from "./button";

/* ── Skeleton ─────────────────────────────────────────────────────────── */

export function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("animate-shimmer rounded-(--radius-md)", className)}
      aria-hidden
      {...props}
    />
  );
}

export function SkeletonText({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} className={cn("h-4", i === lines - 1 ? "w-2/3" : "w-full")} />
      ))}
    </div>
  );
}

export function SkeletonCard({ className }: { className?: string }) {
  return (
    <div className={cn("rounded-(--radius-lg) border border-(--color-border) p-4 lg:p-5", className)}>
      <Skeleton className="mb-3 h-5 w-1/2" />
      <SkeletonText lines={2} />
    </div>
  );
}

/* ── The red/navy/red dot mark — the brand signature ──────────────────── */

export function DotMark({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1", className)} aria-hidden>
      <span className="size-2 rounded-full bg-(--color-brand)" />
      <span className="size-2 rounded-full bg-(--color-ink)" />
      <span className="size-2 rounded-full bg-(--color-brand)" />
    </span>
  );
}

/* ── EmptyState ───────────────────────────────────────────────────────── */

export interface EmptyStateProps {
  title: string;
  description?: string;
  icon?: ReactNode;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({ title, description, icon, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-(--radius-lg)",
        "border border-dashed border-(--color-border-strong) px-6 py-12 text-center",
        className
      )}
    >
      {icon ?? <DotMark className="mb-1 scale-125" />}
      <p className="text-[18px] font-semibold leading-6">{title}</p>
      {description && (
        <p className="max-w-prose text-[13px] leading-5 text-(--color-fg-muted)">{description}</p>
      )}
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}

/* ── ErrorState ───────────────────────────────────────────────────────── */

export interface ErrorStateProps {
  title?: string;
  message?: string;
  /** Omit to render without a retry button (e.g. a 403). */
  onRetry?: () => void;
  className?: string;
  /**
   * Active locale. Supplies the title, the message and the retry label from
   * `errors.*` / `common.*` when the caller does not pass them explicitly.
   *
   * Optional so the ~50 call sites outside the learner tree keep their current
   * German output until they are localised in turn; without it this component
   * rendered "Etwas ist schiefgelaufen" and "Erneut versuchen" on /en and /ru.
   */
  locale?: string;
}

export function ErrorState({
  title,
  message,
  onRetry,
  className,
  locale,
}: ErrorStateProps) {
  const s = uiStrings(locale);
  const resolvedTitle = title ?? s.errors.title;
  const resolvedMessage = message ?? s.errors.description;

  return (
    <div
      role="alert"
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-(--radius-lg)",
        "border border-(--color-danger) bg-(--color-danger-soft) px-6 py-10 text-center",
        className
      )}
    >
      <p className="text-[18px] font-semibold leading-6 text-(--color-danger)">{resolvedTitle}</p>
      <p className="max-w-prose text-[13px] leading-5 text-(--color-fg-muted)">{resolvedMessage}</p>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry} className="mt-1">
          {s.common.retry}
        </Button>
      )}
    </div>
  );
}
