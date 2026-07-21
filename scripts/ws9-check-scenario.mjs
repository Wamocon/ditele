#!/usr/bin/env node
// ---------------------------------------------------------------------------
// WS-9 — prove the seed and the scenario source say the same thing.
//
//   node scripts/ws9-check-scenario.mjs
//
// `supabase/seed_arena_scenarios.sql` embeds the `configuration` jsonb from
// `src/features/arena/sandbox/scenarios/<code>.json` verbatim. Those two
// drifting apart is the worst failure this workstream can produce, because it
// is invisible: the author previews a scenario with `?draft=1`, it behaves
// correctly, they seed a slightly different document, and from then on every
// learner hunts a scenario nobody ever reviewed. This diffs them.
//
// It also re-checks the things the engine checks at render time, so a bad
// scenario fails here — in a gate, in seconds — rather than in front of a
// learner: every surface component known, every effect supported by the
// component its surface names, unique codes, and `expected_findings` equal to
// the number of PLANTED defects (decoys and known non-bugs never count).
//
// No dependencies, no database. It reads two files.
// ---------------------------------------------------------------------------
import { readFile, readdir } from "node:fs/promises";

const SEED = new URL("../supabase/seed_arena_scenarios.sql", import.meta.url);
const SCENARIO_DIR = new URL("../src/features/arena/sandbox/scenarios/", import.meta.url);
const EFFECTS_FILE = new URL("../src/features/arena/sandbox/surface-effects.ts", import.meta.url);

let failed = false;
const fail = (message) => {
  failed = true;
  console.error(`  FAIL  ${message}`);
};

/**
 * The supported-effect table, read out of the TypeScript rather than copied
 * into this script. A second copy would be one more thing to keep in step, and
 * keeping things in step is the entire subject of this file.
 */
async function loadSurfaceEffects() {
  const source = await readFile(EFFECTS_FILE, "utf8");
  const body = source.slice(
    source.indexOf("{", source.indexOf("export const SURFACE_EFFECTS")),
    source.lastIndexOf("} as const satisfies") + 1,
  );
  // Strip comments, then read it as a JS literal. The table is a plain object
  // of string arrays; nothing here executes anything the file did not contain.
  const stripped = body.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  return new Function(`return ${stripped}`)();
}

/** Every dollar-quoted `$config$…$config$` block in the seed, parsed. */
function seedConfigurations(sql) {
  return [...sql.matchAll(/\$config\$([\s\S]*?)\$config\$/g)].map((match) =>
    JSON.parse(match[1]),
  );
}

function checkScenario(document, effects) {
  const { code, configuration, expectedFindings } = document;
  const surfaceIds = new Map();

  for (const surface of configuration.surfaces ?? []) {
    if (surfaceIds.has(surface.id)) fail(`${code}: surface id "${surface.id}" is used twice`);
    surfaceIds.set(surface.id, surface.component);
    if (!(surface.component in effects)) {
      fail(`${code}: surface "${surface.id}" names unknown component "${surface.component}"`);
    }
  }

  const seen = new Set();
  let planted = 0;
  for (const defect of configuration.defects ?? []) {
    if (seen.has(defect.code)) fail(`${code}: defect code "${defect.code}" is used twice`);
    seen.add(defect.code);
    if (defect.kind === "planted") planted += 1;

    const component = surfaceIds.get(defect.surface);
    if (component === undefined) {
      fail(`${code}: defect "${defect.code}" targets surface "${defect.surface}", which is not rendered`);
      continue;
    }
    if (!defect.effect) {
      if (defect.kind !== "known_non_bug") {
        fail(`${code}: defect "${defect.code}" is ${defect.kind} but arms no effect`);
      }
      continue;
    }
    if (!(effects[component] ?? []).includes(defect.effect)) {
      fail(`${code}: defect "${defect.code}" arms "${defect.effect}", unsupported by "${component}"`);
    }
  }

  if (planted !== expectedFindings) {
    fail(`${code}: expectedFindings is ${expectedFindings} but ${planted} defects are planted`);
  }

  // The contract in README.md claims all three capabilities. A reference
  // scenario that does not use one has not proven it.
  const kinds = new Set((configuration.defects ?? []).map((defect) => defect.kind));
  const triggers = new Set((configuration.defects ?? []).map((defect) => defect.trigger?.type));
  return { planted, total: seen.size, kinds, triggers };
}

const effects = await loadSurfaceEffects();
const sql = await readFile(SEED, "utf8");
const seeded = new Map(
  seedConfigurations(sql).map((configuration, index) => [index, configuration]),
);

const files = (await readdir(SCENARIO_DIR)).filter((name) => name.endsWith(".json"));
console.log(`ws9 scenario check — ${files.length} scenario file(s), ${seeded.size} seeded block(s)\n`);

if (files.length !== seeded.size) {
  fail(`${files.length} scenario file(s) but ${seeded.size} configuration block(s) in the seed`);
}

for (const [index, file] of files.entries()) {
  const document = JSON.parse(await readFile(new URL(file, SCENARIO_DIR), "utf8"));
  const summary = checkScenario(document, effects);

  const seededConfiguration = seeded.get(index);
  if (!seededConfiguration) {
    fail(`${document.code}: no configuration block in the seed`);
  } else if (
    JSON.stringify(seededConfiguration) !== JSON.stringify(document.configuration)
  ) {
    fail(`${document.code}: the seed's configuration differs from ${file}`);
  }

  console.log(
    `${document.code} v${document.scenarioVersion}: ${summary.planted} planted, ` +
      `${summary.total} defects total, kinds [${[...summary.kinds].join(", ")}], ` +
      `triggers [${[...summary.triggers].join(", ")}]`,
  );
}

console.log();
if (failed) {
  console.error("ws9 scenario check FAILED — the seed and the source disagree, or a scenario is unrenderable.");
  process.exit(1);
}
console.log("ws9 scenario check passed.");
