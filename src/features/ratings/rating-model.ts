import { z } from "zod";

import { isLocale, type Locale } from "@/shared/i18n/config";

export type RatingTarget = "course" | "task";

export type RatingActionStatus = "idle" | "success" | "error" | "conflict";

export type RatingActionState = {
  readonly status: RatingActionStatus;
  readonly message: string;
};

export const ratingActionInitialState: RatingActionState = {
  status: "idle",
  message: "",
};

export type ExistingRating = {
  readonly score: number;
  readonly comment: string | null;
  readonly rowVersion: number;
};

const ratingRowSchema = z.object({
  score: z.number().int().min(1).max(5),
  comment: z.string().nullable(),
  row_version: z.number().int().positive(),
});

export function projectExistingRating(input: unknown): ExistingRating | null {
  if (input === null || input === undefined) return null;
  const row = ratingRowSchema.parse(input);
  return { score: row.score, comment: row.comment, rowVersion: row.row_version };
}

export const ratingFormSchema = z.object({
  ratingTarget: z.enum(["course", "task"]),
  targetId: z.string().uuid(),
  score: z.coerce.number().int().min(1).max(5),
  comment: z.preprocess(
    (value) =>
      typeof value === "string" && value.trim().length > 0 ? value.trim() : null,
    z.string().max(2000).nullable(),
  ),
  expectedVersion: z.coerce.number().int().min(0),
  idempotencyKey: z.string().trim().min(16).max(200),
  locale: z.string().refine(isLocale),
});

export type RatingFormInput = z.infer<typeof ratingFormSchema> & {
  readonly locale: Locale;
};

export function parseRatingForm(formData: FormData): RatingFormInput {
  const parsed = ratingFormSchema.parse({
    ratingTarget: formData.get("ratingTarget"),
    targetId: formData.get("targetId"),
    score: formData.get("score"),
    comment: formData.get("comment"),
    expectedVersion: formData.get("expectedVersion"),
    idempotencyKey: formData.get("idempotencyKey"),
    locale: formData.get("locale"),
  });
  if (!isLocale(parsed.locale)) throw new Error("rating.invalid_locale");
  return { ...parsed, locale: parsed.locale };
}
