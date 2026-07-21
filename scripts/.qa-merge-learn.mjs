// Merge a translated `learn` subtree into en.json / ru.json.
// Validates against de.json: no missing keys, no extra keys, same placeholders.
import { readFileSync, writeFileSync } from "node:fs";

const SCRATCH = process.argv[2];
const de = JSON.parse(readFileSync("src/shared/i18n/messages/de.json", "utf8"));

function keys(o, p = "", acc = []) {
  for (const [k, v] of Object.entries(o)) {
    const kp = p ? `${p}.${k}` : k;
    if (v && typeof v === "object" && !Array.isArray(v)) keys(v, kp, acc);
    else acc.push(kp);
  }
  return acc;
}
function get(o, p) { return p.split(".").reduce((a, k) => (a == null ? a : a[k]), o); }
const ph = (s) => [...String(s).matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(",");

let bad = 0;
for (const locale of ["en", "ru"]) {
  const tree = JSON.parse(readFileSync(`${SCRATCH}/learn-${locale}.json`, "utf8"));
  const deKeys = keys(de.learn), trKeys = keys(tree);
  const missing = deKeys.filter((k) => !trKeys.includes(k));
  const extra = trKeys.filter((k) => !deKeys.includes(k));
  const blank = deKeys.filter((k) => typeof get(tree, k) === "string" && get(tree, k).trim() === "");
  const phMismatch = deKeys
    .filter((k) => trKeys.includes(k))
    .filter((k) => ph(get(de.learn, k)) !== ph(get(tree, k)));

  console.log(`\n=== ${locale} ===`);
  console.log(`  keys: ${trKeys.length}/${deKeys.length}`);
  if (missing.length) { console.log(`  MISSING: ${missing.join(", ")}`); bad++; }
  if (extra.length) { console.log(`  EXTRA:   ${extra.join(", ")}`); bad++; }
  if (blank.length) { console.log(`  BLANK:   ${blank.join(", ")}`); bad++; }
  if (phMismatch.length) {
    for (const k of phMismatch) {
      console.log(`  PLACEHOLDER ${k}: de={${ph(get(de.learn, k))}} ${locale}={${ph(get(tree, k))}}`);
    }
    bad++;
  }
  if (!missing.length && !extra.length && !blank.length && !phMismatch.length) console.log("  ok");

  if (process.env.WRITE === "1") {
    const file = `src/shared/i18n/messages/${locale}.json`;
    const target = JSON.parse(readFileSync(file, "utf8"));
    // Keep the target file's own key order and slot `learn` in after `learner`.
    // Reordering the whole file would blow the diff up for whoever else is
    // editing these catalogues right now.
    const merged = {};
    for (const k of Object.keys(target)) {
      merged[k] = target[k];
      if (k === "learner") merged.learn = tree;
    }
    if (!merged.learn) merged.learn = tree;
    writeFileSync(file, `${JSON.stringify(merged, null, 2)}\n`, "utf8");
    console.log(`  written -> ${file}`);
  }
}
process.exit(bad > 0 ? 1 : 0);
