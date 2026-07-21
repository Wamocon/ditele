import { cn } from "@/shared/ui";

/**
 * The "your decision was saved" banner. `Toast` is Wave 0b, and a redirect-plus-
 * banner survives a full page load, which a toast does not — the trainer lands
 * back on the queue and can see that the last one actually went through.
 */
export function Notice({
  message,
  tone = "success",
  className,
}: {
  message: string;
  tone?: "success" | "info";
  className?: string;
}) {
  return (
    <p
      role="status"
      className={cn(
        "mb-6 flex items-center gap-2 rounded-[--radius-md] px-4 py-3 text-[15px] leading-6",
        tone === "success"
          ? "bg-[--color-success-soft] text-[--color-success]"
          : "bg-[--color-info-soft] text-[--color-info]",
        className
      )}
    >
      <span className="size-2 shrink-0 rounded-full bg-current" aria-hidden />
      {message}
    </p>
  );
}
