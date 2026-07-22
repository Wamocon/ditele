import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";

const files = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "src"], { encoding: "utf8" })
  .split("\n")
  .filter(Boolean)
  .filter((file) => /\.(?:ts|tsx|js|jsx|mjs)$/.test(file));

const forbiddenEverywhere = [
  /NEXT_PUBLIC_[A-Z0-9_]*(?:SERVICE_ROLE|SECRET|PRIVATE|AI_KEY|GROQ|OPENAI)/,
  /dangerouslyAllowBrowser\s*:\s*true/
];

const forbiddenInClientModules = [/SUPABASE_SERVICE_ROLE_KEY/, /getServerEnvironment/];

let failed = false;
for (const file of files) {
  const source = await readFile(file, "utf8");
  const patterns = source.includes('"use client"')
    ? [...forbiddenEverywhere, ...forbiddenInClientModules]
    : forbiddenEverywhere;
  for (const pattern of patterns) {
    if (pattern.test(source)) {
      console.error(`Forbidden client-secret pattern ${pattern} in ${file}`);
      failed = true;
    }
  }
}

/* ── The environment itself, not just the source ──────────────────────────────
 *
 * The scan above reads code. It cannot see a variable typed into the Vercel
 * dashboard — and that is where the dangerous mistake lives, because anything
 * named `NEXT_PUBLIC_*` is inlined into the JavaScript every visitor downloads.
 * The name is the mechanism, so a secret pasted under a public name is public
 * from that moment, with nothing in the code to notice.
 *
 * These checks run at build time, which on Vercel is the last point before the
 * bundle is served.
 */

/** Decodes a JWT payload without verifying it — enough to read `role`/`iss`. */
function jwtPayload(value) {
  const parts = value.split(".");
  if (parts.length !== 3) return null;
  try {
    return JSON.parse(Buffer.from(parts[1], "base64").toString("utf8"));
  } catch {
    return null;
  }
}

const isProductionDeploy =
  process.env.VERCEL_ENV === "production" ||
  (process.env.NODE_ENV === "production" && process.env.VERCEL === "1");

for (const [name, value] of Object.entries(process.env)) {
  if (!name.startsWith("NEXT_PUBLIC_") || !value) continue;

  // A privileged token under a public name. This is the one that matters: a
  // `service_role` key bypasses every RLS policy in the database, so shipping
  // one to the browser hands a stranger the whole dataset. The anon key is
  // fine here — it is public by design and RLS is what protects it.
  const payload = jwtPayload(value);
  if (payload && payload.role && payload.role !== "anon") {
    console.error(
      `${name} holds a JWT with role "${payload.role}". Anything NEXT_PUBLIC_ is ` +
        `inlined into the browser bundle; only the anon key belongs there.`
    );
    failed = true;
  }

  // Local Supabase ships the same signing secret on every machine, so its keys
  // are published in Supabase's own documentation. Deploying with them means
  // anyone can mint a service_role token for this project.
  if (isProductionDeploy && payload && payload.iss === "supabase-demo") {
    console.error(
      `${name} is a stock local-development key (iss "supabase-demo"). Its signing ` +
        `secret is public, so a service_role token can be forged. Use the keys ` +
        `from the hosted Supabase project.`
    );
    failed = true;
  }
}

// Not a secret, but it disables the Arena's defect masking — with it on, the
// planted-bug answer key is served to learners.
if (isProductionDeploy && process.env.DITELE_ARENA_AUTHORING === "1") {
  console.error(
    "DITELE_ARENA_AUTHORING=1 in a production build. It turns off defect masking, " +
      "which publishes the Arena answer key to every learner."
  );
  failed = true;
}

if (failed) process.exit(1);
console.log(`client secret scan passed: ${files.length} source files, environment checked`);
