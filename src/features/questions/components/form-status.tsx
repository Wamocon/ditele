import { cn } from "@/shared/ui";

/**
 * Inline success / error feedback for a form.
 *
 * WS-0's `Toast` is a Wave 0b component and had not landed when WS-3 was built
 * (plan/status/WS-0.md), so the documented fallback is used: an `aria-live`
 * region next to the form. WS-7 can promote these to toasts in the consistency
 * pass without touching any of the logic.
 */
export function FormStatus({
  tone,
  message,
  className,
}: {
  tone: "success" | "error";
  message: string | null | undefined;
  className?: string;
}) {
  if (!message) return null;
  return (
    <p
      role={tone === "error" ? "alert" : "status"}
      aria-live="polite"
      className={cn(
        "rounded-[--radius-md] px-3 py-2 text-[13px] leading-5",
        tone === "error"
          ? "bg-[--color-danger-soft] text-[--color-danger]"
          : "bg-[--color-success-soft] text-[--color-success]",
        className
      )}
    >
      {message}
    </p>
  );
}
