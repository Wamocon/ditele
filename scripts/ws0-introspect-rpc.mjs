// WS-0 Task 1b — introspect the LIVE database's RPC signatures.
// Source of truth for plan/status/RPC_CONTRACTS.md. Nobody guesses argument names.
//
//   node --env-file=.env.local scripts/ws0-introspect-rpc.mjs > rpc-dump.json
//
// PostgREST serves an OpenAPI 2.0 document at the REST root. With the service
// role key it exposes every table and every RPC in the exposed schema, including
// exact parameter names and types.
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !service) {
  console.error("MISSING ENV");
  process.exit(1);
}

const res = await fetch(`${url}/rest/v1/`, {
  headers: { apikey: service, Authorization: `Bearer ${service}`, Accept: "application/openapi+json" },
});
if (!res.ok) {
  console.error("OpenAPI fetch failed:", res.status, await res.text());
  process.exit(1);
}
const spec = await res.json();

const rpcs = {};
const tables = {};

for (const [path, ops] of Object.entries(spec.paths ?? {})) {
  if (path.startsWith("/rpc/")) {
    const name = path.slice(5);
    const post = ops.post ?? {};
    const bodyParam = (post.parameters ?? []).find((p) => p.in === "body");
    const schema = bodyParam?.schema ?? {};
    rpcs[name] = {
      args: Object.entries(schema.properties ?? {}).map(([argName, argSchema]) => ({
        name: argName,
        type: argSchema.format ?? argSchema.type ?? "unknown",
        required: (schema.required ?? []).includes(argName),
      })),
      required: schema.required ?? [],
      description: post.description ?? null,
    };
  } else if (path !== "/" && !path.includes("{")) {
    tables[path.slice(1)] = true;
  }
}

// Column detail for every table/view, from the definitions block.
const definitions = {};
for (const [defName, def] of Object.entries(spec.definitions ?? {})) {
  definitions[defName] = Object.entries(def.properties ?? {}).map(([col, c]) => ({
    name: col,
    type: c.format ?? c.type ?? "unknown",
    description: c.description ?? null,
  }));
}

console.log(
  JSON.stringify(
    {
      info: spec.info ?? null,
      rpcCount: Object.keys(rpcs).length,
      tableCount: Object.keys(tables).length,
      rpcs,
      tables: Object.keys(tables).sort(),
      definitions,
    },
    null,
    2
  )
);
