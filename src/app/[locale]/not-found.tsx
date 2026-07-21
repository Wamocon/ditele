"use client";

/**
 * Catch-all 404 for the whole locale subtree.
 *
 * Fixes I-022 / I-025. A `not-found.tsx` inside a route group — `(public)/` —
 * is never picked up by `notFound()` thrown from a nested segment, so every
 * miss fell through to Next's unbranded English default. Placing it directly on
 * the `[locale]` segment makes it the nearest boundary for every page under it,
 * in all five route groups.
 *
 * The per-segment copies (e.g. `catalog/[slug]/not-found.tsx`) stay as they are;
 * a nearer boundary still wins, and they cost nothing.
 */
export { NotFoundView as default } from "./(public)/_components/not-found-view";
