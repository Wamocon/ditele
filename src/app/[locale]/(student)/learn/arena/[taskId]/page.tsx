import type { Metadata } from "next";
import { PageHeader } from "@/shared/layout";
import { ErrorState } from "@/shared/ui";
import { getMyArenaTask } from "@/shared/data/learning";
import { ArenaTaskWorkspace } from "@/features/learning/arena-task-workspace";

export const metadata: Metadata = { title: "Arena · DiTeLe" };

export default async function Page({
  params,
}: {
  params: Promise<{ locale: string; taskId: string }>;
}) {
  const { locale, taskId } = await params;
  const result = await getMyArenaTask(taskId);

  if (!result.ok) {
    return (
      <>
        <PageHeader title="Arena" breadcrumbs={[{ label: "Arena", href: `/${locale}/learn/arena` }]} locale={locale} />
        <ErrorState error={result.error} locale={locale} />
      </>
    );
  }

  return <ArenaTaskWorkspace locale={locale} data={result.data} arenaHref={`/${locale}/learn/arena`} />;
}
