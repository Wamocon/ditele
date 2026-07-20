import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const CONFIG_PATH = fileURLToPath(
  new URL("../supabase/config.toml", import.meta.url),
);
const HEALTH_REQUEST_TIMEOUT_MS = 1_000;
const HEALTH_RETRY_DELAY_MS = 500;
const INITIAL_HEALTH_ATTEMPTS = 3;
const RECOVERY_HEALTH_ATTEMPTS = 20;
const DOCKER_INSPECT_TIMEOUT_MS = 5_000;
const DOCKER_RESTART_TIMEOUT_MS = 20_000;
const PROJECT_LABEL = "com.supabase.cli.project";

function delay(milliseconds) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
}

export function parseLocalSupabaseConfig(source) {
  let section = "";
  let projectId;
  let apiPort;

  for (const rawLine of source.split(/\r?\n/u)) {
    const sectionMatch =
      /^\s*\[([A-Za-z0-9_.-]+)\]\s*(?:#.*)?$/u.exec(rawLine);
    if (sectionMatch) {
      section = sectionMatch[1].trim();
      continue;
    }

    if (section === "") {
      const projectMatch =
        /^\s*project_id\s*=\s*"([^"]+)"\s*(?:#.*)?$/u.exec(rawLine);
      if (projectMatch) {
        if (projectId !== undefined) {
          throw new Error("Supabase config contains duplicate project_id values.");
        }
        projectId = projectMatch[1];
      }
      continue;
    }

    if (section === "api") {
      const portMatch = /^\s*port\s*=\s*(\d+)\s*(?:#.*)?$/u.exec(rawLine);
      if (portMatch) {
        if (apiPort !== undefined) {
          throw new Error("Supabase [api] config contains duplicate port values.");
        }
        apiPort = Number(portMatch[1]);
      }
    }
  }

  if (
    typeof projectId !== "string" ||
    !/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/u.test(projectId)
  ) {
    throw new Error("Supabase config has a missing or unsafe project_id.");
  }
  if (!Number.isSafeInteger(apiPort) || apiPort < 1 || apiPort > 65_535) {
    throw new Error("Supabase config has a missing or invalid [api] port.");
  }

  return { apiPort, projectId };
}

export async function isAuthHealthy(
  healthUrl,
  {
    fetchImplementation = globalThis.fetch,
    requestTimeoutMs = HEALTH_REQUEST_TIMEOUT_MS,
  } = {},
) {
  try {
    const response = await fetchImplementation(healthUrl, {
      redirect: "error",
      signal: AbortSignal.timeout(requestTimeoutMs),
    });
    return response.status === 200;
  } catch {
    return false;
  }
}

export async function waitUntilAuthHealthy(
  healthUrl,
  attempts,
  {
    fetchImplementation = globalThis.fetch,
    requestTimeoutMs = HEALTH_REQUEST_TIMEOUT_MS,
    retryDelayMs = HEALTH_RETRY_DELAY_MS,
    wait = delay,
  } = {},
) {
  if (!Number.isSafeInteger(attempts) || attempts < 1) {
    throw new Error("Auth health attempts must be a positive integer.");
  }

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (
      await isAuthHealthy(healthUrl, {
        fetchImplementation,
        requestTimeoutMs,
      })
    ) {
      return true;
    }
    if (attempt + 1 < attempts) await wait(retryDelayMs);
  }
  return false;
}

function executeDockerCommand(
  arguments_,
  timeoutMs = DOCKER_RESTART_TIMEOUT_MS,
) {
  return execFileSync("docker", arguments_, {
    encoding: "utf8",
    maxBuffer: 64 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
    timeout: timeoutMs,
  }).trim();
}

export function verifyGatewayContainer(
  projectId,
  runDockerCommand = executeDockerCommand,
) {
  const gatewayContainer = `supabase_kong_${projectId}`;
  let containerProject;

  try {
    containerProject = runDockerCommand(
      [
        "container",
        "inspect",
        "--format",
        `{{ index .Config.Labels "${PROJECT_LABEL}" }}`,
        gatewayContainer,
      ],
      DOCKER_INSPECT_TIMEOUT_MS,
    ).trim();
  } catch {
    throw new Error(
      `The local gateway container ${gatewayContainer} is unavailable. Ensure Docker is running, then run npm run db:start.`,
    );
  }

  if (containerProject !== projectId) {
    throw new Error(
      `Refusing to restart ${gatewayContainer} because its Supabase project label does not match this repository.`,
    );
  }
  return gatewayContainer;
}

export async function ensureAuthGatewayForProject(
  { apiPort, projectId },
  {
    fetchImplementation = globalThis.fetch,
    initialHealthAttempts = INITIAL_HEALTH_ATTEMPTS,
    recoveryHealthAttempts = RECOVERY_HEALTH_ATTEMPTS,
    requestTimeoutMs = HEALTH_REQUEST_TIMEOUT_MS,
    retryDelayMs = HEALTH_RETRY_DELAY_MS,
    runDockerCommand = executeDockerCommand,
    wait = delay,
  } = {},
) {
  const healthUrl = `http://127.0.0.1:${apiPort}/auth/v1/health`;
  const healthOptions = {
    fetchImplementation,
    requestTimeoutMs,
    retryDelayMs,
    wait,
  };

  if (
    await waitUntilAuthHealthy(
      healthUrl,
      initialHealthAttempts,
      healthOptions,
    )
  ) {
    return { healthUrl, restarted: false };
  }

  const gatewayContainer = verifyGatewayContainer(projectId, runDockerCommand);
  try {
    runDockerCommand(
      ["restart", gatewayContainer],
      DOCKER_RESTART_TIMEOUT_MS,
    );
  } catch {
    throw new Error(
      `Docker could not restart ${gatewayContainer}. Ensure the local Supabase stack is running, then retry.`,
    );
  }

  if (
    !(await waitUntilAuthHealthy(
      healthUrl,
      recoveryHealthAttempts,
      healthOptions,
    ))
  ) {
    throw new Error(
      `Local Supabase Auth did not become healthy after restarting ${gatewayContainer}. Inspect that container's health and logs without sharing credentials.`,
    );
  }

  return { healthUrl, restarted: true };
}

export async function ensureLocalAuthGateway({
  configPath = CONFIG_PATH,
  ...options
} = {}) {
  let config;
  try {
    config = readFileSync(configPath, "utf8");
  } catch {
    throw new Error(
      "Unable to read this repository's supabase/config.toml file.",
    );
  }

  return ensureAuthGatewayForProject(parseLocalSupabaseConfig(config), options);
}

const invokedPath = process.argv[1]
  ? pathToFileURL(resolve(process.argv[1])).href
  : undefined;

if (invokedPath === import.meta.url) {
  try {
    const result = await ensureLocalAuthGateway();
    const recovery = result.restarted ? " after a scoped gateway restart" : "";
    console.log(`Local Supabase Auth is healthy at ${result.healthUrl}${recovery}.`);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown failure.";
    console.error(`Local Supabase Auth check failed: ${message}`);
    process.exitCode = 1;
  }
}
