import { readFileSync, readdirSync } from "node:fs";
import { join, relative, resolve } from "node:path";

import { describe, expect, it } from "vitest";

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.(?:ts|tsx)$/.test(entry.name) ? [path] : [];
  });
}

describe("organization administrator route containment", () => {
  it("does not admit organization administrators anywhere below the admin route", () => {
    const root = resolve(process.cwd(), "src/app/[locale]/admin");
    const offenders = sourceFiles(root)
      .filter((path) => readFileSync(path, "utf8").includes("organization_admin"))
      .map((path) => relative(process.cwd(), path));

    expect(offenders).toEqual([]);
  });

  it("keeps the blocked organization overview free of organization data access", () => {
    const path = resolve(
      process.cwd(),
      "src/app/[locale]/organization/page.tsx",
    );
    const source = readFileSync(path, "utf8");

    expect(source).not.toContain("createServerClient");
    expect(source).not.toContain(".from(");
    expect(source).not.toContain(".rpc(");
  });
});
