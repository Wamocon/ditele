import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypeScript from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTypeScript,
  globalIgnores([
    ".next/**",
    // Per-workstream dev build output (NEXT_DIST_DIR=.next-ws<n>). Generated
    // code, and without this it drowns the report in ~7600 false problems.
    ".next-*/**",
    "coverage/**",
    "playwright-report/**",
    "test-results/**",
    "src/shared/database/database.types.ts",
  ]),
]);
