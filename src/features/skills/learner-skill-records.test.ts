import { describe, expect, it } from "vitest";

import {
  buildLearnerSkillCollection,
  resolveLocalizedText,
} from "./learner-skill-records";

const skillOne = "01980a2a-0000-7000-8000-000000000001";
const skillTwo = "01980a2a-0000-7000-8000-000000000002";
const learnerId = "01980a00-0000-7000-8000-000000000001";

describe("learner skill records", () => {
  it("resolves localized JSON in requested, English, then first-value order", () => {
    expect(resolveLocalizedText({ de: "Deutsch", en: "English" }, "de", "Fallback"))
      .toBe("Deutsch");
    expect(resolveLocalizedText({ de: "Deutsch", en: "English" }, "ru", "Fallback"))
      .toBe("English");
    expect(resolveLocalizedText({ de: "Deutsch" }, "ru", "Fallback"))
      .toBe("Deutsch");
    expect(resolveLocalizedText({ de: "  " }, "ru", "Fallback"))
      .toBe("Fallback");
  });

  it("maps active definitions, exact mastery basis points, and visible prerequisites", () => {
    const result = buildLearnerSkillCollection(
      [
        {
          id: skillOne,
          code: "analysis",
          labels: { en: "Analysis", de: "Analyse" },
          descriptions: { en: "Analyze product risk." },
          taxonomy_version: 2,
        },
        {
          id: skillTwo,
          code: "design",
          labels: { en: "Test design" },
          descriptions: {},
          taxonomy_version: 2,
        },
      ],
      [{
        learner_id: learnerId,
        skill_id: skillTwo,
        mastery_basis_points: 7_625,
        rule_version: 3,
        updated_at: "2026-07-18T10:00:00.000Z",
      }],
      [{
        parent_skill_id: skillOne,
        child_skill_id: skillTwo,
      }],
      true,
      "de",
    );

    expect(result.prerequisiteRelationshipsVisible).toBe(true);
    expect(result.skills[0]).toMatchObject({
      title: "Analyse",
      mastery: null,
    });
    expect(result.skills[1]).toMatchObject({
      title: "Test design",
      description: "",
      mastery: { basisPoints: 7_625, ruleVersion: 3 },
      prerequisites: [{ id: skillOne, title: "Analyse" }],
    });
  });

  it("distinguishes an authoritative empty prerequisite graph from unavailable data", () => {
    const result = buildLearnerSkillCollection(
      [{
        id: skillOne,
        code: "analysis",
        labels: { en: "Analysis" },
        descriptions: {},
        taxonomy_version: 1,
      }],
      [],
      [],
      true,
      "en",
    );

    expect(result).toMatchObject({
      prerequisiteRelationshipsVisible: true,
      skills: [{ mastery: null, prerequisites: [] }],
    });

    const unavailable = buildLearnerSkillCollection(
      [{
        id: skillOne,
        code: "analysis",
        labels: { en: "Analysis" },
        descriptions: {},
        taxonomy_version: 1,
      }],
      [],
      [],
      false,
      "en",
    );
    expect(unavailable.prerequisiteRelationshipsVisible).toBe(false);
  });
});
