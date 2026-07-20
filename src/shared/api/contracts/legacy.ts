import { z } from "zod";

export const legacyEnvelopeSchema = z.object({
  status: z.number().int(),
  message: z.unknown(),
});

export const legacyGroupSchema = z.object({
  id: z.number().int().positive(),
  is_active: z.union([z.literal(0), z.literal(1), z.null()]),
});

export const legacySolvingSchema = z.object({
  id: z.number().int().positive(),
  solving_status: z.union([
    z.literal(0),
    z.literal(1),
    z.literal(2),
    z.null(),
  ]).optional(),
});

export const legacyQuestionSchema = z.object({
  id: z.number().int().positive(),
  is_answered: z.boolean(),
  trainer_id: z.number().int().positive().nullable().optional(),
});

