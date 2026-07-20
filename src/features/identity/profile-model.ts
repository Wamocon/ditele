import { z } from "zod";

import { isLocale, type Locale } from "@/shared/i18n/config";

const timestampSchema = z.string().min(1).transform((value, context) => {
  const timestamp = new Date(value);
  if (Number.isNaN(timestamp.valueOf())) {
    context.addIssue({ code: "custom", message: "Invalid timestamp" });
    return z.NEVER;
  }
  return timestamp.toISOString();
});

export const profileDatabaseRowSchema = z.object({
  user_id: z.string().uuid(),
  display_name: z.string().max(160),
  locale: z.enum(["en", "de", "ru"]),
  timezone: z.string().min(1).max(100),
  row_version: z.number().int().positive(),
  updated_at: timestampSchema,
});

export type LearnerProfile = {
  readonly userId: string;
  readonly displayName: string;
  readonly locale: Locale;
  readonly timezone: string;
  readonly rowVersion: number;
  readonly updatedAt: string;
};

export type ProfileActionState = {
  readonly status: "idle" | "error" | "conflict";
  readonly message: string;
  readonly fieldErrors?: Readonly<{
    displayName?: string;
    locale?: string;
    timezone?: string;
  }>;
};

export const profileActionInitialState: ProfileActionState = {
  status: "idle",
  message: "",
};

export function isValidIanaTimezone(value: string): boolean {
  if (value.length < 1 || value.length > 100) return false;
  try {
    new Intl.DateTimeFormat("en", { timeZone: value }).format(0);
    return true;
  } catch {
    return false;
  }
}

export const updateProfileInputSchema = z.object({
  displayName: z.string().trim().min(1).max(160),
  locale: z.string().refine(isLocale),
  timezone: z.string().trim().refine(isValidIanaTimezone),
  expectedVersion: z.coerce.number().int().positive(),
  idempotencyKey: z.string().trim().min(16).max(200),
});

export type UpdateProfileInput = z.infer<typeof updateProfileInputSchema> & {
  readonly locale: Locale;
};

export function projectLearnerProfile(input: unknown): LearnerProfile {
  const row = profileDatabaseRowSchema.parse(input);
  return {
    userId: row.user_id,
    displayName: row.display_name,
    locale: row.locale,
    timezone: row.timezone,
    rowVersion: row.row_version,
    updatedAt: row.updated_at,
  };
}

export function parseUpdateProfileForm(formData: FormData): UpdateProfileInput {
  const parsed = updateProfileInputSchema.parse({
    displayName: formData.get("displayName"),
    locale: formData.get("locale"),
    timezone: formData.get("timezone"),
    expectedVersion: formData.get("expectedVersion"),
    idempotencyKey: formData.get("idempotencyKey"),
  });
  if (!isLocale(parsed.locale)) throw new Error("profile.invalid_locale");
  return { ...parsed, locale: parsed.locale };
}
