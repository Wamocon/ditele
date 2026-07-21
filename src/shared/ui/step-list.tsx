import type { ReactNode } from "react";
import { Check } from "lucide-react";
import { cn } from "./cn";

export type StepState = "done" | "current" | "pending";

export interface Step {
  id: string;
  label: string;
  /** One short line under the label. Optional — omit rather than pad. */
  hint?: string | undefined;
  state: StepState;
  /** Right-aligned slot: a count, a duration, a badge. */
  meta?: ReactNode;
}

export interface StepListProps {
  steps: Step[];
  className?: string;
  /** Accessible name; the list is a navigation aid, not decoration. */
  label: string;
}

/**
 * A vertical checklist with three states.
 *
 * Progress is carried by shape as well as colour — a filled disc with a tick,
 * a ring with a dot, an empty ring — so it survives greyscale, low vision and
 * the common colour deficiencies. Colour alone would fail WCAG 1.4.1.
 *
 * Rendered as an ordered list because the steps genuinely are a sequence, and
 * the current one carries `aria-current="step"` so a screen reader announces
 * position without needing the visual.
 *
 * Only feed this states you can actually derive. A step that claims "done"
 * because it is probably done is worse than one that is not listed.
 */
export function StepList({ steps, className, label }: StepListProps) {
  return (
    <ol className={cn("flex flex-col", className)} aria-label={label}>
      {steps.map((step, index) => {
        const last = index === steps.length - 1;
        return (
          <li
            key={step.id}
            className="relative flex gap-3 pb-4 last:pb-0"
            aria-current={step.state === "current" ? "step" : undefined}
          >
            {/* Connector. Stops at the last item so the line never dangles. */}
            {!last && (
              <span
                aria-hidden
                className={cn(
                  "absolute left-[13px] top-7 h-[calc(100%-1.25rem)] w-px",
                  step.state === "done" ? "bg-(--color-brand)" : "bg-(--color-border)"
                )}
              />
            )}

            <span
              aria-hidden
              className={cn(
                "relative z-1 flex size-7 shrink-0 items-center justify-center rounded-full border-2",
                "transition-colors duration-(--duration-base)",
                step.state === "done" && "border-(--color-brand) bg-(--color-brand)",
                step.state === "current" && "border-(--color-brand) bg-(--color-bg)",
                step.state === "pending" && "border-(--color-border-strong) bg-(--color-bg)"
              )}
            >
              {step.state === "done" && (
                <Check className="size-4 text-(--color-brand-fg)" strokeWidth={3} />
              )}
              {step.state === "current" && (
                <span className="size-2 rounded-full bg-(--color-brand)" />
              )}
            </span>

            <span className="flex min-w-0 flex-1 items-start justify-between gap-3">
              <span className="flex min-w-0 flex-col gap-0.5">
                <span
                  className={cn(
                    "text-[14px] font-semibold leading-5",
                    step.state === "pending" ? "text-(--color-fg-muted)" : "text-(--color-fg)"
                  )}
                >
                  {step.label}
                </span>
                {step.hint && (
                  <span className="text-[12.5px] leading-5 text-(--color-fg-muted)">
                    {step.hint}
                  </span>
                )}
              </span>
              {step.meta && <span className="shrink-0 pt-0.5">{step.meta}</span>}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/**
 * The small uppercase label that sits over a panel's content.
 *
 * Buys hierarchy without a heading-sized type step, which matters in a narrow
 * context rail where a real `h3` would compete with the page title.
 */
export function SectionLabel({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p
      className={cn(
        "text-[11px] font-semibold uppercase tracking-[0.07em] text-(--color-fg-muted)",
        className
      )}
    >
      {children}
    </p>
  );
}
