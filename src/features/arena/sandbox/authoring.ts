import "server-only";

/**
 * The authoring gate.
 *
 * Two sandbox capabilities exist for the person writing a scenario and for
 * nobody else:
 *
 *  - `?defects=off` — render the scenario with every effect disarmed. This is
 *    the clean baseline the visual-correctness checklist is run against, and
 *    the render you diff the real one against.
 *  - the configuration errors, shown in full rather than as one sentence.
 *
 * Gated on an environment variable rather than a role, deliberately:
 *
 *  - A role check would need a permission probe on every sandbox render, on
 *    the hot path of the feature, to serve a flag used a few times per
 *    scenario in its whole life.
 *  - The checklist has to be run against a **production build** — `next dev`
 *    wedges on the build machine (RELEASE.md §7) — so gating on `NODE_ENV`
 *    would switch the flag off in exactly the build that must be checked.
 *  - It is server-side and not `NEXT_PUBLIC_`, so it never reaches a bundle
 *    and a learner cannot turn it on from their side.
 *
 * Set it for a local or preview run only:
 *   `DITELE_ARENA_AUTHORING=1 npm run build && … npm start`
 */
export function isAuthoringEnabled(): boolean {
  return process.env.DITELE_ARENA_AUTHORING === "1";
}
