import type { Metadata } from "next";
import { PageHeader } from "@/shared/layout";
import { ErrorState } from "@/shared/ui";
import { getTaskWorkspace } from "@/shared/data/learning";
import { TaskWorkspace } from "@/features/learning/task-workspace";
import { learnStrings } from "@/features/learning/i18n";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const s = learnStrings(locale);
  return { title: `${s.task.breadcrumb} · DiTeLe` };
}

/**
 * ⭐⭐ The task workspace route — WS-2's signature screen.
 *
 * A Server Component that fetches and hands off: the task, its newest attempt
 * and that attempt's draft all come from one `getTaskWorkspace` call, and
 * everything interactive lives in the client component below it. Nothing here
 * touches Supabase directly (MASTER_PLAN §13.1).
 */
export default async function Page({
  params,
}: {
  params: Promise<{ locale: string; taskId: string }>;
}) {
  const { locale, taskId } = await params;
  const s = learnStrings(locale);
  const result = await getTaskWorkspace(taskId, locale);

  if (!result.ok) {
    return (
      <>
        <PageHeader title={s.task.breadcrumb} />
        <ErrorState message={result.error.message} locale={locale} />
      </>
    );
  }

  const { task, attempt, draft } = result.data;
  const courseHref = task.courseId
    ? `/${locale}/learn/courses/${task.courseId}`
    : `/${locale}/learn/courses`;

  return (
    <>
      <PageHeader
        title={task.title}
        breadcrumbs={[
          { label: s.courses.title, href: `/${locale}/learn/courses` },
          ...(task.courseId ? [{ label: s.course.breadcrumb, href: courseHref }] : []),
          { label: task.title },
        ]}
      />
      <TaskWorkspace
        locale={locale}
        task={task}
        attempt={attempt}
        draft={draft}
        courseHref={courseHref}
      />
    </>
  );
}
