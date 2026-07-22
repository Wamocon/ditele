import type { Metadata } from "next";
import { PageHeader } from "@/shared/layout";
import { ErrorState } from "@/shared/ui";
import { getTaskWorkspace } from "@/shared/data/learning";
import { TaskWorkspace } from "@/features/learning/task-workspace";
import { getArenaMessages } from "@/features/arena/rewards/i18n";

/**
 * ⭐ Where an Arena task is played — AUTHORING_AND_FLOW §5.5, "an Arena row
 * sends the learner to Arena, a course row opens the task".
 *
 * Until this route existed that sentence was true of the tasks LIST and false
 * of everything else: the Arena hub's own "Jagden" links, and the "play the
 * hunt" button on a locked course task, both went to `/learn/tasks/<id>`, so a
 * learner who clicked a Jagd inside the Arena landed on a page headed
 * **Aufgabe**. Two entry points into the Arena, and both of them left it.
 *
 * The workspace underneath is deliberately the SAME component. A hunt is a
 * `tasks` row and its attempt, draft, defect report and submission are the
 * ordinary ones — duplicating that here would mean two answer boxes and two
 * submit paths to keep in step, which is how the two halves of a feature start
 * disagreeing. What this route changes is the frame: the URL stays in the
 * Arena, the breadcrumb reads Arena, and the back link goes to the Arena hub
 * rather than to the course.
 *
 * `getTaskWorkspace` returns not-found for a task the learner may not open —
 * that is `get_my_learning_task` refusing a LOCKED task, by design — so the
 * error state here is a real answer and not a fallback. `listOpenHunts` no
 * longer offers locked hunts, so reaching it should now mean a hand-typed or
 * stale URL.
 */

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const messages = await getArenaMessages(locale);
  return { title: `${messages.arena.rewards.title} · DiTeLe` };
}

export default async function Page({
  params,
}: {
  params: Promise<{ locale: string; taskId: string }>;
}) {
  const { locale, taskId } = await params;
  const messages = await getArenaMessages(locale);
  const arenaTitle = messages.arena.rewards.title;
  const arenaHref = `/${locale}/learn/arena`;

  const result = await getTaskWorkspace(taskId, locale);

  if (!result.ok) {
    return (
      <>
        <PageHeader
          title={arenaTitle}
          breadcrumbs={[{ label: arenaTitle, href: arenaHref }]}
          locale={locale}
        />
        <ErrorState error={result.error} locale={locale} />
      </>
    );
  }

  const { task, attempt, draft } = result.data;

  return (
    <>
      <PageHeader
        title={task.title}
        breadcrumbs={[{ label: arenaTitle, href: arenaHref }, { label: task.title }]}
        locale={locale}
      />
      <TaskWorkspace
        locale={locale}
        task={task}
        attempt={attempt}
        draft={draft}
        // Back to the Arena, not to the course: this learner came from the
        // Arena and the hub is where the rest of their hunts are.
        courseHref={arenaHref}
      />
    </>
  );
}
