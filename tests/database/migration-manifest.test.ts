import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const migrationDirectory = resolve(process.cwd(), "supabase/migrations");
const migrations = readdirSync(migrationDirectory)
  .filter((name) => name.endsWith(".sql"))
  .sort();

describe("migration discipline", () => {
  it("uses unique ordered timestamped migration names", () => {
    expect(migrations.length).toBeGreaterThanOrEqual(10);
    expect(new Set(migrations).size).toBe(migrations.length);
    for (const migration of migrations) {
      expect(migration).toMatch(/^\d{14}_[a-z0-9_]+\.sql$/);
    }
  });

  it("does not contain unsupported add-constraint-if-not-exists syntax", () => {
    const sql = migrations
      .map((migration) =>
        readFileSync(resolve(migrationDirectory, migration), "utf8"),
      )
      .join("\n");
    expect(sql.toLowerCase()).not.toMatch(/add\s+constraint\s+if\s+not\s+exists/);
  });

  it("keeps service-role credentials out of migrations", () => {
    const sql = migrations
      .map((migration) =>
        readFileSync(resolve(migrationDirectory, migration), "utf8"),
      )
      .join("\n");
    expect(sql).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(sql).not.toMatch(/sb_secret_[A-Za-z0-9_-]+/);
  });
});

