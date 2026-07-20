import "server-only";

import { getPrincipal } from "@/app/[locale]/_data/principal";
import {
  buildLearnerCertificateRecords,
  type LearnerCertificateRecord,
} from "@/features/certification/learner-certificate-records";
import { createServerClient } from "@/shared/database/server";
import type { Locale } from "@/shared/i18n/config";

export async function readLearnerCertificateRecords(
  locale: Locale,
): Promise<LearnerCertificateRecord[]> {
  const [principal, client] = await Promise.all([
    getPrincipal(),
    createServerClient(),
  ]);
  const result = await client
    .from("certificates")
    .select(
      "id, state, certificate_type, course_id, issued_at, available_at, expires_at, revoked_at, created_at, courses(course_localizations(locale, title))",
    )
    .eq("learner_id", principal.userId)
    .order("created_at", { ascending: false });

  if (result.error) {
    throw new Error("certification.learner_records_read_failed", {
      cause: result.error,
    });
  }

  return buildLearnerCertificateRecords(result.data ?? [], locale);
}
