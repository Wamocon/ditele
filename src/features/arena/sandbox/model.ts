import { z } from "zod";

/**
 * The Bug Arena sandbox — the `hunt_scenarios.configuration` contract.
 *
 * ⭐ **A bug is data, not a code branch.** Everything in this file exists to
 * keep that true. A scenario declares which *surfaces* it renders and which
 * *effects* are armed on them; the surface components read that and mutate
 * their own behaviour. Adding a bug that reuses an effect a surface already
 * supports is a row in `seed_arena_scenarios.sql` and nothing else — no
 * migration, no engine change, no `if (scenario === "checkout-v2")`.
 *
 * The authoring contract, with the worked example, is in `./README.md`.
 * **That file is the deliverable.** This one is its enforcement.
 *
 * No server imports: the sandbox runtime is a Client Component and needs every
 * type and helper here at runtime. Same split, same reason, as
 * `src/features/arena/model.ts` (WS-8) and `src/features/learning/model.ts`.
 */

/* ── Triggers ─────────────────────────────────────────────────────────────── */

/**
 * When a defect becomes observable.
 *
 * `afterSignals` is what makes a **stateful** bug possible — the thing owning
 * the sandbox in React buys us over serving static HTML. A surface calls
 * `signal("quantity-changed")` on each interaction; the defect arms on the
 * n-th one and not before.
 *
 * Adding a fourth trigger type means extending this union *and*
 * `isTriggerSatisfied` below. That is the one place in the engine a new
 * *category* of bug touches code — see README §"Adding a trigger type".
 */
export const TriggerSchema = z.discriminatedUnion("type", [
  /** Armed from first render. The ordinary case. */
  z.object({ type: z.literal("always") }),
  /** Armed once `signal` has fired `count` times. The stateful case. */
  z.object({
    type: z.literal("afterSignals"),
    signal: z.string().min(1),
    count: z.number().int().min(1).max(50),
  }),
  /**
   * Armed while the named input matches `pattern` (a JS regular expression
   * source, matched case-insensitively). The input-dependent case.
   */
  z.object({
    type: z.literal("whenInput"),
    field: z.string().min(1),
    pattern: z.string().min(1),
  }),
]);

export type TriggerConfig = z.infer<typeof TriggerSchema>;

/* ── Defects ──────────────────────────────────────────────────────────────── */

/**
 * `planted` — a real defect. Finding it is the point. Counts towards
 *             `hunt_scenarios.expected_findings`.
 * `decoy`   — odd-looking behaviour that is **not** a defect. Reporting it is
 *             the mistake the scenario is teaching against. A hunt where
 *             everything odd is a bug teaches students to report noise; real
 *             testing is mostly deciding what is *not* worth a ticket.
 * `known_non_bug` — behaviour students report over and over that we have ruled
 *             correct. Recorded so a trainer answers it once, in the ground
 *             truth, instead of once per student forever. May carry no effect
 *             at all: it is often a property of the design, not something the
 *             engine switches on.
 */
export const DEFECT_KINDS = ["planted", "decoy", "known_non_bug"] as const;
export type DefectKind = (typeof DEFECT_KINDS)[number];

/** Mirrors `hunt_findings.severity` — the same four values the ticket uses. */
export const DEFECT_SEVERITIES = ["low", "medium", "high", "critical"] as const;
export type DefectSeverity = (typeof DEFECT_SEVERITIES)[number];

export const DefectSchema = z.object({
  /**
   * The ground-truth handle. SCREAMING_SNAKE_CASE, unique inside a scenario.
   * This is the string a trainer confirms into `hunt_findings.planted_code`,
   * so it outlives the scenario version and must never be recycled to mean
   * something else.
   */
  code: z
    .string()
    .min(3)
    .max(64)
    .regex(/^[A-Z][A-Z0-9_]*$/, "code must be SCREAMING_SNAKE_CASE"),
  kind: z.enum(DEFECT_KINDS),
  severity: z.enum(DEFECT_SEVERITIES).optional(),
  /** Which surface shows it. Must be one of `surfaces[].id`. */
  surface: z.string().min(1),
  /**
   * The behaviour switch the surface component supports. Every surface
   * declares its own list in `registry.ts`; an effect that is not on that list
   * is an authoring error and the engine says so out loud rather than
   * rendering a scenario with a bug that silently never appears.
   */
  effect: z.string().min(1).optional(),
  trigger: TriggerSchema.default({ type: "always" }),
  /**
   * Free-form knobs handed to the surface — how far a total drifts, how long a
   * decoy stalls. Lets one effect serve several scenarios at different
   * intensities without a second code path.
   */
  params: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).default({}),
  /**
   * GERMAN. Course material (`CONTENT_LOCALES === ["de"]`), and trainer-facing
   * ground truth: what to do to see it, and what should have happened. Never
   * shown to a student before their report is reviewed.
   */
  reproduction: z.string().default(""),
  expected: z.string().default(""),
});

export type DefectConfig = z.infer<typeof DefectSchema>;

/* ── Surfaces ─────────────────────────────────────────────────────────────── */

export const SurfaceSchema = z.object({
  /** Scenario-local handle. `defects[].surface` points at this. */
  id: z.string().min(1),
  /** A key in the surface registry (`registry.ts`). */
  component: z.string().min(1),
  /**
   * Where the runtime puts it. `main` is the wide column, `aside` the narrow
   * one beside it from `lg` up; below that everything stacks in declaration
   * order. Layout is a property of the scenario, not of the component, so the
   * same summary surface can sit in a sidebar in one scenario and inline in
   * the next without a prop nobody else sets.
   */
  column: z.enum(["main", "aside"]).default("main"),
  /**
   * GERMAN copy and data for this surface — product names, labels, prices.
   * Course material, so a plain object, never a three-locale jsonb.
   *
   * This is what makes "two scenarios sharing one component with different
   * planted bugs" real rather than aspirational: the component holds layout
   * and behaviour, the scenario holds everything a reader sees.
   */
  content: z.record(z.string(), z.unknown()).default({}),
});

export type SurfaceConfig = z.infer<typeof SurfaceSchema>;

/* ── The scenario configuration ───────────────────────────────────────────── */

export const ScenarioConfigurationSchema = z.object({
  /**
   * Bumped only when the *shape* below changes incompatibly. A scenario row
   * written against v1 must keep rendering after that; the engine refuses a
   * version it does not know instead of half-rendering one.
   */
  engineVersion: z.literal(1).default(1),
  /** GERMAN. The heading the learner reads above the sandbox. */
  appName: z.string().default(""),
  /**
   * The scenario's initial **shared, mutable** data — the cart lines, the
   * session, whatever more than one surface both reads and writes.
   *
   * Distinct from `surfaces[].content`, which is that one surface's static
   * copy. The split matters for a reason that is easy to miss: seeding shared
   * data here means it exists before the first render, so a summary surface
   * never renders a zero total and then jumps when the line-item surface
   * publishes the real one. "No layout shift on load" is on the
   * visual-correctness checklist, and a store seeded in an effect fails it.
   */
  store: z.record(z.string(), z.unknown()).default({}),
  surfaces: z.array(SurfaceSchema).min(1),
  defects: z.array(DefectSchema).default([]),
});

export type ScenarioConfiguration = z.infer<typeof ScenarioConfigurationSchema>;

/* ── Parsing ──────────────────────────────────────────────────────────────── */

export interface ScenarioParseResult {
  configuration: ScenarioConfiguration | null;
  /**
   * Authoring errors, in German-free plain English — these are for the person
   * writing the scenario, never for a learner. A scenario with errors does not
   * render: a half-rendered sandbox is exactly the "is this the planted bug or
   * is the screen just broken?" confusion the whole workstream exists to avoid.
   */
  errors: string[];
}

/**
 * Parse and validate one `hunt_scenarios.configuration`.
 *
 * `knownSurfaces` maps a registry key to the effects that component supports.
 * Passing it turns three whole classes of authoring mistake — unknown
 * component, defect pointing at a surface the scenario does not render, effect
 * the component has never heard of — from "the bug silently never appears"
 * into a message on the screen.
 */
export function parseScenarioConfiguration(
  raw: unknown,
  knownSurfaces: Readonly<Record<string, readonly string[]>>,
): ScenarioParseResult {
  const parsed = ScenarioConfigurationSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      configuration: null,
      errors: parsed.error.issues.map(
        (issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`,
      ),
    };
  }

  const configuration = parsed.data;
  const errors: string[] = [];
  const surfaceIds = new Set<string>();

  for (const surface of configuration.surfaces) {
    if (surfaceIds.has(surface.id)) errors.push(`surface id "${surface.id}" is used twice`);
    surfaceIds.add(surface.id);
    if (!(surface.component in knownSurfaces)) {
      errors.push(
        `surface "${surface.id}" names component "${surface.component}", which is not in the registry`,
      );
    }
  }

  const componentBySurfaceId = new Map(
    configuration.surfaces.map((surface) => [surface.id, surface.component]),
  );
  const codes = new Set<string>();

  for (const defect of configuration.defects) {
    if (codes.has(defect.code)) errors.push(`defect code "${defect.code}" is used twice`);
    codes.add(defect.code);

    const component = componentBySurfaceId.get(defect.surface);
    if (component === undefined) {
      errors.push(`defect "${defect.code}" targets surface "${defect.surface}", which this scenario does not render`);
      continue;
    }
    if (defect.effect === undefined) {
      // Only a known non-bug is allowed to be pure documentation. A planted
      // defect with no effect is a bug nobody can ever find.
      if (defect.kind !== "known_non_bug") {
        errors.push(`defect "${defect.code}" is ${defect.kind} but declares no effect`);
      }
      continue;
    }
    const supported = knownSurfaces[component];
    if (supported && !supported.includes(defect.effect)) {
      errors.push(
        `defect "${defect.code}" arms effect "${defect.effect}", which component "${component}" does not support (it supports: ${supported.join(", ") || "none"})`,
      );
    }
  }

  return { configuration, errors };
}

/* ── Runtime helpers (pure) ───────────────────────────────────────────────── */

/** Signal counts and input values, keyed by name. The whole runtime state. */
export interface SandboxState {
  signals: Readonly<Record<string, number>>;
  inputs: Readonly<Record<string, string>>;
  /** Seeded from `configuration.store`; surfaces read and write it by key. */
  store: Readonly<Record<string, unknown>>;
}

export const EMPTY_SANDBOX_STATE: SandboxState = { signals: {}, inputs: {}, store: {} };

/**
 * Is this trigger armed given the current state?
 *
 * Deliberately total and deterministic: no clock, no randomness. Two renders
 * of the same scenario with the same interactions must be byte-identical, or
 * the "diff the defects-on and defects-off renders" step of the
 * visual-correctness checklist means nothing.
 */
export function isTriggerSatisfied(trigger: TriggerConfig, state: SandboxState): boolean {
  switch (trigger.type) {
    case "always":
      return true;
    case "afterSignals":
      return (state.signals[trigger.signal] ?? 0) >= trigger.count;
    case "whenInput": {
      const value = state.inputs[trigger.field];
      if (value === undefined) return false;
      try {
        return new RegExp(trigger.pattern, "i").test(value);
      } catch {
        // A malformed pattern must not take the sandbox down. It is caught at
        // author time by `previewScenario`; here it simply never arms.
        return false;
      }
    }
  }
}

/** Every planted defect — what `expected_findings` should agree with. */
export function plantedDefects(configuration: ScenarioConfiguration): DefectConfig[] {
  return configuration.defects.filter((defect) => defect.kind === "planted");
}

/**
 * Is `code` a defect a learner should NOT be reporting? WS-10's ground-truth
 * panel reads this to tell a trainer "this one is a decoy" in one word.
 */
export function isNonDefect(configuration: ScenarioConfiguration, code: string): boolean {
  const defect = configuration.defects.find((entry) => entry.code === code);
  return defect !== undefined && defect.kind !== "planted";
}
