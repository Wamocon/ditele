import { Check, X } from "lucide-react";
import { cn } from "@/shared/ui";
import type { AdminStrings } from "../i18n";
import type { ReadinessCheck } from "../model";

/**
 * The database runs exactly these rules inside every lifecycle RPC and raises a
 * bare `23514` when one fails. Showing them turns "die Aktion konnte nicht
 * ausgeführt werden" into "die russische Beschreibung von Stufe 2 fehlt".
 */
export function ReadinessList({
  checks,
  strings,
  className,
}: {
  checks: ReadinessCheck[];
  strings: AdminStrings;
  className?: string;
}) {
  return (
    <ul className={cn("flex flex-col gap-1.5", className)}>
      {checks.map((check) => (
        <li key={check.key} className="flex items-start gap-2 text-[13px] leading-5">
          {check.ok ? (
            <Check className="mt-0.5 size-4 shrink-0 text-[--color-success]" aria-hidden />
          ) : (
            <X className="mt-0.5 size-4 shrink-0 text-[--color-danger]" aria-hidden />
          )}
          <span className={check.ok ? "text-[--color-fg-muted]" : "text-[--color-fg]"}>
            <span className="sr-only">{check.ok ? "Erfüllt: " : "Offen: "}</span>
            {strings.lifecycle[check.key]}
            {!check.ok && check.detail && (
              <span className="text-[--color-fg-muted]"> — {check.detail}</span>
            )}
          </span>
        </li>
      ))}
    </ul>
  );
}
