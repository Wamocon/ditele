import type { ComponentType } from "react";
import { CheckoutCartSummarySurface } from "./surfaces/checkout/cart-summary";
import { CheckoutCustomerFormSurface } from "./surfaces/checkout/customer-form";
import { CheckoutLineItemSurface } from "./surfaces/checkout/line-item";
import { SURFACE_EFFECTS } from "./surface-effects";
import type { SurfaceProps } from "./registry-types";

/**
 * Registry key → component. The other half of `surface-effects.ts`.
 *
 * A new scenario that reuses these surfaces adds **nothing** here: it is a row
 * in `seed_arena_scenarios.sql`. A new scenario that needs a screen we do not
 * have adds its component and one line in each of these two files, and that is
 * the whole extension point. If you ever find yourself adding a third thing,
 * or a conditional, stop — the engine has drifted and it belongs in ISSUES.md.
 *
 * The keys are namespaced by scenario family (`checkout/…`) rather than
 * flat, so a future `login/…` family cannot quietly collide with a name here.
 */
export const SURFACE_REGISTRY: Record<string, ComponentType<SurfaceProps>> = {
  "checkout/line-item": CheckoutLineItemSurface,
  "checkout/cart-summary": CheckoutCartSummarySurface,
  "checkout/customer-form": CheckoutCustomerFormSurface,
};

/**
 * The two tables must describe the same set of components. A key in one and
 * not the other is either a surface no scenario can use or an effect that
 * arms nothing — both silent, both expensive. This is checked once, at module
 * load, so the mistake surfaces the first time anyone opens a sandbox rather
 * than the first time a learner cannot find a bug.
 */
export function registryMismatches(): string[] {
  const components = Object.keys(SURFACE_REGISTRY);
  const effects = Object.keys(SURFACE_EFFECTS);
  return [
    ...components
      .filter((key) => !effects.includes(key))
      .map((key) => `component "${key}" has no entry in surface-effects.ts`),
    ...effects
      .filter((key) => !components.includes(key))
      .map((key) => `surface-effects.ts declares "${key}", which is not in the registry`),
  ];
}

export type { SurfaceProps } from "./registry-types";
