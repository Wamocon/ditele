"use client";

import type { InputHTMLAttributes } from "react";
import { cn } from "@/shared/ui";

/**
 * A labelled checkbox.
 *
 * `Checkbox` is listed in MASTER_PLAN §8.1 but is not exported from
 * `shared/ui` yet (Wave 0b). The documented rule is to use a native fallback
 * rather than wait, so this is a plain `<input type="checkbox">` with the
 * design tokens applied. WS-7 can swap it for WS-0's version.
 */
export function Checkbox({
  label,
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <label
      className={cn(
        "flex min-h-11 cursor-pointer items-center gap-2 text-[15px] leading-6",
        props.disabled && "cursor-not-allowed opacity-60",
        className
      )}
    >
      <input
        type="checkbox"
        className="size-5 shrink-0 accent-(--color-brand)"
        {...props}
      />
      <span>{label}</span>
    </label>
  );
}
