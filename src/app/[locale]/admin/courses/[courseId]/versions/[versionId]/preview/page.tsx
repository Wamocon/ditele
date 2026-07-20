import { notFound } from "next/navigation";
import { z } from "zod";

import { isLocale } from "@/shared/i18n/config";

import { readContentStudioAccess } from "../../../../access";
import { adminContentCopy } from "../../../../copy";
import { readAdminContentVersion } from "../../../../data";
import { ContentPermissionDenied, ContentVersionPreviewView } from "../../../../views";
import type { PreviewRole } from "../../../../model";

const previewRoleSchema = z.enum(["learner", "trainer", "admin"]);

export default async function AdminContentVersionPreviewPage({
  params,
  searchParams,
}: {
  readonly params: Promise<{ locale: string; courseId: string; versionId: string }>;
  readonly searchParams: Promise<{ role?: string | string[] }>;
}) {
  const [{ locale, courseId, versionId }, query] = await Promise.all([params, searchParams]);
  const uuid = z.string().uuid();
  if (!isLocale(locale) || !uuid.safeParse(courseId).success || !uuid.safeParse(versionId).success) notFound();
  const roleResult = previewRoleSchema.safeParse(query.role);
  const role: PreviewRole = roleResult.success ? roleResult.data : "learner";
  const path = `/${locale}/admin/courses/${courseId}/versions/${versionId}/preview?role=${role}`;
  const access = await readContentStudioAccess(locale, path);
  const labels = adminContentCopy[locale];
  if (!access.canManage) return <ContentPermissionDenied labels={labels} />;
  const projection = await readAdminContentVersion(access.principal, courseId, versionId, locale, role);
  if (!projection) notFound();
  return <ContentVersionPreviewView labels={labels} locale={locale} projection={projection} />;
}
