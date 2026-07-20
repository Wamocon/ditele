import "server-only";

const DEFAULT_TIMEOUT_MS = 1_500;
const MAX_REPORTED_LATENCY_MS = 60_000;
const PUBLIC_DATABASE_PROBE_PATH = "/rest/v1/courses?select=id&limit=1";

export type OptionalDependencyStatus = "disabled" | "not_checked";
export type DatabaseReadinessStatus =
  | "ready"
  | "unavailable"
  | "timeout"
  | "invalid_configuration";

export interface ReadinessEnvironment {
  readonly supabaseUrl: string | undefined;
  readonly supabaseAnonKey: string | undefined;
  readonly aiProvider: string | undefined;
  readonly labProvider: string | undefined;
  readonly integrationProvider: string | undefined;
}

export interface ReadinessResult {
  readonly status: "ok" | "degraded";
  readonly dependencies: {
    readonly database: {
      readonly status: DatabaseReadinessStatus;
      readonly latency_ms: number | null;
    };
    readonly optional: {
      readonly ai: { readonly status: OptionalDependencyStatus };
      readonly labs: { readonly status: OptionalDependencyStatus };
      readonly integrations: { readonly status: OptionalDependencyStatus };
    };
  };
}

export interface ReadinessDependencies {
  readonly fetch: (
    input: string,
    init: RequestInit,
  ) => Promise<Pick<Response, "ok">>;
  readonly now: () => number;
  readonly scheduleTimeout: (
    callback: () => void,
    delayMs: number,
  ) => unknown;
  readonly cancelTimeout: (handle: unknown) => void;
  readonly timeoutMs: number;
}

const defaultDependencies: ReadinessDependencies = {
  fetch: (input, init) => globalThis.fetch(input, init),
  now: () => performance.now(),
  scheduleTimeout: (callback, delayMs) => globalThis.setTimeout(callback, delayMs),
  cancelTimeout: (handle) =>
    globalThis.clearTimeout(handle as ReturnType<typeof globalThis.setTimeout>),
  timeoutMs: DEFAULT_TIMEOUT_MS,
};

function optionalStatus(value: string | undefined): OptionalDependencyStatus {
  return value === undefined || value.trim().toLowerCase() === "disabled"
    ? "disabled"
    : "not_checked";
}

function optionalDependencies(environment: ReadinessEnvironment) {
  return {
    ai: { status: optionalStatus(environment.aiProvider) },
    labs: { status: optionalStatus(environment.labProvider) },
    integrations: { status: optionalStatus(environment.integrationProvider) },
  } as const;
}

function parseCoreConfiguration(
  environment: ReadinessEnvironment,
): { readonly probeUrl: string; readonly anonKey: string } | null {
  const rawUrl = environment.supabaseUrl?.trim();
  const rawKey = environment.supabaseAnonKey;

  if (
    !rawUrl ||
    !rawKey ||
    rawKey !== rawKey.trim() ||
    rawKey.length > 8_192 ||
    /[\u0000-\u001f\u007f]/u.test(rawKey)
  ) {
    return null;
  }

  try {
    const baseUrl = new URL(rawUrl);
    if (
      (baseUrl.protocol !== "https:" && baseUrl.protocol !== "http:") ||
      baseUrl.username ||
      baseUrl.password ||
      baseUrl.search ||
      baseUrl.hash
    ) {
      return null;
    }

    return {
      probeUrl: new URL(PUBLIC_DATABASE_PROBE_PATH, baseUrl).toString(),
      anonKey: rawKey,
    };
  } catch {
    return null;
  }
}

function reportedLatency(startedAt: number, finishedAt: number): number {
  if (!Number.isFinite(startedAt) || !Number.isFinite(finishedAt)) return 0;
  return Math.min(
    MAX_REPORTED_LATENCY_MS,
    Math.max(0, Math.round(finishedAt - startedAt)),
  );
}

function result(
  databaseStatus: DatabaseReadinessStatus,
  latencyMs: number | null,
  environment: ReadinessEnvironment,
): ReadinessResult {
  return {
    status: databaseStatus === "ready" ? "ok" : "degraded",
    dependencies: {
      database: { status: databaseStatus, latency_ms: latencyMs },
      optional: optionalDependencies(environment),
    },
  };
}

export function readinessEnvironmentFromProcess(): ReadinessEnvironment {
  return {
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
    supabaseAnonKey:
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    aiProvider: process.env.DITELE_AI_PROVIDER,
    labProvider: process.env.DITELE_LAB_PROVIDER,
    integrationProvider: process.env.DITELE_INTEGRATION_PROVIDER,
  };
}

export async function checkReadiness(
  environment: ReadinessEnvironment,
  dependencyOverrides: Partial<ReadinessDependencies> = {},
): Promise<ReadinessResult> {
  const configuration = parseCoreConfiguration(environment);
  if (!configuration) {
    return result("invalid_configuration", null, environment);
  }

  const dependencies = { ...defaultDependencies, ...dependencyOverrides };
  const startedAt = dependencies.now();
  const abortController = new AbortController();
  const timeoutMarker = Object.freeze({ type: "readiness_timeout" });
  let timeoutHandle: unknown;

  const timeout = new Promise<never>((_resolve, reject) => {
    timeoutHandle = dependencies.scheduleTimeout(() => {
      abortController.abort();
      reject(timeoutMarker);
    }, dependencies.timeoutMs);
  });

  try {
    const response = await Promise.race([
      dependencies.fetch(configuration.probeUrl, {
        method: "GET",
        headers: {
          accept: "application/json",
          apikey: configuration.anonKey,
          authorization: `Bearer ${configuration.anonKey}`,
        },
        cache: "no-store",
        credentials: "omit",
        redirect: "error",
        signal: abortController.signal,
      }),
      timeout,
    ]);
    const latencyMs = reportedLatency(startedAt, dependencies.now());

    return result(response.ok ? "ready" : "unavailable", latencyMs, environment);
  } catch (error) {
    const latencyMs = reportedLatency(startedAt, dependencies.now());
    return result(error === timeoutMarker ? "timeout" : "unavailable", latencyMs, environment);
  } finally {
    dependencies.cancelTimeout(timeoutHandle);
  }
}
