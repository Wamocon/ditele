import { readFile } from "node:fs/promises";

const locales = ["en", "de", "ru"];

function flatten(value, prefix = "") {
  return Object.entries(value).flatMap(([key, child]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    if (child && typeof child === "object" && !Array.isArray(child)) {
      return flatten(child, path);
    }
    return [path];
  });
}

const dictionaries = await Promise.all(
  locales.map(async (locale) => {
    const raw = await readFile(new URL(`../src/shared/i18n/messages/${locale}.json`, import.meta.url), "utf8");
    return [locale, new Set(flatten(JSON.parse(raw)))];
  })
);

const reference = dictionaries[0][1];
let failed = false;

for (const [locale, keys] of dictionaries) {
  const missing = [...reference].filter((key) => !keys.has(key));
  const extra = [...keys].filter((key) => !reference.has(key));
  if (missing.length || extra.length) {
    failed = true;
    console.error(`${locale}: missing=${missing.join(",") || "none"} extra=${extra.join(",") || "none"}`);
  }
}

if (failed) process.exit(1);
console.log(`i18n parity passed: ${reference.size} keys across ${locales.join(", ")}`);
