import { z } from "zod";

/**
 * The checkout scenario family's shared cart — the contract between
 * `checkout/line-item` (the writer) and `checkout/cart-summary` (the reader).
 *
 * Surfaces of one scenario share state through named store keys, and those
 * keys are part of the scenario's contract, not an implementation detail. They
 * live here so a second checkout-family scenario reuses the same two surfaces
 * without either of them learning about the other.
 */

export const CART_LINES_KEY = "checkout.lines";

export const CartLineSchema = z.object({
  id: z.string().min(1),
  /** GERMAN. Course material — and the longest string on the screen. */
  name: z.string().min(1),
  sku: z.string().default(""),
  /** Integer cents. Floating-point money is its own bug, and not a planted one. */
  unitPriceCents: z.number().int(),
  quantity: z.number().int(),
});

export type CartLine = z.infer<typeof CartLineSchema>;

export function parseCartLines(raw: unknown): CartLine[] {
  const parsed = z.array(CartLineSchema).safeParse(raw);
  return parsed.success ? parsed.data : [];
}

export function lineTotalCents(line: CartLine): number {
  return line.unitPriceCents * line.quantity;
}

export function subtotalCents(lines: readonly CartLine[]): number {
  return lines.reduce((sum, line) => sum + lineTotalCents(line), 0);
}

/**
 * German currency formatting, done by hand rather than through `Intl`.
 *
 * Deliberate: `Intl.NumberFormat("de-DE", …)` puts a narrow no-break space
 * before the € on some ICU builds and an ordinary one on others, so the server
 * render and the browser render can differ by one invisible character and
 * React reports a hydration mismatch on a *money* line — which reads exactly
 * like a planted bug. The sandbox cannot afford a defect it did not plant.
 *
 * Always German regardless of the interface locale: prices a learner reads are
 * course material (`CONTENT_LOCALES === ["de"]`).
 */
export function formatEuro(cents: number): string {
  const negative = cents < 0;
  const absolute = Math.abs(cents);
  const euros = Math.floor(absolute / 100);
  const rest = String(absolute % 100).padStart(2, "0");
  const grouped = String(euros).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${negative ? "−" : ""}${grouped},${rest} €`;
}
