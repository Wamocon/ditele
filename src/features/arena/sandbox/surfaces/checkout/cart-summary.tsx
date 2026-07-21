"use client";

import { useState } from "react";
import { z } from "zod";
import { numberParam, useSharedState, useSurface } from "../../defect-context";
import type { SurfaceProps } from "../../registry-types";
import { CART_LINES_KEY, formatEuro, parseCartLines, subtotalCents, type CartLine } from "./cart";

/**
 * The totals column of the checkout scenario family. Reads `checkout.lines`,
 * which `checkout/line-item` writes.
 *
 * Effects this surface supports (registered in `surface-effects.ts`):
 *  - `discount-ignored` — the discount line renders, the total does not
 *    subtract it. The classic "the number on the screen and the number you are
 *    charged disagree" defect, and the reason it is `high` rather than
 *    cosmetic.
 *  - `shipping-double-counted` — shipping is added twice. Armed by an
 *    `afterSignals` trigger in the reference scenario, so the total is right
 *    when the page loads and wrong after the learner has been editing for a
 *    while. That is what makes it stateful, and why it is worth `critical`: a
 *    tester who checks the total once and moves on never sees it.
 */

const ContentSchema = z.object({
  heading: z.string().default("Zusammenfassung"),
  subtotalLabel: z.string().default("Zwischensumme"),
  discountLabel: z.string().default("Rabatt"),
  shippingLabel: z.string().default("Versandkosten"),
  freeShippingLabel: z.string().default("kostenlos"),
  totalLabel: z.string().default("Gesamtsumme"),
  couponLabel: z.string().default("Gutscheincode"),
  couponPlaceholder: z.string().default("z. B. WMC10"),
  couponApplyLabel: z.string().default("Einlösen"),
  couponAcceptedLabel: z.string().default("Gutschein angewendet."),
  couponRejectedLabel: z.string().default("Dieser Gutscheincode ist ungültig."),
  freeShippingHintLabel: z
    .string()
    .default("Ab {threshold} Bestellwert entfällt der Versand."),
  /** The one code this shop accepts, and by how much. Course material. */
  couponCode: z.string().default("WMC10"),
  couponPercent: z.number().default(10),
  shippingCents: z.number().int().default(495),
  freeShippingThresholdCents: z.number().int().default(10_000),
});

export function CheckoutCartSummarySurface({ surfaceId, content }: SurfaceProps) {
  const strings = ContentSchema.parse(content);
  const surface = useSurface(surfaceId);
  const [lines] = useSharedState<CartLine[]>(CART_LINES_KEY, parseCartLines);

  const [couponInput, setCouponInput] = useState("");
  const [appliedCoupon, setAppliedCoupon] = useState<string | null>(null);
  const [couponRejected, setCouponRejected] = useState(false);

  const subtotal = subtotalCents(lines);
  const discount =
    appliedCoupon === null ? 0 : Math.round((subtotal * strings.couponPercent) / 100);
  const shipping =
    subtotal >= strings.freeShippingThresholdCents || subtotal <= 0 ? 0 : strings.shippingCents;

  const discountIgnored = surface.armed("discount-ignored");
  const shippingDoubled = surface.armed("shipping-double-counted");
  const shippingFactor = shippingDoubled
    ? numberParam(surface.params("shipping-double-counted"), "factor", 2)
    : 1;

  // The total is one expression. Each defect removes or duplicates one term of
  // it — no branch renders a different summary, which is what keeps the two
  // builds pixel-identical apart from the numbers.
  const total = subtotal - (discountIgnored ? 0 : discount) + shipping * shippingFactor;

  function applyCoupon() {
    const candidate = couponInput.trim().toUpperCase();
    const valid = candidate === strings.couponCode.toUpperCase();
    setAppliedCoupon(valid ? candidate : null);
    setCouponRejected(!valid && candidate.length > 0);
  }

  return (
    <section
      aria-labelledby={`${surfaceId}-heading`}
      className="flex flex-col gap-4 rounded-(--radius-md) border border-(--color-border) bg-(--color-surface) p-4"
    >
      <h2 id={`${surfaceId}-heading`} className="text-[18px] font-semibold leading-6">
        {strings.heading}
      </h2>

      <div className="flex flex-col gap-2">
        <label
          htmlFor={`${surfaceId}-coupon`}
          className="text-[13px] font-semibold leading-5"
        >
          {strings.couponLabel}
        </label>
        <div className="flex flex-wrap gap-2">
          <input
            id={`${surfaceId}-coupon`}
            name="coupon"
            value={couponInput}
            placeholder={strings.couponPlaceholder}
            onChange={(event) => {
              setCouponInput(event.target.value);
              setCouponRejected(false);
            }}
            className="h-11 min-h-11 min-w-0 flex-1 rounded-(--radius-sm) border border-(--color-border-strong) bg-(--color-bg) px-3 text-[15px] text-(--color-fg) placeholder:text-(--color-fg-subtle)"
          />
          <button
            type="button"
            onClick={applyCoupon}
            className="inline-flex h-11 min-h-11 items-center justify-center rounded-(--radius-sm) bg-(--color-ink) px-4 text-[15px] font-semibold text-(--color-bg) transition-opacity duration-(--duration-fast) hover:opacity-90"
          >
            {strings.couponApplyLabel}
          </button>
        </div>
        {appliedCoupon !== null && (
          <p className="text-[13px] leading-5 text-(--color-success)">
            {strings.couponAcceptedLabel}
          </p>
        )}
        {couponRejected && (
          <p role="alert" className="text-[13px] leading-5 text-(--color-danger)">
            {strings.couponRejectedLabel}
          </p>
        )}
      </div>

      <dl className="flex flex-col gap-2 border-t border-(--color-border) pt-4 text-[15px]">
        <Row label={strings.subtotalLabel} value={formatEuro(subtotal)} />
        {appliedCoupon !== null && (
          <Row
            label={`${strings.discountLabel} (${strings.couponPercent} %)`}
            value={formatEuro(-discount)}
            tone="success"
          />
        )}
        <Row
          label={strings.shippingLabel}
          value={shipping === 0 ? strings.freeShippingLabel : formatEuro(shipping * shippingFactor)}
        />
        <div className="mt-1 flex items-baseline justify-between gap-3 border-t border-(--color-border) pt-3">
          <dt className="text-[15px] font-semibold">{strings.totalLabel}</dt>
          <dd className="text-[20px] font-semibold tabular-nums">{formatEuro(total)}</dd>
        </div>
      </dl>

      <p className="text-[13px] leading-5 text-(--color-fg-muted)">
        {strings.freeShippingHintLabel.replace(
          "{threshold}",
          formatEuro(strings.freeShippingThresholdCents),
        )}
      </p>
    </section>
  );
}

function Row({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "success";
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-(--color-fg-muted)">{label}</dt>
      <dd className={tone === "success" ? "tabular-nums text-(--color-success)" : "tabular-nums"}>
        {value}
      </dd>
    </div>
  );
}
