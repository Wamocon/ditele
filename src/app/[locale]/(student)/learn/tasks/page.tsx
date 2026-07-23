import type { Metadata } from "next";
import { PageHeader } from "@/shared/layout";
import { ErrorState } from "@/shared/ui";
import { listMyTasks } from "@/shared/data/learning";
import { TasksView } from "@/features/learning/tasks-view";

export const metadata: Metadata = { title: "Aufgaben · DiTeLe" };

export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const result = await listMyTasks();

  if (!result.ok) {
    return (
      <>
        <PageHeader title="Aufgaben" locale={locale} />
        <ErrorState error={result.error} locale={locale} />
      </>
    );
  }

  return <TasksView locale={locale} tasks={result.data} />;
}
