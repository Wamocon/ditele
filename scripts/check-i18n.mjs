#!/usr/bin/env node
// ---------------------------------------------------------------------------
// i18n coverage gate.
//
//   npm run i18n:check
//
// German is the source of truth (see src/shared/i18n/get-messages.ts). This
// script used to treat English as the reference, so every German key the
// workstreams wrote was reported as "extra" — 32KB of noise nobody could act
// on, which said nothing about how much was actually translated.
//
// What it checks now:
//   FAIL  key exists in a translation but NOT in German -> stale/renamed key
//   FAIL  translated value is an empty string           -> renders blank, which
//                                                          is worse than German
//   WARN  key missing from a translation                -> falls back to German
//                                                          at runtime, by design
//
// Missing translations do not fail the build: the per-key German fallback in
// get-messages.ts makes a partial translation correct, just partial. Dead and
// blank keys DO fail, because both put wrong text on the screen.
// ---------------------------------------------------------------------------
import { readFile } from "node:fs/promises";

const BASE = "de";
const TARGETS = ["en", "ru"];

function flatten(value, prefix = "") {
  return Object.entries(value).flatMap(([key, child]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    if (child && typeof child === "object" && !Array.isArray(child)) return flatten(child, path);
    return [[path, child]];
  });
}

async function load(locale) {
  const raw = await readFile(
    new URL(`../src/shared/i18n/messages/${locale}.json`, import.meta.url),
    "utf8",
  );
  return new Map(flatten(JSON.parse(raw)));
}

const base = await load(BASE);
const baseKeys = [...base.keys()];
let failed = false;

console.log(`i18n coverage — reference: ${BASE}.json (${baseKeys.length} keys)\n`);

for (const locale of TARGETS) {
  const target = await load(locale);

  const dead = [...target.keys()].filter((k) => !base.has(k));
  const blank = [...target.entries()]
    .filter(([k, v]) => base.has(k) && typeof v === "string" && v.trim() === "")
    .map(([k]) => k);
  const missing = baseKeys.filter((k) => !target.has(k));
  const covered = baseKeys.length - missing.length;
  const pct = ((covered / baseKeys.length) * 100).toFixed(1);

  console.log(`${locale}: ${covered}/${baseKeys.length} keys translated (${pct}%)`);

  if (missing.length > 0) {
    // Grouped by top-level namespace so the number is actionable.
    const byNamespace = new Map();
    for (const key of missing) {
      const ns = key.split(".")[0];
      byNamespace.set(ns, (byNamespace.get(ns) ?? 0) + 1);
    }
    const worst = [...byNamespace.entries()].sort((a, b) => b[1] - a[1]);
    console.log(
      `  WARN  ${missing.length} untranslated, falling back to German:`,
      worst.map(([ns, n]) => `${ns}=${n}`).join(" "),
    );
  }

  if (dead.length > 0) {
    failed = true;
    console.log(`  FAIL  ${dead.length} key(s) not present in ${BASE}.json (stale/renamed):`);
    for (const key of dead.slice(0, 10)) console.log(`          ${key}`);
    if (dead.length > 10) console.log(`          … and ${dead.length - 10} more`);
  }

  if (blank.length > 0) {
    failed = true;
    console.log(`  FAIL  ${blank.length} empty translation(s) — these render blank:`);
    for (const key of blank.slice(0, 10)) console.log(`          ${key}`);
  }

  console.log();
}

if (failed) {
  console.error("i18n check FAILED — dead or blank keys put wrong text on screen.");
  process.exit(1);
}
console.log("i18n check passed. Untranslated keys fall back to German by design.");
