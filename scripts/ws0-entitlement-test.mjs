// WS-0 — can an admin session create the `entitlements` row that
// request_enrollment demands? If yes, seed-mock.mjs can be unblocked.
import { createClient } from "@supabase/supabase-js";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const c = createClient(url, anon, { auth: { persistSession: false } });
await c.auth.signInWithPassword({ email: "admin@ditele.local", password: "123123123" });

const { data: rows, error } = await c.from("entitlements").select("*");
console.log("existing entitlements:", error ? `ERR ${error.code}: ${error.message}` : JSON.stringify(rows, null, 2));

const svc = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const { data: users } = await svc.auth.admin.listUsers({ perPage: 200 });
const l1 = users.users.find((u) => u.email === "learner1@ditele.local");
console.log("learner1 id:", l1?.id);

if (l1) {
  const ins = await c.from("entitlements").insert({
    organization_id: "01980a10-0000-7000-8000-000000000001",
    user_id: l1.id,
    capability: "learning",
    valid_from: new Date(Date.now() - 86400000).toISOString(),
  }).select();
  console.log("insert entitlement:", ins.error ? `ERR ${ins.error.code}: ${ins.error.message} | ${ins.error.details ?? ""}` : JSON.stringify(ins.data));
}
