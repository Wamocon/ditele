/**
 * Every effect each surface component supports, and nothing else.
 *
 * Kept apart from `registry.ts` on purpose: the route validates a scenario on
 * the **server**, and importing the registry there would drag three Client
 * Components into the server module graph to read one array of strings.
 *
 * ⭐ **This table is the authoring contract's index.** A scenario may only arm
 * an effect that appears here for the component its surface names; anything
 * else is an authoring error the engine reports on screen rather than a bug
 * that silently never appears. When you teach a surface a new trick, add it
 * here in the same commit — the two drifting apart is the one failure mode
 * this file is built to prevent.
 */

export const SURFACE_EFFECTS = {
  "checkout/line-item": [
    /** The quantity stepper stops enforcing its lower bound. */
    "quantity-allows-negative",
    /** The thumbnail resolves late. Odd-looking, not a defect — decoy material. */
    "slow-thumbnail",
  ],
  "checkout/cart-summary": [
    /** The coupon line renders but the total ignores it. */
    "discount-ignored",
    /** Shipping is counted twice. Armed late, so it reads as drift. */
    "shipping-double-counted",
  ],
  "checkout/customer-form": [
    /** The e-mail validator accepts a domain with no top-level domain. */
    "email-validation-bypass",
  ],
} as const satisfies Record<string, readonly string[]>;

export type SurfaceComponentKey = keyof typeof SURFACE_EFFECTS;

/** The shape `parseScenarioConfiguration` validates against. */
export const KNOWN_SURFACES: Readonly<Record<string, readonly string[]>> = SURFACE_EFFECTS;
