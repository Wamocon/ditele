import assert from "node:assert/strict";
import test from "node:test";

import {
  ensureAuthGatewayForProject,
  parseLocalSupabaseConfig,
  verifyGatewayContainer,
  waitUntilAuthHealthy,
} from "./ensure-local-auth-gateway.mjs";

const project = { apiPort: 56_721, projectId: "ditele-v2" };

test("parses only the top-level project and the api section port", () => {
  assert.deepEqual(
    parseLocalSupabaseConfig(`
project_id = "ditele-v2"

[db]
port = 56722

[api]
enabled = true
port = 56721 # loopback gateway

[studio]
port = 56723
`),
    project,
  );
});

test("rejects unsafe projects, invalid ports, and duplicate api ports", () => {
  assert.throws(
    () =>
      parseLocalSupabaseConfig(`project_id = "../other"\n[api]\nport = 56721`),
    /unsafe project_id/u,
  );
  assert.throws(
    () =>
      parseLocalSupabaseConfig(`project_id = "ditele-v2"\n[api]\nport = 70000`),
    /invalid \[api\] port/u,
  );
  assert.throws(
    () =>
      parseLocalSupabaseConfig(
        `project_id = "ditele-v2"\n[api]\nport = 56721\nport = 56722`,
      ),
    /duplicate port/u,
  );
});

test("health polling is bounded and does not sleep after the final attempt", async () => {
  let probes = 0;
  let waits = 0;
  const result = await waitUntilAuthHealthy("http://127.0.0.1:56721/auth/v1/health", 3, {
    fetchImplementation: async () => {
      probes += 1;
      return { status: 503 };
    },
    wait: async () => {
      waits += 1;
    },
  });

  assert.equal(result, false);
  assert.equal(probes, 3);
  assert.equal(waits, 2);
});

test("healthy auth never invokes Docker", async () => {
  const result = await ensureAuthGatewayForProject(project, {
    fetchImplementation: async () => ({ status: 200 }),
    runDockerCommand: () => {
      throw new Error("Docker must not be called for a healthy gateway");
    },
    wait: async () => undefined,
  });

  assert.deepEqual(result, {
    healthUrl: "http://127.0.0.1:56721/auth/v1/health",
    restarted: false,
  });
});

test("recovery inspects the exact project label before restarting the gateway", async () => {
  const dockerCalls = [];
  let probes = 0;
  const result = await ensureAuthGatewayForProject(project, {
    fetchImplementation: async () => ({ status: probes++ === 0 ? 503 : 200 }),
    initialHealthAttempts: 1,
    recoveryHealthAttempts: 1,
    runDockerCommand: (arguments_, timeoutMs) => {
      dockerCalls.push({ arguments_, timeoutMs });
      return arguments_[0] === "container" ? "ditele-v2" : "supabase_kong_ditele-v2";
    },
    wait: async () => undefined,
  });

  assert.equal(result.restarted, true);
  assert.deepEqual(dockerCalls, [
    {
      arguments_: [
        "container",
        "inspect",
        "--format",
        '{{ index .Config.Labels "com.supabase.cli.project" }}',
        "supabase_kong_ditele-v2",
      ],
      timeoutMs: 5_000,
    },
    {
      arguments_: ["restart", "supabase_kong_ditele-v2"],
      timeoutMs: 20_000,
    },
  ]);
});

test("a mismatched project label fails closed before restart", () => {
  const calls = [];
  assert.throws(
    () =>
      verifyGatewayContainer("ditele-v2", (arguments_) => {
        calls.push(arguments_);
        return "another-project";
      }),
    /Refusing to restart/u,
  );
  assert.equal(calls.length, 1);
});

test("Docker failures produce actionable messages without leaking raw output", async () => {
  const sensitiveMarker = "SERVICE_ROLE_VALUE_MUST_NOT_APPEAR";
  assert.throws(
    () =>
      verifyGatewayContainer("ditele-v2", () => {
        throw new Error(sensitiveMarker);
      }),
    (error) => {
      assert.match(error.message, /npm run db:start/u);
      assert.doesNotMatch(error.message, new RegExp(sensitiveMarker, "u"));
      return true;
    },
  );

  await assert.rejects(
    ensureAuthGatewayForProject(project, {
      fetchImplementation: async () => ({ status: 503 }),
      initialHealthAttempts: 1,
      recoveryHealthAttempts: 1,
      runDockerCommand: (arguments_) => {
        if (arguments_[0] === "container") return "ditele-v2";
        throw new Error(sensitiveMarker);
      },
      wait: async () => undefined,
    }),
    (error) => {
      assert.match(error.message, /Docker could not restart/u);
      assert.doesNotMatch(error.message, new RegExp(sensitiveMarker, "u"));
      return true;
    },
  );
});
