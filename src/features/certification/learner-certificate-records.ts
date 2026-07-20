import { z } from "zod";

import type { Locale } from "@/shared/i18n/config";

const CourseLocalizationDatabaseRowSchema = z.object({
  locale: z.string().min(1),
  title: z.string().trim().min(1),
});

const CourseDatabaseRowSchema = z.object({
  course_localizations: z.array(CourseLocalizationDatabaseRowSchema),
});

export const LearnerCertificateDatabaseRowSchema = z.object({
  id: z.string().uuid(),
  state: z.enum(["eligible", "issued", "available", "revoked", "expired"]),
  certificate_type: z.enum(["course_completion", "exam", "competency"]),
  course_id: z.string().uuid().nullable(),
  issued_at: z.string().datetime({ offset: true }).nullable(),
  available_at: z.string().datetime({ offset: true }).nullable(),
  expires_at: z.string().datetime({ offset: true }).nullable(),
  revoked_at: z.string().datetime({ offset: true }).nullable(),
  created_at: z.string().datetime({ offset: true }),
  courses: CourseDatabaseRowSchema.nullable(),
});

export const LearnerCertificateRecordSchema = z.object({
  id: z.string().uuid(),
  state: LearnerCertificateDatabaseRowSchema.shape.state,
  type: LearnerCertificateDatabaseRowSchema.shape.certificate_type,
  courseTitle: z.string().nullable(),
  issuedAt: z.string().datetime({ offset: true }).nullable(),
  availableAt: z.string().datetime({ offset: true }).nullable(),
  expiresAt: z.string().datetime({ offset: true }).nullable(),
  revokedAt: z.string().datetime({ offset: true }).nullable(),
  createdAt: z.string().datetime({ offset: true }),
});

export type LearnerCertificateRecord = z.infer<
  typeof LearnerCertificateRecordSchema
>;

export function resolveCourseTitle(
  translations: readonly z.infer<typeof CourseLocalizationDatabaseRowSchema>[],
  locale: Locale,
): string | null {
  return translations.find((item) => item.locale === locale)?.title ??
    translations.find((item) => item.locale === "en")?.title ??
    translations[0]?.title ??
    null;
}

export function buildLearnerCertificateRecords(
  rawRows: unknown,
  locale: Locale,
): LearnerCertificateRecord[] {
  const rows = z.array(LearnerCertificateDatabaseRowSchema).parse(rawRows);
  return z.array(LearnerCertificateRecordSchema).parse(
    rows.map((row) => ({
      id: row.id,
      state: row.state,
      type: row.certificate_type,
      courseTitle: row.courses
        ? resolveCourseTitle(row.courses.course_localizations, locale)
        : null,
      issuedAt: row.issued_at,
      availableAt: row.available_at,
      expiresAt: row.expires_at,
      revokedAt: row.revoked_at,
      createdAt: row.created_at,
    })),
  );
}
