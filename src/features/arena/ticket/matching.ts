/**
 * Ground-truth matching — decision **D2**, and the single mitigation the design
 * names for the trainer-load risk in `05_…` §6.
 *
 * The arithmetic there is worth restating, because it is why this file exists:
 * ten students × one hunt per milestone × six milestones is **sixty free-text
 * defect reports per cohort**, each needing real judgement. A trainer covering
 * three cohorts would do nothing else. This module's job is to turn "read a
 * report cold and work out what it is about" into "confirm or overrule a
 * ranked suggestion".
 *
 * ## Two rules it will not break
 *
 * 1. **It never decides.** `06_…` §8 is explicit: *the matching must never
 *    auto-accept. It ranks and annotates.* Nothing here writes to the database;
 *    `planted_code` is only ever set by `decide_hunt_finding`, from a human's
 *    click. A trainer who disagrees overrules in one click and *that* is what
 *    is recorded.
 * 2. **It is honest about not knowing.** A weak match presented confidently is
 *    worse than no match: it teaches the trainer to click through, and the
 *    moment they do that, D2 has produced a rubber stamp rather than a
 *    shortcut. Scores below `MIN_SUGGESTION_SCORE` are not returned at all, and
 *    the confidence band is deliberately conservative.
 *
 * ## Why hand-rolled tokens and not a library
 *
 * No new npm dependencies, ever — and the design was written to need none. The
 * scale here makes that easy: a handful of planted defects against one report,
 * a few hundred tokens in total, recomputed per review.
 *
 * No server imports: the trainer panel is interactive, so this has to run in
 * the browser as well as on the server.
 */

import type { DefectReport } from "@/features/learning/model";
import type { HuntFinding, HuntScenario } from "@/features/arena/model";

/* ── The scenario configuration, read defensively ─────────────────────────── */

/**
 * One planted defect, as the design specifies it in `05_…` §G1:
 *
 * ```jsonc
 * { "code": "TOTAL_IGNORES_DISCOUNT", "severity": "high",
 *   "surface": "cart-summary", "trigger": "coupon applied" }
 * ```
 *
 * ⚠️ **WS-9 owns this shape**, and authors it in
 * `src/features/arena/sandbox/README.md`. WS-9 and WS-10 ran in parallel, so
 * every field below is optional and every reader here tolerates its absence:
 * the only thing this module truly requires is `code`. If WS-9 adds a richer
 * description field later, feed it in through `keywords` or `description` and
 * matching improves with no change to this file.
 */
export interface PlantedDefect {
  code: string;
  severity: string | null;
  surface: string | null;
  trigger: string | null;
  description: string | null;
  /** Extra words a report about this defect is likely to use. Optional. */
  keywords: string[];
  /**
   * A decoy is odd-looking but correct behaviour, or a known non-bug. It is
   * matched exactly like a planted defect and then flagged, because
   * "this student reported a known non-bug" is the single most useful thing
   * this panel can tell a trainer — `05_…` §G1 notes that without a registry of
   * known non-bugs, trainers see the same wrong report from every student
   * forever.
   */
  decoy: boolean;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map(asString).filter((entry): entry is string => entry !== null);
}

/** One entry of `planted` / `decoys`, which may be a bare code or an object. */
function toPlanted(value: unknown, decoy: boolean): PlantedDefect | null {
  if (typeof value === "string") {
    const code = value.trim();
    return code.length === 0
      ? null
      : {
          code,
          severity: null,
          surface: null,
          trigger: null,
          description: null,
          keywords: [],
          decoy,
        };
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;

  const row = value as Record<string, unknown>;
  const code = asString(row.code);
  if (code === null) return null;

  return {
    code,
    severity: asString(row.severity),
    surface: asString(row.surface),
    trigger: asString(row.trigger),
    description: asString(row.description) ?? asString(row.title),
    keywords: asStringArray(row.keywords),
    decoy,
  };
}

/**
 * The planted list and the decoy list out of a scenario's `configuration`.
 *
 * Returns `[]` for anything it does not recognise rather than throwing. A
 * half-authored scenario must degrade to "no suggestions" — a panel that says
 * nothing is recoverable, a panel that crashes takes the review screen down
 * with it, and `hunt_scenarios` was empty on the live database when this was
 * written.
 */
export function readPlantedDefects(
  configuration: Record<string, unknown> | null | undefined,
): PlantedDefect[] {
  if (!configuration) return [];

  const planted = Array.isArray(configuration.planted) ? configuration.planted : [];
  const decoys = Array.isArray(configuration.decoys) ? configuration.decoys : [];

  const rows = [
    ...planted.map((entry) => toPlanted(entry, false)),
    ...decoys.map((entry) => toPlanted(entry, true)),
  ].filter((entry): entry is PlantedDefect => entry !== null);

  // A code appearing in both lists is a content error. Planted wins: treating a
  // real defect as a decoy would mark a correct report wrong, which is the more
  // damaging of the two mistakes.
  const seen = new Map<string, PlantedDefect>();
  for (const row of rows) {
    const existing = seen.get(row.code);
    if (!existing || (existing.decoy && !row.decoy)) seen.set(row.code, row);
  }
  return [...seen.values()];
}

/* ── Tokens ───────────────────────────────────────────────────────────────── */

/**
 * German stop words, plus the handful of English ones that leak in through
 * defect codes. Kept short on purpose: an over-long list starts removing words
 * that carry meaning in a bug report ("nicht", "kein" and "ohne" are *exactly*
 * what distinguishes "total ignores discount" from "total applies discount",
 * so they stay in).
 */
const STOP_WORDS = new Set([
  "aber", "alle", "als", "also", "auch", "auf", "aus", "bei", "bin", "bis",
  "das", "dass", "dem", "den", "der", "des", "die", "dies", "doch", "dort",
  "durch", "ein", "eine", "einem", "einen", "einer", "eines", "für", "hat",
  "hier", "ich", "ist", "man", "mit", "nach", "noch", "nur", "oder", "sehr",
  "sich", "sind", "über", "und", "vom", "von", "vor", "war", "was", "wenn",
  "werden", "wie", "wird", "zum", "zur",
  "and", "are", "for", "not", "the", "then", "this", "was", "when", "with",
]);

/**
 * Fold German text to a comparable form: lowercase, umlauts expanded the way
 * Germans actually type them when the keyboard fights back (`ä` → `ae`), `ß`
 * → `ss`, everything else split on non-letters.
 *
 * Expanding rather than stripping matters. A student writing "Groesse" and a
 * scenario saying "Größe" have to collide, and `ö` → `o` would give "grosse"
 * against "groesse" — two tokens that never meet.
 */
export function tokenize(text: string): string[] {
  const folded = text
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    // SCREAMING_SNAKE and kebab-case both become word boundaries, so
    // TOTAL_IGNORES_DISCOUNT and "cart-summary" tokenize like prose.
    .replace(/[^a-z0-9]+/g, " ");

  return folded
    .split(" ")
    .filter((token) => token.length >= 3 && !STOP_WORDS.has(token));
}

/** Every word a report offers, from every field the student filled in. */
function reportTokens(report: DefectReport): Set<string> {
  const text = [
    report.summary,
    report.description,
    report.steps,
    report.expected,
    report.actual,
    report.environment,
  ].join(" ");
  return new Set(tokenize(text));
}

/**
 * How much a code token counts relative to a staging token.
 *
 * The code is the defect's *identity* — `TOTAL_IGNORES_DISCOUNT` is a sentence
 * describing the wrong behaviour, and a student who saw that behaviour will
 * reach for those words. `surface` and `trigger` are staging notes for the
 * author: "cart-summary" is a component name and "coupon applied" is a setup
 * step, and a perfectly good report can describe the defect precisely without
 * echoing either.
 *
 * Weighting them equally is what a first version did, and it measurably
 * mis-ranked: a correct, terse report scored below the suggestion floor purely
 * because it had not repeated the author's internal component name.
 */
const CODE_TOKEN_WEIGHT = 2;
const CONTEXT_TOKEN_WEIGHT = 1;

/**
 * Every word a planted defect offers about itself, with how much each one
 * counts as evidence.
 */
function plantedTokens(defect: PlantedDefect): Map<string, number> {
  const weights = new Map<string, number>();

  for (const token of tokenize(defect.code)) {
    weights.set(token, CODE_TOKEN_WEIGHT);
  }

  const context = [
    defect.surface ?? "",
    defect.trigger ?? "",
    defect.description ?? "",
    ...defect.keywords,
  ].join(" ");

  for (const token of tokenize(context)) {
    // A word in both the code and the context keeps the higher weight rather
    // than being counted twice.
    if (!weights.has(token)) weights.set(token, CONTEXT_TOKEN_WEIGHT);
  }

  return weights;
}

/* ── Scoring ──────────────────────────────────────────────────────────────── */

/**
 * Below this, a suggestion is not shown at all.
 *
 * Tuned to be *unhelpful rather than misleading*. A trainer who is shown three
 * weak guesses on every review stops reading them within a day, and D2 has then
 * cost a click instead of saving one.
 */
export const MIN_SUGGESTION_SCORE = 0.34;

/** Above this, the panel says "likely match" rather than "possible match". */
export const STRONG_SUGGESTION_SCORE = 0.6;

export type MatchConfidence = "strong" | "possible";

export interface MatchSuggestion {
  defect: PlantedDefect;
  /** 0…1. Comparable between defects **within one report**, not across reports. */
  score: number;
  confidence: MatchConfidence;
  /** The words that actually drove the match — the panel shows these. */
  overlap: string[];
  /** True when the student named the defect code outright. */
  namedExactly: boolean;
}

/**
 * How well one report matches one planted defect.
 *
 * **Weighted coverage, not Jaccard.** The measure is "how much of what we know
 * about this defect did the student say", not "how similar are the two texts".
 * Symmetric similarity punishes a thorough report — a student who writes five
 * detailed reproduction steps would score *lower* than one who wrote a
 * six-word summary, because their extra words dilute the intersection. That is
 * backwards: thoroughness is the thing being taught.
 *
 * The weights (see `CODE_TOKEN_WEIGHT`) are what stop the author's internal
 * component names from outvoting the defect's own description.
 */
function scoreAgainst(defect: PlantedDefect, tokens: Set<string>): MatchSuggestion | null {
  const wanted = plantedTokens(defect);
  if (wanted.size === 0) return null;

  let available = 0;
  let matched = 0;
  const overlap: string[] = [];
  for (const [token, weight] of wanted) {
    available += weight;
    if (tokens.has(token)) {
      matched += weight;
      overlap.push(token);
    }
  }

  let score = available === 0 ? 0 : matched / available;

  // Naming the code outright is not evidence, it is proof. It also cannot
  // happen by accident — these codes are not shown to students.
  const namedExactly = tokenize(defect.code).every((token) => tokens.has(token));
  if (namedExactly) score = 1;

  if (score < MIN_SUGGESTION_SCORE) return null;

  return {
    defect,
    score,
    confidence: score >= STRONG_SUGGESTION_SCORE ? "strong" : "possible",
    overlap: overlap.sort(),
    namedExactly,
  };
}

/**
 * Every planted defect this report might be about, best first.
 *
 * Ranked, capped and never empty-by-exception. The cap exists for the same
 * reason `MIN_SUGGESTION_SCORE` does: a list is a shortcut, a long list is
 * homework.
 */
export function rankMatches(
  report: DefectReport,
  planted: PlantedDefect[],
  limit = 3,
): MatchSuggestion[] {
  const tokens = reportTokens(report);
  if (tokens.size === 0) return [];

  return planted
    .map((defect) => scoreAgainst(defect, tokens))
    .filter((match): match is MatchSuggestion => match !== null)
    .sort((left, right) =>
      right.score - left.score || left.defect.code.localeCompare(right.defect.code),
    )
    .slice(0, limit);
}

/* ── Completeness ─────────────────────────────────────────────────────────── */

/**
 * "Whether all required fields are present" — the other half of what `06_…` §8
 * asks the trainer panel to show.
 *
 * The point is not to grade. It is to let a trainer see, without reading, that
 * a report is missing its reproduction steps — the single most common reason a
 * report has to go back — and to make "all fields present, matches a planted
 * bug" visible at a glance, which is the case `05_…` §6 suggests could one day
 * be provisionally accepted and spot-checked.
 */
export interface FieldPresence {
  field: keyof DefectReport;
  present: boolean;
  /** False for the fields WS-10 added, which are optional by design. */
  required: boolean;
}

/**
 * The five original fields are required; the four WS-10 added are not.
 *
 * That split is deliberate and matches `isDefectComplete`: making a label or a
 * screenshot mandatory would block a submit that used to succeed. A trainer
 * still sees whether they are there — an unlabelled report is worth a nudge,
 * just not a rejection.
 */
const REQUIRED_FIELDS: (keyof DefectReport)[] = [
  "summary",
  "sourceUri",
  "steps",
  "expected",
  "actual",
];

const OPTIONAL_FIELDS: (keyof DefectReport)[] = [
  "description",
  "labels",
  "environment",
  "screenshotIds",
];

function hasContent(value: DefectReport[keyof DefectReport]): boolean {
  if (Array.isArray(value)) return value.length > 0;
  return typeof value === "string" && value.trim().length > 0;
}

export interface ReportCompleteness {
  fields: FieldPresence[];
  /** Every required field filled — the same bar `isDefectComplete` applies. */
  complete: boolean;
  missingRequired: (keyof DefectReport)[];
}

export function describeCompleteness(report: DefectReport): ReportCompleteness {
  const fields: FieldPresence[] = [
    ...REQUIRED_FIELDS.map((field) => ({
      field,
      present: hasContent(report[field]),
      required: true,
    })),
    ...OPTIONAL_FIELDS.map((field) => ({
      field,
      present: hasContent(report[field]),
      required: false,
    })),
  ];

  const missingRequired = fields
    .filter((entry) => entry.required && !entry.present)
    .map((entry) => entry.field);

  return { fields, complete: missingRequired.length === 0, missingRequired };
}

/* ── "2 of 5 found" ───────────────────────────────────────────────────────── */

export interface HuntGroundTruth {
  /** Planted defects a trainer has already confirmed on this hunt. */
  confirmedCodes: string[];
  /** Planted defects nobody has found yet. Never shown to the student. */
  outstanding: PlantedDefect[];
  found: number;
  expected: number;
  complete: boolean;
}

/**
 * The scoreboard line decision D2 promises: *"matches TOTAL_IGNORES_DISCOUNT —
 * 2 of 5 found"*.
 *
 * `expected` comes from `hunt_scenarios.expected_findings` and **not** from
 * counting `planted`, because a scenario may deliberately plant more defects
 * than it demands — that is how a hunt stays passable while still rewarding the
 * student who keeps digging.
 *
 * `bonus` findings count towards `found` and are deliberately not capped, so a
 * learner can exceed the target. WS-8's `huntProgress` makes the same choice;
 * this reuses that decision rather than making a second one.
 */
export function describeGroundTruth(
  findings: HuntFinding[],
  planted: PlantedDefect[],
  scenario: HuntScenario | null,
): HuntGroundTruth {
  const confirmedCodes = findings
    .filter((finding) => finding.verdict === "confirmed" && finding.plantedCode)
    .map((finding) => finding.plantedCode as string);

  const confirmed = new Set(confirmedCodes);
  const found = findings.filter(
    (finding) => finding.verdict === "confirmed" || finding.verdict === "bonus",
  ).length;

  // A decoy is never outstanding: nobody is meant to find it, and listing it as
  // "still to find" would invert the lesson it exists to teach.
  const outstanding = planted.filter(
    (defect) => !defect.decoy && !confirmed.has(defect.code),
  );

  const expected = scenario?.expectedFindings ?? planted.filter((d) => !d.decoy).length;

  return {
    confirmedCodes: [...confirmed].sort(),
    outstanding,
    found,
    expected,
    complete: expected > 0 && found >= expected,
  };
}
