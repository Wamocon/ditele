"use client";

import { useEffect, useState, type ReactNode } from "react";
import { z } from "zod";
import { cn } from "@/shared/ui";
import { numberParam, useSharedState, useSurface } from "../../defect-context";
import type { SurfaceProps } from "../../registry-types";
import {
  CART_LINES_KEY,
  formatEuro,
  lineTotalCents,
  parseCartLines,
  type CartLine,
} from "./cart";

/**
 * The cart lines of the checkout scenario family.
 *
 * Writes `checkout.lines`; `checkout/cart-summary` reads it. Neither surface
 * imports the other — they meet at the store key in `cart.ts`.
 *
 * Effects this surface supports (registered in `surface-effects.ts`):
 *  - `quantity-allows-negative` — the stepper's lower bound stops being
 *    enforced, so a quantity and its line total can go below zero.
 *  - `slow-thumbnail` — the image placeholder resolves late. Odd-looking and
 *    entirely correct: decoy material.
 *
 * Fires the `quantity-changed` signal on every quantity edit, which is what an
 * `afterSignals` trigger elsewhere in the scenario counts.
 */

const ContentSchema = z.object({
  heading: z.string().default("Warenkorb"),
  emptyLabel: z.string().default("Ihr Warenkorb ist leer."),
  quantityLabel: z.string().default("Menge"),
  decreaseLabel: z.string().default("Menge verringern"),
  increaseLabel: z.string().default("Menge erhöhen"),
  removeLabel: z.string().default("Entfernen"),
  articleNumberLabel: z.string().default("Artikelnummer"),
  unitPriceLabel: z.string().default("Einzelpreis"),
});

/** The correct lower bound. The planted defect is precisely its absence. */
const MINIMUM_QUANTITY = 1;

export function CheckoutLineItemSurface({ surfaceId, content }: SurfaceProps) {
  const strings = ContentSchema.parse(content);
  const surface = useSurface(surfaceId);
  const [lines, setLines] = useSharedState<CartLine[]>(CART_LINES_KEY, parseCartLines);

  const allowsNegative = surface.armed("quantity-allows-negative");
  const slowThumbnail = surface.armed("slow-thumbnail");
  const thumbnailDelay = numberParam(surface.params("slow-thumbnail"), "delayMs", 1200);

  function changeQuantity(id: string, delta: number) {
    setLines((current) =>
      current.map((line) =>
        line.id === id
          ? {
              ...line,
              // The bug is one missing clamp — not a second code path.
              quantity: allowsNegative
                ? line.quantity + delta
                : Math.max(MINIMUM_QUANTITY, line.quantity + delta),
            }
          : line,
      ),
    );
    surface.signal("quantity-changed");
  }

  function removeLine(id: string) {
    setLines((current) => current.filter((line) => line.id !== id));
  }

  if (lines.length === 0) {
    return (
      <section aria-labelledby={`${surfaceId}-heading`} className="flex flex-col gap-3">
        <h2 id={`${surfaceId}-heading`} className="text-[18px] font-semibold leading-6">
          {strings.heading}
        </h2>
        <p className="rounded-(--radius-md) border border-dashed border-(--color-border-strong) px-4 py-8 text-center text-[14px] text-(--color-fg-muted)">
          {strings.emptyLabel}
        </p>
      </section>
    );
  }

  return (
    <section aria-labelledby={`${surfaceId}-heading`} className="flex flex-col gap-3">
      <h2 id={`${surfaceId}-heading`} className="text-[18px] font-semibold leading-6">
        {strings.heading}
      </h2>

      <ul className="flex flex-col gap-3">
        {lines.map((line) => (
          <li
            key={line.id}
            className="flex flex-col gap-3 rounded-(--radius-md) border border-(--color-border) bg-(--color-surface) p-3 sm:flex-row sm:items-center sm:gap-4"
          >
            <Thumbnail name={line.name} slow={slowThumbnail} delayMs={thumbnailDelay} />

            <div className="min-w-0 flex-1">
              <p className="text-[15px] font-semibold leading-5">{line.name}</p>
              <p className="mt-1 text-[13px] leading-5 text-(--color-fg-muted)">
                {strings.articleNumberLabel} {line.sku} · {strings.unitPriceLabel}{" "}
                {formatEuro(line.unitPriceCents)}
              </p>
            </div>

            <div className="flex items-center justify-between gap-3 sm:justify-end">
              <div className="flex items-center gap-1" role="group" aria-label={strings.quantityLabel}>
                <StepperButton
                  label={strings.decreaseLabel}
                  onClick={() => changeQuantity(line.id, -1)}
                  disabled={!allowsNegative && line.quantity <= MINIMUM_QUANTITY}
                >
                  −
                </StepperButton>
                <output
                  aria-label={strings.quantityLabel}
                  className="min-w-11 text-center text-[15px] font-semibold tabular-nums"
                >
                  {line.quantity}
                </output>
                <StepperButton
                  label={strings.increaseLabel}
                  onClick={() => changeQuantity(line.id, 1)}
                >
                  +
                </StepperButton>
              </div>

              <p className="min-w-24 text-right text-[15px] font-semibold tabular-nums">
                {formatEuro(lineTotalCents(line))}
              </p>

              <button
                type="button"
                onClick={() => removeLine(line.id)}
                className="inline-flex h-11 min-h-11 items-center rounded-(--radius-sm) px-3 text-[13px] font-semibold text-(--color-fg-muted) transition-colors duration-(--duration-fast) hover:bg-(--color-surface-2) hover:text-(--color-fg) lg:h-9 lg:min-h-9"
              >
                {strings.removeLabel}
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function StepperButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "inline-flex size-11 min-h-11 items-center justify-center rounded-(--radius-sm)",
        "border border-(--color-border-strong) bg-(--color-bg) text-[18px] font-semibold leading-none",
        "transition-colors duration-(--duration-fast) hover:bg-(--color-surface-2)",
        "disabled:pointer-events-none disabled:opacity-40",
      )}
    >
      {children}
    </button>
  );
}

/**
 * A product thumbnail. There is no image file — the sandbox ships no binary
 * assets, so the "photo" is a token-coloured tile with the article's initials.
 * That is deliberate rather than a shortcut: a missing or broken `<img>` is
 * itself a defect a student would report, and it is not one we planted.
 *
 * `slow` holds the placeholder for `delayMs` before revealing the tile. The
 * reveal is a cross-fade, and under `prefers-reduced-motion` it is an instant
 * swap — the delay stays, only the animation goes, so the decoy still reads
 * the same to someone who cannot take motion.
 */
function Thumbnail({ name, slow, delayMs }: { name: string; slow: boolean; delayMs: number }) {
  // `elapsed` is the timer, not the answer. Deriving `resolved` from it keeps
  // the effect free of a synchronous setState — the state only ever changes in
  // the timer callback, which is what `react-hooks/set-state-in-effect` is
  // asking for and is genuinely simpler than the version that assigns twice.
  const [elapsed, setElapsed] = useState(false);

  useEffect(() => {
    if (!slow) return;
    const timer = window.setTimeout(() => setElapsed(true), delayMs);
    return () => window.clearTimeout(timer);
  }, [slow, delayMs]);

  const resolved = !slow || elapsed;

  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0] ?? "")
    .join("")
    .toUpperCase();

  return (
    <div
      aria-hidden
      className={cn(
        "flex size-14 shrink-0 items-center justify-center rounded-(--radius-sm) text-[15px] font-semibold",
        resolved
          ? "bg-(--color-surface-2) text-(--color-fg-muted) motion-safe:animate-fade-in"
          : "animate-shimmer text-transparent",
      )}
    >
      {resolved ? initials : "··"}
    </div>
  );
}
