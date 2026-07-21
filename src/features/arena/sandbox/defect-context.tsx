"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import {
  EMPTY_SANDBOX_STATE,
  isTriggerSatisfied,
  type DefectConfig,
  type SandboxState,
  type ScenarioConfiguration,
} from "./model";

/**
 * The engine's whole runtime.
 *
 * A surface component never learns which defect it is carrying, only whether
 * one of its own effects is armed. That is the line that keeps a bug data: the
 * component owns *how* the wrong behaviour looks, the scenario owns *whether*
 * and *when* it happens, and neither knows the other's vocabulary beyond the
 * effect name they agreed on in `surface-effects.ts`.
 */

interface SandboxContextValue {
  defectsEnabled: boolean;
  armedEffects: ReadonlySet<string>;
  paramsByKey: ReadonlyMap<string, Record<string, string | number | boolean>>;
  signal: (name: string) => void;
  setInput: (field: string, value: string) => void;
  store: Readonly<Record<string, unknown>>;
  setStoreValue: (key: string, next: unknown) => void;
}

const SandboxContext = createContext<SandboxContextValue | null>(null);

/** `surface::effect` — the key both maps are built on. */
function effectKey(surfaceId: string, effect: string): string {
  return `${surfaceId}::${effect}`;
}

function armedFor(
  defects: readonly DefectConfig[],
  state: SandboxState,
): { keys: Set<string>; params: Map<string, Record<string, string | number | boolean>> } {
  const keys = new Set<string>();
  const params = new Map<string, Record<string, string | number | boolean>>();
  for (const defect of defects) {
    if (!defect.effect) continue;
    if (!isTriggerSatisfied(defect.trigger, state)) continue;
    const key = effectKey(defect.surface, defect.effect);
    keys.add(key);
    params.set(key, defect.params);
  }
  return { keys, params };
}

export interface SandboxProviderProps {
  configuration: ScenarioConfiguration;
  /**
   * `false` renders the scenario with **every** effect disarmed — planted and
   * decoy alike. This is the clean baseline the visual-correctness checklist
   * in `README.md` is run against, and the render you diff the real one
   * against. It is author-only; see `authoring.ts` for how it is gated.
   */
  defectsEnabled?: boolean;
  children: ReactNode;
}

export function SandboxProvider({
  configuration,
  defectsEnabled = true,
  children,
}: SandboxProviderProps) {
  // Seeded from the configuration, not from an effect — see the note on
  // `ScenarioConfigurationSchema.store`. The initialiser runs once.
  const [state, setState] = useState<SandboxState>(() => ({
    ...EMPTY_SANDBOX_STATE,
    store: configuration.store,
  }));

  const signal = useCallback((name: string) => {
    setState((current) => ({
      ...current,
      signals: { ...current.signals, [name]: (current.signals[name] ?? 0) + 1 },
    }));
  }, []);

  const setInput = useCallback((field: string, value: string) => {
    setState((current) => ({ ...current, inputs: { ...current.inputs, [field]: value } }));
  }, []);

  const setStoreValue = useCallback((key: string, next: unknown) => {
    setState((current) => ({ ...current, store: { ...current.store, [key]: next } }));
  }, []);

  const { keys, params } = useMemo(
    () => (defectsEnabled ? armedFor(configuration.defects, state) : { keys: new Set<string>(), params: new Map() }),
    [configuration.defects, state, defectsEnabled],
  );

  const value = useMemo<SandboxContextValue>(
    () => ({
      defectsEnabled,
      armedEffects: keys,
      paramsByKey: params,
      signal,
      setInput,
      store: state.store,
      setStoreValue,
    }),
    [defectsEnabled, keys, params, signal, setInput, state.store, setStoreValue],
  );

  return <SandboxContext.Provider value={value}>{children}</SandboxContext.Provider>;
}

export interface SurfaceHandle {
  /** Is this effect armed right now? The only question a surface ever asks. */
  armed: (effect: string) => boolean;
  /** The scenario's knobs for that effect — intensity, delay, amount. */
  params: (effect: string) => Record<string, string | number | boolean>;
  /** Report an interaction. This is what arms an `afterSignals` trigger. */
  signal: (name: string) => void;
  /** Report a field's current value. This is what arms a `whenInput` trigger. */
  setInput: (field: string, value: string) => void;
}

/**
 * The hook every surface component uses.
 *
 * Outside a provider it returns a handle where nothing is ever armed, so a
 * surface rendered on its own — in a story, in a test, in the preview — is the
 * correct build rather than a crash.
 */
export function useSurface(surfaceId: string): SurfaceHandle {
  const context = useContext(SandboxContext);
  return useMemo<SurfaceHandle>(
    () => ({
      armed: (effect) => context?.armedEffects.has(effectKey(surfaceId, effect)) ?? false,
      params: (effect) => context?.paramsByKey.get(effectKey(surfaceId, effect)) ?? {},
      signal: (name) => context?.signal(name),
      setInput: (field, value) => context?.setInput(field, value),
    }),
    [context, surfaceId],
  );
}

/**
 * Shared state across the surfaces of one scenario — the cart every line item
 * writes and the summary reads.
 *
 * `parse` is mandatory rather than a convenience. The value comes out of a
 * jsonb column an author hand-wrote, so "it is an array of lines" is a hope,
 * not a type; validating at the seam turns a malformed scenario into a visible
 * empty state instead of a `TypeError` inside a learner's hunt.
 *
 * Rendering surfaces of two different scenarios in one tree is not supported
 * and never needs to be — one sandbox route renders one scenario.
 */
export function useSharedState<T>(
  key: string,
  parse: (raw: unknown) => T,
): [T, (next: T | ((previous: T) => T)) => void] {
  const context = useContext(SandboxContext);
  const raw = context?.store[key];
  const value = useMemo(() => parse(raw), [parse, raw]);
  const setValue = useCallback(
    (next: T | ((previous: T) => T)) => {
      if (!context) return;
      const resolved =
        typeof next === "function"
          ? (next as (previous: T) => T)(parse(context.store[key]))
          : next;
      context.setStoreValue(key, resolved);
    },
    [context, key, parse],
  );
  return [value, setValue];
}

/** Read a numeric knob with a fallback. Params arrive as JSON, so be careful. */
export function numberParam(
  params: Record<string, string | number | boolean>,
  key: string,
  fallback: number,
): number {
  const value = params[key];
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}
