import type { Metadata } from "next";
import Link from "next/link";
import type { Route } from "next";
import { PageHeader } from "@/shared/layout";
import { Button, EmptyState, ErrorState } from "@/shared/ui";
import {
  getMyLearningCourse,
  listMyLearningCourses,
  type LearningActivity,
} from "@/shared/data/learning";
import { TaskListItem } from "@/features/learning/stage-list";
import { learnStrings } from "@/features/learning/i18n";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const s = learnStrings(locale);
  return { title: `${s.tasks.title} · DiTeLe`, description: s.tasks.description };
}

/**
 * Every task from every enrolled course in one list, open work first.
 *
 * The "Aufgaben" tab exists in `nav-config.ts` but not in the WS-2 brief's
 * four routes; it is inside this workstream's tree, so it is built rather than
 * left as a stub. There is no cross-course task RPC, so the curriculum is
 * fetched per course — in parallel, never in a waterfall (MASTER_PLAN §13.4).
 */
const ORDER = [
  "in_progress",
  "revision_required",
  "available",
  "resubmitted",
  "submitted",
  "accepted",
  "completed",
];

function rank(activity: LearningActivity): number {
  if (activity.locked) return ORDER.length + 1;
  const index = ORDER.indexOf(activity.state);
  return index === -1 ? ORDER.length : index;
}

export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const s = learnStrings(locale);

  const courses = await listMyLearningCourses(locale);
  if (!courses.ok) {
    return (
      <>
        <PageHeader title={s.tasks.title} />
        <ErrorState message={courses.error.message} locale={locale} />
      </>
    );
  }

  const details = await Promise.all(
    courses.data.map((course) => getMyLearningCourse(course.courseId, locale))
  );

  const rows = details
    .flatMap((detail) =>
      detail.ok
        ? detail.data.stages.flatMap((stage) =>
            stage.activities.map((activity) => ({
              activity,
              courseTitle: detail.data.title,
            }))
          )
        : []
    )
    .sort((a, b) => rank(a.activity) - rank(b.activity));

  return (
    <>
      <PageHeader title={s.tasks.title} description={s.tasks.description} />

      {rows.length === 0 ? (
        <EmptyState
          title={s.tasks.emptyTitle}
          description={s.tasks.emptyDescription}
          action={
            <Link href={`/${locale}/learn/courses` as Route}>
              <Button>{s.tasks.emptyAction}</Button>
            </Link>
          }
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map(({ activity, courseTitle }) => (
            <TaskListItem
              key={activity.id}
              activity={activity}
              locale={locale}
              strings={s.course}
              courseTitle={courseTitle}
            />
          ))}
        </ul>
      )}
    </>
  );
}
