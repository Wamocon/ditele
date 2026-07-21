#!/usr/bin/env node
/**
 * `npm run db:lint` — schema lint against the database this project actually
 * uses.
 *
 * ⚠️ **Why this script exists at all** (ISSUES.md I-039). The old script was
 * `supabase db lint --local`, which needs a Supabase stack on loopback. This
 * project's database is the **remote** container `supabase_db_ditele-v2`, so
 * `--local` always died with `LegacyDbConnectError: PgClient: Failed to
 * connect` — which reads exactly like a broken migration and is not one. Every
 * Arena workstream hit it, worked around it by hand, and recorded the same
 * invocation in its own status file. Five copies of a workaround is a script
 * that should have existed.
 *
 * ⚠️ **`?sslmode=disable` is mandatory.** Without it the CLI fails with a
 * connect error identical to the one a wrong password produces, so the symptom
 * points at the credentials rather than at TLS negotiation. This script appends
 * it when the caller has not.
 *
 * Connection, in order of precedence:
 *   1. `SUPABASE_DB_URL` — set it and nothing else here applies.
 *   2. Derived: the host of `NEXT_PUBLIC_SUPABASE_URL`, with `SUPABASE_DB_PORT`
 *      (default 56722 — the Postgres port; 56721 is Kong, and 54322 on that
 *      host is a *different* Supabase entirely) and `SUPABASE_DB_PASSWORD`
 *      (default `postgres`, from the container env).
 *   3. `--local`, for anyone who does have a local stack.
 */

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

const DEFAULT_DB_PORT = "56722";
const DEFAULT_DB_PASSWORD = "postgres";

/** `.env.local` is git-ignored and not loaded for us — read it if it is there. */
function readEnvLocal() {
  try {
    const text = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
    const out = {};
    for (const line of text.split(/\r?\n/)) {
      const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
      if (match) out[match[1]] = match[2];
    }
    return out;
  } catch {
    return {};
  }
}

const fileEnv = readEnvLocal();
const env = (name) => process.env[name] ?? fileEnv[name];

function resolveDbUrl() {
  const explicit = env("SUPABASE_DB_URL");
  if (explicit) return explicit;

  const apiUrl = env("NEXT_PUBLIC_SUPABASE_URL");
  if (!apiUrl) return null;

  let host;
  try {
    host = new URL(apiUrl).hostname;
  } catch {
    return null;
  }
  // Loopback means a real local stack, and `--local` is the right call there.
  if (host === "127.0.0.1" || host === "localhost") return null;

  const port = env("SUPABASE_DB_PORT") ?? DEFAULT_DB_PORT;
  const password = env("SUPABASE_DB_PASSWORD") ?? DEFAULT_DB_PASSWORD;
  return `postgresql://postgres:${password}@${host}:${port}/postgres`;
}

function withSslDisabled(url) {
  return url.includes("sslmode=") ? url : `${url}${url.includes("?") ? "&" : "?"}sslmode=disable`;
}

const dbUrl = resolveDbUrl();
const args = ["supabase", "db", "lint", "--level", "error", "--fail-on", "error"];

if (dbUrl) {
  const full = withSslDisabled(dbUrl);
  // Never print the password — this runs in CI logs and in terminals people paste.
  console.log(`db:lint → ${full.replace(/:\/\/[^@]*@/, "://***@")}`);
  args.push("--db-url", full);
} else {
  console.log("db:lint → local stack (no remote host resolved)");
  args.push("--local");
}

const result = spawnSync("npx", args, { stdio: "inherit", shell: process.platform === "win32" });
process.exit(result.status ?? 1);
