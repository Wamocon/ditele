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

if (failed) process.exit(1);
console.log(`client secret scan passed: ${files.length} source files`);
