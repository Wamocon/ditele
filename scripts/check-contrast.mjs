#!/usr/bin/env node
// Verifies every text/background token pair in globals.css against WCAG 2.1 AA.
//
// Exists because I-027 slipped through: the plan's contrast table checked
// "brand text on page background" and concluded the palette passed, but a filled
// button actually renders --color-brand-fg ON --color-brand, which nobody
// checked. That pair measured 3.75:1 in dark mode. The same sweep then caught
// --color-fg-subtle at 2.24:1 on white, across 25 usages.
//
// Reading a token table is not verification. Measuring the pairs is.
//
//   node scripts/check-contrast.mjs

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const css = readFileSync(join(root, "src/app/globals.css"), "utf8");

/** Relative luminance per WCAG 2.1. */
function luminance(hex) {
  const channels = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** Pull `--token: #RRGGBB;` out of a css block. */
function readTokens(block) {
  const out = {};
  for (const [, name, value] of block.matchAll(/(--color-[a-z-]+):\s*(#[0-9A-Fa-f]{6})/g)) {
    out[name] = value.toUpperCase();
  }
  return out;
}

const darkStart = css.indexOf('[data-theme="dark"]');
if (darkStart === -1) {
  console.error("Could not find the dark theme block in globals.css");
  process.exit(1);
}

const light = readTokens(css.slice(0, darkStart));
const dark = { ...light, ...readTokens(css.slice(darkStart)) };

// Foreground token -> the surfaces it is actually rendered on.
// `large: true` relaxes the threshold to 3:1 (>=18.66px bold or >=24px regular).
const PAIRS = [
  ["--color-fg", ["--color-bg", "--color-surface", "--color-surface-2"]],
  ["--color-fg-muted", ["--color-bg", "--color-surface", "--color-surface-2"]],
  ["--color-fg-subtle", ["--color-bg", "--color-surface"]],
  ["--color-brand", ["--color-bg", "--color-surface"]],
  ["--color-brand-fg", ["--color-brand", "--color-brand-hover", "--color-brand-active"]],
  ["--color-success", ["--color-bg", "--color-surface", "--color-success-soft"]],
  ["--color-warning", ["--color-bg", "--color-surface", "--color-warning-soft"]],
  ["--color-danger", ["--color-bg", "--color-surface", "--color-danger-soft"]],
  ["--color-info", ["--color-bg", "--color-surface", "--color-info-soft"]],
];

const MIN = 4.5;
let failures = 0;
let checked = 0;

for (const [themeName, tokens] of [["LIGHT", light], ["DARK", dark]]) {
  console.log(`\n${themeName}`);
  for (const [fgToken, bgTokens] of PAIRS) {
    const fg = tokens[fgToken];
    if (!fg) continue;
    for (const bgToken of bgTokens) {
      const bg = tokens[bgToken];
      if (!bg) continue;
      checked += 1;
      const ratio = contrast(fg, bg);
      const ok = ratio >= MIN;
      if (!ok) failures += 1;
      const label = `${fgToken} on ${bgToken}`;
      console.log(
        `  ${ok ? "PASS" : "FAIL"}  ${ratio.toFixed(2).padStart(5)}:1  ${label.padEnd(48)} ${fg} / ${bg}`,
      );
    }
  }
}

console.log(`\n${checked} pairs checked, ${failures} below AA (${MIN}:1).`);
if (failures > 0) {
  console.error("\nContrast check FAILED. Adjust the token, do not lower the threshold.");
  process.exit(1);
}
console.log("Contrast check passed.");
