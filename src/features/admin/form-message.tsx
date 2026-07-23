"use client";

import { cn } from "@/shared/ui";

/**
 * Inline success / error banner shared by the admin forms. Kept tiny and
 * dependency-free so every editor renders the same feedback in the same place.
 */
export function FormMessage({ tone, children }: { tone: "success" | "error"; children: string }) {
  return (
    <p
      role={tone === "error" ? "alert" : "status"}
      className={cn(
        "rounded-(--radius-md) border px-3 py-2 text-[13px] leading-5",
        tone === "error"
          ? "border-(--color-danger) bg-(--color-danger-soft) text-(--color-danger)"
          : "border-(--color-success) bg-(--color-success-soft) text-(--color-success)"
      )}
    >
      {children}
    </p>
  );
}
