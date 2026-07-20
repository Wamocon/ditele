import { randomUUID } from "node:crypto";

import { notFound } from "next/navigation";
import { z } from "zod";

import { isLocale } from "@/shared/i18n/config";

import { readContentStudioAccess } from "../../../access";
import { adminContentCopy } from "../../../copy";
import { readAdminContentVersion, readContentArchiveImpact } from "../../../data";
import { ContentPermissionDenied, ContentVersionDetailView } from "../../../views";
import {
  archiveContentVersionAction,
  decideContentReviewAction,
  publishContentVersionAction,
  submitContentForReviewAction,
} from "./actions";
import { ContentLifecyclePanel, type LifecycleNotice } from "./lifecycle-panel";

const lifecycleNoticeSchema = z.enum([
  "stale",
  "submitted",
  "review_approved",
  "changes_requested",
  "published",
  "archived",
]);

export default async function AdminContentVersionPage({
  params,
  searchParams,
}: {
  readonly params: Promise<{ locale: string; courseId: string; versionId: string }>;
  readonly searchParams: Promise<{ notice?: string | string[] }>;
}) {
  const [{ locale, courseId, versionId }, query] = await Promise.all([params, searchParams]);
  const uuid = z.string().uuid();
  if (!isLocale(locale) || !uuid.safeParse(courseId).success || !uuid.safeParse(versionId).success) notFound();
  const path = `/${locale}/admin/courses/${courseId}/versions/${versionId}`;
  const access = await readContentStudioAccess(locale, path);
  const labels = adminContentCopy[locale];
  if (!access.canManage) return <ContentPermissionDenied labels={labels} />;
  const projection = await readAdminContentVersion(access.principal, courseId, versionId, locale, "admin");
  if (!projection) notFound();
  const impact = projection.version.state === "published" && access.canPublish
    ? await readContentArchiveImpact(
        access.principal,
        versionId,
        courseId,
        projection.version.rowVersion,
      )
    : null;
  const parsedNotice = lifecycleNoticeSchema.safeParse(query.notice);
  const notice: LifecycleNotice | null = parsedNotice.success ? parsedNotice.data : null;
  return (
    <ContentVersionDetailView
      labels={labels}
      lifecyclePanel={(
        <ContentLifecyclePanel
          actions={{
            archive: archiveContentVersionAction,
            publish: publishContentVersionAction,
            review: decideContentReviewAction,
            submit: submitContentForReviewAction,
          }}
          canManage={access.canManage}
          canPublish={access.canPublish}
          courseId={courseId}
          impact={impact}
          keys={{
            archive: `content-archive:${randomUUID()}`,
            publish: `content-publish:${randomUUID()}`,
            review: `content-review:${randomUUID()}`,
            submit: `content-submit:${randomUUID()}`,
          }}
          locale={locale}
          notice={notice}
          version={projection.version}
        />
      )}
      locale={locale}
      projection={projection}
    />
  );
}
