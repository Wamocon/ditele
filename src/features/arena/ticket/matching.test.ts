import { describe, expect, it } from "vitest";
// The real file WS-9 ships, not a copy of it. A fixture would keep passing
// while the shipped scenario drifted underneath it.
import CHECKOUT_V1 from "@/features/arena/sandbox/scenarios/checkout-v1.json";
import { EMPTY_DEFECT, type DefectReport } from "@/features/learning/model";
import type { HuntFinding, HuntScenario } from "@/features/arena/model";
import {
  MIN_SUGGESTION_SCORE,
  describeCompleteness,
  describeGroundTruth,
  rankMatches,
  readPlantedDefects,
  tokenize,
} from "./matching";

/**
 * The matching engine is the whole of decision D2 and the only mitigation the
 * design names for the trainer-load risk. It also runs against a
 * `configuration` shape **WS-9 owns and authored in parallel with this file**,
 * so the cases that matter most are the malformed ones: a scenario this build
 * does not understand must degrade to "no suggestions", never to an exception
 * on the review screen.
 */

const report = (overrides: Partial<DefectReport> = {}): DefectReport => ({
  ...EMPTY_DEFECT,
  ...overrides,
});

const CHECKOUT_CONFIG = {
  scenario: "checkout-v1",
  planted: [
    {
      code: "TOTAL_IGNORES_DISCOUNT",
      severity: "high",
      surface: "cart-summary",
      trigger: "coupon applied",
    },
    {
      code: "QTY_ACCEPTS_NEGATIVE",
      severity: "medium",
      surface: "line-item",
      trigger: "type -1 into quantity",
    },
  ],
  decoys: ["SLOW_IMAGE_LOAD"],
};

describe("readPlantedDefects", () => {
  it("reads the shape 05_… §G1 specifies", () => {
    const planted = readPlantedDefects(CHECKOUT_CONFIG);
    expect(planted).toHaveLength(3);
    expect(planted.find((d) => d.code === "TOTAL_IGNORES_DISCOUNT")?.surface).toBe(
      "cart-summary",
    );
  });

  it("marks decoys as decoys, including bare-string ones", () => {
    const decoy = readPlantedDefects(CHECKOUT_CONFIG).find(
      (d) => d.code === "SLOW_IMAGE_LOAD",
    );
    expect(decoy?.decoy).toBe(true);
  });

  // WS-9 owns the configuration shape. Every one of these is a scenario this
  // build does not understand, and none may take the review screen down.
  it.each([
    ["null", null],
    ["undefined", undefined],
    ["an empty object", {}],
    ["planted as a string", { planted: "TOTAL_IGNORES_DISCOUNT" }],
    ["planted holding nulls", { planted: [null, 42, {}] }],
    ["entries with no code", { planted: [{ severity: "high" }] }],
  ])("degrades to an empty list for %s", (_label, configuration) => {
    expect(
      readPlantedDefects(configuration as Record<string, unknown> | null),
    ).toEqual([]);
  });

  it("lets planted win when a code is in both lists", () => {
    const planted = readPlantedDefects({
      planted: [{ code: "SHARED" }],
      decoys: ["SHARED"],
    });
    // Treating a real defect as a decoy would mark a correct report wrong,
    // which is the more damaging of the two mistakes.
    expect(planted).toHaveLength(1);
    expect(planted[0]?.decoy).toBe(false);
  });
});

/**
 * ⭐ The compatibility test that matters most.
 *
 * WS-9 authored the configuration shape in parallel with this engine, and what
 * they shipped is **not** the sketch in `05_…` §G1: one `defects` list with a
 * per-entry `kind`, rather than `planted` + `decoys`. A reader written to the
 * sketch returns `[]` here — and `[]` renders as "no suggestions", which looks
 * like a working panel with nothing to say rather than a broken one.
 *
 * Reading the real file rather than a copy of it is deliberate. A fixture would
 * pass forever while the shipped scenario drifted underneath it, which is the
 * failure this test exists to prevent.
 */
describe("the reference scenario WS-9 actually shipped", () => {
  it("reads all six defects out of checkout-v1.json", () => {
    const planted = readPlantedDefects(
      CHECKOUT_V1.configuration as unknown as Record<string, unknown>,
    );
    expect(planted).toHaveLength(6);
  });

  it("classifies decoy AND known_non_bug as not-a-defect", () => {
    const planted = readPlantedDefects(
      CHECKOUT_V1.configuration as unknown as Record<string, unknown>,
    );
    const nonBugs = planted.filter((d) => d.decoy).map((d) => d.code).sort();
    expect(nonBugs).toEqual(["SHIPPING_NOT_FREE_BELOW_THRESHOLD", "SLOW_THUMBNAIL"]);
  });

  it("survives the object-shaped trigger without tokenizing the regex", () => {
    const email = readPlantedDefects(
      CHECKOUT_V1.configuration as unknown as Record<string, unknown>,
    ).find((d) => d.code === "EMAIL_VALIDATION_BYPASS");
    // { type: 'whenInput', field: 'email', pattern: '^[^\\s@]+@…' }
    expect(email?.trigger).toBe("whenInput email");
  });

  it("matches a German report written the way a student would write it", () => {
    const planted = readPlantedDefects(
      CHECKOUT_V1.configuration as unknown as Record<string, unknown>,
    );
    const matches = rankMatches(
      report({
        summary: "Gutschein wird nicht von der Gesamtsumme abgezogen",
        steps: "1. Gutscheincode WMC10 in der Bestellübersicht eingeben\n2. Auf Einlösen klicken",
        expected: "Die Rabattzeile wird angezeigt und die Gesamtsumme sinkt",
        actual: "Die Rabattzeile erscheint, die Gesamtsumme bleibt gleich",
      }),
      planted,
    );
    expect(matches[0]?.defect.code).toBe("TOTAL_IGNORES_DISCOUNT");
  });

  it("flags a report about the decoy as the known non-bug it is", () => {
    const planted = readPlantedDefects(
      CHECKOUT_V1.configuration as unknown as Record<string, unknown>,
    );
    const matches = rankMatches(
      report({
        summary: "Produktbilder im Warenkorb laden zu langsam",
        actual: "Die Produktbilder erscheinen erst eine Sekunde nach dem Rest der Seite",
      }),
      planted,
    );
    expect(matches[0]?.defect.code).toBe("SLOW_THUMBNAIL");
    expect(matches[0]?.defect.decoy).toBe(true);
  });

  it("agrees with the scenario's own expectedFindings", () => {
    const planted = readPlantedDefects(
      CHECKOUT_V1.configuration as unknown as Record<string, unknown>,
    );
    expect(planted.filter((d) => !d.decoy)).toHaveLength(CHECKOUT_V1.expectedFindings);
  });
});

describe("tokenize", () => {
  it("splits SCREAMING_SNAKE and kebab-case into words", () => {
    expect(tokenize("TOTAL_IGNORES_DISCOUNT")).toEqual(["total", "ignores", "discount"]);
    expect(tokenize("cart-summary")).toEqual(["cart", "summary"]);
  });

  it("expands umlauts rather than stripping them, so Groesse meets Größe", () => {
    expect(tokenize("Größe")).toEqual(tokenize("Groesse"));
    expect(tokenize("Straße")).toEqual(["strasse"]);
  });

  it("keeps negations — they are what distinguishes two opposite defects", () => {
    expect(tokenize("Rabatt wird nicht abgezogen")).toContain("nicht");
  });
});

describe("rankMatches", () => {
  const planted = readPlantedDefects(CHECKOUT_CONFIG);

  it("finds the right planted defect from a German report", () => {
    const matches = rankMatches(
      report({
        summary: "Rabatt fehlt in der Summe",
        steps: "1. Coupon anwenden\n2. Cart Summary ansehen",
        actual: "Der Discount wird im Total ignoriert",
      }),
      planted,
    );
    expect(matches[0]?.defect.code).toBe("TOTAL_IGNORES_DISCOUNT");
  });

  it("treats naming the code outright as proof, not evidence", () => {
    const matches = rankMatches(
      report({ summary: "QTY_ACCEPTS_NEGATIVE" }),
      planted,
    );
    expect(matches[0]?.defect.code).toBe("QTY_ACCEPTS_NEGATIVE");
    expect(matches[0]?.score).toBe(1);
    expect(matches[0]?.namedExactly).toBe(true);
  });

  it("still surfaces a decoy, so the trainer can see a known non-bug was reported", () => {
    const matches = rankMatches(
      report({ summary: "Image load is slow", actual: "Slow image load" }),
      planted,
    );
    expect(matches[0]?.defect.code).toBe("SLOW_IMAGE_LOAD");
    expect(matches[0]?.defect.decoy).toBe(true);
  });

  it("returns nothing for an unrelated report rather than a weak guess", () => {
    const matches = rankMatches(
      report({ summary: "Die Schriftart im Impressum gefällt mir nicht" }),
      planted,
    );
    expect(matches).toEqual([]);
  });

  it("returns nothing when there is no ground truth at all", () => {
    // hunt_scenarios was empty on the live database when WS-10 was built.
    expect(rankMatches(report({ summary: "Rabatt fehlt" }), [])).toEqual([]);
  });

  it("returns nothing for an empty report", () => {
    expect(rankMatches(EMPTY_DEFECT, planted)).toEqual([]);
  });

  it("never scores below the suggestion floor", () => {
    for (const match of rankMatches(report({ summary: "Coupon Cart" }), planted)) {
      expect(match.score).toBeGreaterThanOrEqual(MIN_SUGGESTION_SCORE);
    }
  });

  it("does not punish a thorough report for being thorough", () => {
    const terse = report({ summary: "Discount ignored in total" });
    const thorough = report({
      summary: "Discount ignored in total",
      steps: "1. Artikel in den Warenkorb legen\n2. Gutschein eingeben\n3. Summe prüfen",
      expected: "Die Summe sinkt um den Gutscheinwert",
      actual: "Die Summe bleibt unverändert",
      description: "Tritt bei jedem Gutschein auf, unabhängig vom Betrag",
    });
    const terseTop = rankMatches(terse, planted)[0];
    const thoroughTop = rankMatches(thorough, planted)[0];
    // Both must actually match — a terse but correct report scoring below the
    // floor is the bug that produced CODE_TOKEN_WEIGHT.
    expect(terseTop?.defect.code).toBe("TOTAL_IGNORES_DISCOUNT");
    expect(thoroughTop?.defect.code).toBe("TOTAL_IGNORES_DISCOUNT");
    // Weighted coverage, not Jaccard: the extra words must not dilute the score.
    expect(thoroughTop?.score ?? 0).toBeGreaterThanOrEqual(terseTop?.score ?? 0);
  });

  it("caps the list, because a long list is homework rather than a shortcut", () => {
    const many = readPlantedDefects({
      planted: Array.from({ length: 10 }, (_, i) => ({
        code: `TOTAL_IGNORES_DISCOUNT_${i}`,
      })),
    });
    expect(rankMatches(report({ summary: "total ignores discount" }), many).length).toBe(3);
  });
});

describe("describeCompleteness", () => {
  it("holds the same bar as isDefectComplete — the original five only", () => {
    const filled = report({
      summary: "s",
      sourceUri: "https://example.test",
      steps: "1",
      expected: "e",
      actual: "a",
    });
    const result = describeCompleteness(filled);
    // The four WS-10 added are absent, and that must not make it incomplete:
    // requiring them would block a submit that used to succeed.
    expect(result.complete).toBe(true);
    expect(result.missingRequired).toEqual([]);
  });

  it("names exactly what is missing", () => {
    const result = describeCompleteness(report({ summary: "s" }));
    expect(result.complete).toBe(false);
    expect(result.missingRequired).toEqual(["sourceUri", "steps", "expected", "actual"]);
  });

  it("reports optional fields as present without making them required", () => {
    const result = describeCompleteness(report({ labels: ["ui"], screenshotIds: ["x"] }));
    const labels = result.fields.find((f) => f.field === "labels");
    expect(labels).toEqual({ field: "labels", present: true, required: false });
  });

  it("treats whitespace as absent", () => {
    expect(describeCompleteness(report({ summary: "   " })).missingRequired).toContain(
      "summary",
    );
  });
});

describe("describeGroundTruth", () => {
  const scenario = { expectedFindings: 3 } as HuntScenario;
  const finding = (overrides: Partial<HuntFinding>): HuntFinding => ({
    id: "f",
    attemptId: "a",
    submissionId: "s",
    scenarioId: null,
    reportedSummary: "",
    plantedCode: null,
    verdict: "pending",
    severity: null,
    decidedAt: null,
    ...overrides,
  });

  it("counts confirmed and bonus, and ignores pending", () => {
    const truth = describeGroundTruth(
      [
        finding({ id: "1", verdict: "confirmed", plantedCode: "TOTAL_IGNORES_DISCOUNT" }),
        finding({ id: "2", verdict: "bonus" }),
        finding({ id: "3", verdict: "pending" }),
        finding({ id: "4", verdict: "invalid" }),
      ],
      readPlantedDefects(CHECKOUT_CONFIG),
      scenario,
    );
    expect(truth.found).toBe(2);
    expect(truth.expected).toBe(3);
    expect(truth.complete).toBe(false);
  });

  it("never lists a decoy as outstanding", () => {
    const truth = describeGroundTruth([], readPlantedDefects(CHECKOUT_CONFIG), scenario);
    expect(truth.outstanding.map((d) => d.code)).toEqual([
      "TOTAL_IGNORES_DISCOUNT",
      "QTY_ACCEPTS_NEGATIVE",
    ]);
  });

  it("drops a confirmed defect off the outstanding list", () => {
    const truth = describeGroundTruth(
      [finding({ verdict: "confirmed", plantedCode: "TOTAL_IGNORES_DISCOUNT" })],
      readPlantedDefects(CHECKOUT_CONFIG),
      scenario,
    );
    expect(truth.outstanding.map((d) => d.code)).toEqual(["QTY_ACCEPTS_NEGATIVE"]);
  });

  it("takes expected from the scenario, not from counting planted defects", () => {
    // A scenario may plant more than it demands — that is how a hunt stays
    // passable while still rewarding the student who keeps digging.
    const truth = describeGroundTruth([], readPlantedDefects(CHECKOUT_CONFIG), {
      expectedFindings: 1,
    } as HuntScenario);
    expect(truth.expected).toBe(1);
  });

  it("falls back to the non-decoy count when there is no scenario row", () => {
    const truth = describeGroundTruth([], readPlantedDefects(CHECKOUT_CONFIG), null);
    expect(truth.expected).toBe(2);
  });

  it("lets a learner exceed the target with bonus findings", () => {
    const truth = describeGroundTruth(
      [
        finding({ id: "1", verdict: "bonus" }),
        finding({ id: "2", verdict: "bonus" }),
      ],
      readPlantedDefects(CHECKOUT_CONFIG),
      { expectedFindings: 1 } as HuntScenario,
    );
    expect(truth.found).toBe(2);
    expect(truth.complete).toBe(true);
  });
});
