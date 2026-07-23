"use client";

import { useState } from "react";
import { Star } from "lucide-react";
import { cn } from "@/shared/ui";

export interface StarRatingProps {
  value: number;
  onChange?: (value: number) => void;
  readOnly?: boolean;
  size?: number;
  /** Accessible group label, e.g. "Bewertung". */
  label?: string;
}

/**
 * A 1–5 star picker. Keyboard operable (each star is a real button) and shows a
 * hover preview while choosing. Read-only mode renders the same stars filled to
 * `value` for the completion summary.
 */
export function StarRating({ value, onChange, readOnly = false, size = 32, label = "Bewertung" }: StarRatingProps) {
  const [hover, setHover] = useState(0);
  const active = hover || value;

  return (
    <div className="flex items-center gap-1" role="group" aria-label={label}>
      {[1, 2, 3, 4, 5].map((star) => {
        const filled = star <= active;
        if (readOnly) {
          return (
            <Star
              key={star}
              aria-hidden
              style={{ width: size, height: size }}
              className={cn(filled ? "fill-(--color-warning) text-(--color-warning)" : "text-(--color-border-strong)")}
            />
          );
        }
        return (
          <button
            key={star}
            type="button"
            aria-label={`${star} von 5 Sternen`}
            aria-pressed={value === star}
            onClick={() => onChange?.(star)}
            onMouseEnter={() => setHover(star)}
            onMouseLeave={() => setHover(0)}
            onFocus={() => setHover(star)}
            onBlur={() => setHover(0)}
            className="rounded-(--radius-sm) p-0.5 transition-transform hover:scale-110 focus-visible:outline-2 focus-visible:outline-(--color-brand)"
          >
            <Star
              style={{ width: size, height: size }}
              className={cn(
                "transition-colors",
                filled ? "fill-(--color-warning) text-(--color-warning)" : "text-(--color-border-strong)",
              )}
            />
          </button>
        );
      })}
    </div>
  );
}
