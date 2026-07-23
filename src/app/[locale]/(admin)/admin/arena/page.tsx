import { PageHeader } from "@/shared/layout";
import { ErrorState } from "@/shared/ui";
import { requireRole } from "@/shared/auth/guard";
import { listArenaTasks, listBadges } from "@/shared/data/admin";
import { ArenaTasksManager } from "@/features/admin/arena-manager";

export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  await requireRole(["admin"], locale);

  const [tasksResult, badgesResult] = await Promise.all([listArenaTasks(), listBadges()]);

  const header = (
    <PageHeader
      title="Arena"
      description="Globale Bug-Hunt-Aufgaben in fester Reihenfolge. Aufgabe #n wird freigeschaltet, sobald #(n−1) angenommen ist."
      locale={locale}
    />
  );

  if (!tasksResult.ok) {
    return (
      <>
        {header}
        <ErrorState message={tasksResult.error.message} />
      </>
    );
  }

  // A failed badge read leaves the picker with only its "no badge" option rather
  // than taking the whole authoring screen down.
  const badges = badgesResult.ok ? badgesResult.data : [];

  return (
    <>
      {header}
      <ArenaTasksManager locale={locale} tasks={tasksResult.data} badges={badges} />
    </>
  );
}
