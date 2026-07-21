import type { Route } from "next";
import Link from "next/link";
import { PageHeader } from "@/shared/layout";
import { Button, ErrorState } from "@/shared/ui";
import { getStudioWorkspace } from "@/shared/data/content";
import { requireRole } from "@/shared/auth/guard";
import { adminStrings, format } from "@/features/content/i18n";
import { Studio } from "@/features/content/components/studio";

/**
 * ⭐ The Content Studio — the largest screen in the app, and the one the whole
 * authoring workflow runs through. Owned by WS-5.
 */
export default async function Page({
  params,
}: {
  params: Promise<{ locale: string; courseId: string; versionId: string }>;
}) {
  const { locale, courseId, versionId } = await params;
  await requireRole(["admin"], locale);

  const strings = adminStrings(locale);
  const result = await getStudioWorkspace(versionId, locale);

  if (!result.ok) {
    return (
      <>
        <PageHeader title={strings.studio.title} />
        <ErrorState message={result.error.message} />
      </>
    );
  }

  const workspace = result.data;
  const versionLabel = format(strings.studio.versionLabel, { number: workspace.versionNumber });

  return (
    <>
      <PageHeader
        title={workspace.courseTitle}
        description={versionLabel}
        breadcrumbs={[
          { label: strings.courses.title, href: `/${locale}/admin/courses` },
          { label: workspace.courseTitle, href: `/${locale}/admin/courses/${courseId}` },
          { label: versionLabel },
        ]}
        actions={
          <Link href={`/${locale}/admin/courses/${courseId}` as Route}>
            <Button variant="outline">{strings.studio.back}</Button>
          </Link>
        }
      />
      <Studio locale={locale} workspace={workspace} strings={strings} />
    </>
  );
}
