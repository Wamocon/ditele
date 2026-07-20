import { z } from "zod";

import type { Locale } from "@/shared/i18n/config";

const LocalizedTextSchema = z.record(z.string().min(1), z.string());

export const LearnerSkillDatabaseRowSchema = z.object({
  id: z.string().uuid(),
  code: z.string().trim().min(1),
  labels: LocalizedTextSchema,
  descriptions: LocalizedTextSchema,
  taxonomy_version: z.number().int().positive(),
});

export const LearnerMasteryDatabaseRowSchema = z.object({
  learner_id: z.string().uuid(),
  skill_id: z.string().uuid(),
  mastery_basis_points: z.number().int().min(0).max(10_000),
  rule_version: z.number().int().positive(),
  updated_at: z.string().datetime({ offset: true }),
});

export const LearnerSkillEdgeDatabaseRowSchema = z.object({
  parent_skill_id: z.string().uuid(),
  child_skill_id: z.string().uuid(),
});

export const LearnerSkillRecordSchema = z.object({
  id: z.string().uuid(),
  code: z.string().min(1),
  title: z.string().min(1),
  description: z.string(),
  taxonomyVersion: z.number().int().positive(),
  mastery: z.object({
    basisPoints: z.number().int().min(0).max(10_000),
    ruleVersion: z.number().int().positive(),
    updatedAt: z.string().datetime({ offset: true }),
  }).nullable(),
  prerequisites: z.array(z.object({
    id: z.string().uuid(),
    title: z.string().min(1),
  })),
});

export type LearnerSkillRecord = z.infer<typeof LearnerSkillRecordSchema>;

export const LearnerSkillCollectionSchema = z.object({
  skills: z.array(LearnerSkillRecordSchema),
  prerequisiteRelationshipsVisible: z.boolean(),
});

export type LearnerSkillCollection = z.infer<typeof LearnerSkillCollectionSchema>;

export function resolveLocalizedText(
  translations: Readonly<Record<string, string>>,
  locale: Locale,
  fallback: string,
): string {
  const requested = translations[locale]?.trim();
  if (requested) return requested;

  const english = translations.en?.trim();
  if (english) return english;

  for (const value of Object.values(translations)) {
    const candidate = value.trim();
    if (candidate) return candidate;
  }
  return fallback;
}

export function buildLearnerSkillCollection(
  rawSkills: unknown,
  rawMastery: unknown,
  rawEdges: unknown,
  prerequisiteRelationshipsVisible: boolean,
  locale: Locale,
): LearnerSkillCollection {
  const skillRows = z.array(LearnerSkillDatabaseRowSchema).parse(rawSkills);
  const masteryRows = z.array(LearnerMasteryDatabaseRowSchema).parse(rawMastery);
  const edgeRows = z.array(LearnerSkillEdgeDatabaseRowSchema).parse(rawEdges);
  const masteryBySkill = new Map(
    masteryRows.map((row) => [row.skill_id, row] as const),
  );
  const skillById = new Map(skillRows.map((row) => [row.id, row] as const));
  const prerequisiteIdsBySkill = new Map<string, string[]>();

  for (const edge of edgeRows) {
    const existing = prerequisiteIdsBySkill.get(edge.child_skill_id) ?? [];
    existing.push(edge.parent_skill_id);
    prerequisiteIdsBySkill.set(edge.child_skill_id, existing);
  }

  return LearnerSkillCollectionSchema.parse({
    prerequisiteRelationshipsVisible,
    skills: skillRows.map((skill) => {
      const mastery = masteryBySkill.get(skill.id);
      const prerequisites = (prerequisiteIdsBySkill.get(skill.id) ?? [])
        .map((prerequisiteId) => skillById.get(prerequisiteId))
        .filter((item): item is z.infer<typeof LearnerSkillDatabaseRowSchema> =>
          item !== undefined
        )
        .map((prerequisite) => ({
          id: prerequisite.id,
          title: resolveLocalizedText(
            prerequisite.labels,
            locale,
            prerequisite.code,
          ),
        }));

      return {
        id: skill.id,
        code: skill.code,
        title: resolveLocalizedText(skill.labels, locale, skill.code),
        description: resolveLocalizedText(skill.descriptions, locale, ""),
        taxonomyVersion: skill.taxonomy_version,
        mastery: mastery
          ? {
              basisPoints: mastery.mastery_basis_points,
              ruleVersion: mastery.rule_version,
              updatedAt: mastery.updated_at,
            }
          : null,
        prerequisites,
      };
    }),
  });
}
